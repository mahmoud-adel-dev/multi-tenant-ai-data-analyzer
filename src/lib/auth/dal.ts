/**
 * Data Access Layer — the ONLY sanctioned way to reach tenant-scoped data.
 *
 * Authorization is always resolved fresh from the database on every call:
 * session JWT identity → user row (isActive) → organization membership
 * (role). A stolen/stale token cannot outlive a deactivation or role change.
 *
 * The active organization is selected via the `activeOrg` cookie and verified
 * against an OrganizationMember row on EVERY request.
 */
import { getServerSession } from "next-auth/next";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth/options";
import connectDB from "@/lib/db";
import {
  Organization,
  OrganizationMember,
  Plan,
  Subscription,
  User,
  ensurePlansSeeded,
  FREE_PLAN_LIMITS,
  monthlyPeriodFor,
} from "@/models";
import type { IPlanLimits } from "@/models";
import { UserRole, roleAtLeast, type OrgRole } from "@/types";
import { AuthError, AuthorizationError, NotFoundError } from "@/lib/errors";

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  platformRole: UserRole;
}

/** Returns the authenticated user, re-validating account status in the DB. */
export async function requireAuth(): Promise<AuthContext> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.userId as string | undefined;
  if (!session || !userId || !session.user) throw AuthError();

  await connectDB();
  const user = await User.findById(userId)
    .lean<{ _id: unknown; email: string; name: string; role: string; isActive: boolean } | null>();
  if (!user || !user.isActive) throw AuthError("Account no longer exists or is deactivated.");

  return {
    userId,
    email: user.email,
    name: user.name,
    platformRole: (user.role as UserRole) ?? UserRole.USER,
  };
}

/** Platform administrator gate (separate from org roles). */
export async function requirePlatformAdmin(): Promise<AuthContext> {
  const auth = await requireAuth();
  if (auth.platformRole !== UserRole.PLATFORM_ADMIN) {
    throw AuthorizationError("Platform administrator access required.");
  }
  return auth;
}

export interface OrgContext extends AuthContext {
  orgId: string;
  orgName: string;
  role: OrgRole;
  planKey: string;
  limits: IPlanLimits;
  subscriptionStatus: string;
  periodKey: string;
}

const ACTIVE_ORG_COOKIE = "activeOrg";

/**
 * Resolves the caller's active organization context with a DB-verified
 * membership. This is the gate every org-scoped action must pass.
 */
export async function requireOrg(): Promise<OrgContext> {
  const auth = await requireAuth();
  await connectDB();

  const cookieStore = await cookies();
  const requestedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  let membership = await (requestedOrgId
    ? OrganizationMember.findOne({ userId: auth.userId, orgId: requestedOrgId })
    : OrganizationMember.findOne({ userId: auth.userId }).sort({ createdAt: 1 })
  ).lean<{ orgId: { toString(): string }; role: OrgRole } | null>();

  if (!membership && requestedOrgId) {
    // Requested org invalid for this user — fall back to first membership.
    membership = await OrganizationMember.findOne({ userId: auth.userId })
      .sort({ createdAt: 1 })
      .lean<{ orgId: { toString(): string }; role: OrgRole } | null>();
  }

  if (!membership) {
    throw NotFoundError("No organization found. Create one to get started.");
  }

  const orgDoc = await Organization.findById(membership.orgId.toString())
    .lean<{ name: string; status: string } | null>();
  if (!orgDoc) throw NotFoundError("Organization not found.");
  if (orgDoc.status !== "active") throw AuthorizationError("This organization is suspended.");

  await ensurePlansSeeded();
  const subscription = await Subscription.findOne({ orgId: membership.orgId.toString() })
    .lean<{ planKey: string; status: string } | null>();

  const planKey = subscription?.planKey ?? "free";
  const planDoc = await Plan.findOne({ key: planKey }).lean<{ limits: IPlanLimits } | null>();
  const { periodKey } = monthlyPeriodFor();

  return {
    ...auth,
    orgId: membership.orgId.toString(),
    orgName: orgDoc.name,
    role: membership.role,
    planKey,
    limits:
      planDoc?.limits ??
      ({ ...FREE_PLAN_LIMITS } as IPlanLimits),
    subscriptionStatus: subscription?.status ?? "active",
    periodKey,
  };
}

/** Requires the caller to hold at least `min` role in the active org. */
export async function requireOrgRole(min: OrgRole): Promise<OrgContext> {
  const ctx = await requireOrg();
  if (!roleAtLeast(ctx.role, min)) {
    throw AuthorizationError(`This action requires the "${min}" role or higher.`);
  }
  return ctx;
}
