"use server";

/**
 * Auth server actions: registration (creates personal organization),
 * with brute-force-resistant rate limits and audit logging.
 */
import bcrypt from "bcryptjs";
import { z } from "zod";
import { headers } from "next/headers";
import connectDB from "@/lib/db";
import { Organization, OrganizationMember, Subscription, User, ensurePlansSeeded, writeAudit, monthlyPeriodFor } from "@/models";
import { actionSuccess, actionError, type ActionResponse } from "@/lib/utils";
import { AppError, ValidationError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";

const RegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters.").max(100),
  email: z.string().email("Invalid email address.").max(200),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters.")
    .max(128)
    .regex(/[a-z]/, "Password must include a lowercase letter.")
    .regex(/[A-Z]/, "Password must include an uppercase letter.")
    .regex(/[0-9]/, "Password must include a number."),
});

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

export async function register(data: {
  name: string;
  email: string;
  password: string;
}): Promise<ActionResponse<boolean>> {
  try {
    const ip = await clientIp();
    const rl = await enforceRateLimit("register", ip, 5, 600);
    if (!rl.allowed) {
      return { success: false, error: `Too many registration attempts. Try again in ${rl.retryAfterSec}s.`, code: "RATE_LIMITED" };
    }

    const parsed = RegisterSchema.safeParse(data);
    if (!parsed.success) {
      return actionError(ValidationError(parsed.error.errors[0].message));
    }

    await connectDB();
    await ensurePlansSeeded();

    const email = parsed.data.email.toLowerCase();
    const exists = await User.findOne({ email }).lean<{ _id: unknown } | null>();
    if (exists) {
      return actionError(new AppError("CONFLICT", "An account with this email already exists."));
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await User.create({
      name: parsed.data.name,
      email,
      passwordHash,
    });

    // Every new user gets a personal organization so the product is usable instantly.
    const orgName =
      parsed.data.name.includes(" ")
        ? `${parsed.data.name.split(" ")[0]}'s Workspace`
        : `${parsed.data.name}'s Workspace`;
    const org = await Organization.create({
      name: orgName.slice(0, 120),
      ownerId: user._id,
    });
    await OrganizationMember.create({
      orgId: org._id,
      userId: user._id,
      role: "owner",
    });
    const { start, end } = monthlyPeriodFor();
    await Subscription.create({
      orgId: org._id,
      planKey: "free",
      status: "active",
      currentPeriodStart: start,
      currentPeriodEnd: end,
    });

    await writeAudit({
      actorUserId: String(user._id),
      action: "auth.register",
      resourceType: "user",
      resourceId: String(user._id),
      metadata: { orgId: String(org._id) },
      ip,
    });

    return actionSuccess(true);
  } catch (error) {
    return actionError(error);
  }
}
