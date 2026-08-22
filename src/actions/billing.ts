"use server";

/**
 * Billing actions: plan overview, manual plan changes (self-serve upgrade
 * path until a payment provider is configured), cancellation semantics.
 *
 * PAYMENT PROVIDER NOTE: Stripe integration is abstracted behind this module;
 * without provider credentials, plan changes are recorded as "manual" and no
 * payment is ever simulated.
 */
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import { Plan, Subscription, UsageLedger, ensurePlansSeeded, getUsage, monthlyPeriodFor, writeAudit } from "@/models";
import { requireOrgRole } from "@/lib/auth/dal";
import { actionSuccess, actionError, type ActionResponse } from "@/lib/utils";
import { ValidationError } from "@/lib/errors";
import type { BillingOverviewDTO } from "@/types/dto";

export async function getBillingOverview(): Promise<ActionResponse<BillingOverviewDTO>> {
  try {
    const ctx = await requireOrgRole("admin");
    await connectDB();
    await ensurePlansSeeded();

    const subscription = await Subscription.findOne({ orgId: ctx.orgId }).lean<{
      planKey: string; status: string; currentPeriodEnd: Date; cancelAtPeriodEnd: boolean;
    } | null>();

    const planKey = subscription?.planKey ?? "free";
    const plan = await Plan.findOne({ key: planKey }).lean<{
      name: string; monthlyPriceCents: number; currency: string; limits: BillingOverviewDTO["limits"];
    } | null>();
    if (!plan) throw ValidationError("Plan configuration missing.");

    const jobsUsed = await getUsage(ctx.orgId, "jobs", ctx.periodKey);
    const storageUsed = await getUsage(ctx.orgId, "storage_bytes", "all");
    const rowsAnalyzed = await getUsage(ctx.orgId, "rows_analyzed", ctx.periodKey);

    const plans = await Plan.find({ isActive: true, isPublic: true })
      .sort({ monthlyPriceCents: 1 })
      .lean<Array<{ key: string; name: string; monthlyPriceCents: number }>>();

    return actionSuccess({
      planKey,
      planName: plan.name,
      monthlyPriceCents: plan.monthlyPriceCents,
      currency: plan.currency,
      status: subscription?.status ?? "active",
      currentPeriodEnd: (subscription?.currentPeriodEnd ?? new Date()).toISOString(),
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      limits: plan.limits,
      usage: {
        jobsThisMonth: jobsUsed,
        storageBytes: storageUsed,
        rowsAnalyzedThisMonth: rowsAnalyzed,
      },
      availablePlans: plans.map((p) => ({ key: p.key, name: p.name, monthlyPriceCents: p.monthlyPriceCents })),
    });
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Manual plan change. When a payment provider is integrated this becomes a
 * checkout-session creation; today it records the change with audit trail and
 * NEVER pretends a payment occurred.
 */
export async function requestPlanChange(planKey: string): Promise<ActionResponse<{ requiresPaymentSetup: boolean }>> {
  try {
    const ctx = await requireOrgRole("owner");
    await connectDB();

    if (planKey !== "free" && planKey !== "pro") {
      throw ValidationError("Unknown plan.");
    }

    const now = new Date();
    const { start, end } = monthlyPeriodFor(now);

    await Subscription.updateOne(
      { orgId: ctx.orgId },
      {
        $set: {
          planKey,
          status: "active",
          currentPeriodStart: start,
          currentPeriodEnd: end,
          cancelAtPeriodEnd: false,
          provider: "manual",
        },
      },
      { upsert: true }
    );

    await writeAudit({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: "subscription.changed",
      resourceType: "subscription",
      metadata: { newPlan: planKey, provider: "manual", note: "No payment was processed — payment provider not configured." },
    });

    revalidatePath("/dashboard/billing");
    return actionSuccess(
      { requiresPaymentSetup: true },
      `Plan set to "${planKey}". Note: payment processing is not yet configured — this change was applied manually.`
    );
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelSubscription(): Promise<ActionResponse<boolean>> {
  try {
    const ctx = await requireOrgRole("owner");
    await connectDB();

    await Subscription.updateOne({ orgId: ctx.orgId }, { $set: { cancelAtPeriodEnd: true } });

    await writeAudit({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: "subscription.changed",
      resourceType: "subscription",
      metadata: { cancelAtPeriodEnd: true },
    });

    revalidatePath("/dashboard/billing");
    return actionSuccess(true, "Subscription will not renew at period end.");
  } catch (error) {
    return actionError(error);
  }
}

void UsageLedger;
