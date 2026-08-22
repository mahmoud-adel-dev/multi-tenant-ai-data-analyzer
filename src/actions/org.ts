"use server";

/**
 * Organization & team management actions. All role checks are DB-verified
 * via requireOrg/requireOrgRole — never from session JWT claims alone.
 */
import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import {
  Invitation,
  Organization,
  OrganizationMember,
  Subscription,
  User,
  ensurePlansSeeded,
  generateInvitationToken,
  hashInvitationToken,
  monthlyPeriodFor,
  writeAudit,
} from "@/models";
import { requireOrg, requireOrgRole } from "@/lib/auth/dal";
import { actionSuccess, actionError, type ActionResponse } from "@/lib/utils";
import { NotFoundError, ValidationError, AuthorizationError, AppError } from "@/lib/errors";
import type { MemberDTO, InvitationDTO, OrganizationDTO } from "@/types/dto";


const ACTIVE_ORG_COOKIE = "activeOrg";

/* ────────────────────────────── Switch org ─────────────────────────────── */

export async function switchOrganization(orgId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await requireOrg();
    const membership = await OrganizationMember.findOne({ userId: ctx.userId, orgId }).lean<{ _id: unknown } | null>();
    if (!membership) throw AuthorizationError("You are not a member of that organization.");

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to switch organization." };
  }
}

/* ────────────────────────────── Create org ─────────────────────────────── */

const CreateOrgSchema = z.object({
  name: z.string().min(2).max(120),
});

export async function createOrganization(name: string): Promise<ActionResponse<OrganizationDTO>> {
  try {
    const ctx = await requireOrgRole("member");
    const parsed = CreateOrgSchema.safeParse({ name });
    if (!parsed.success) throw ValidationError(parsed.error.errors[0].message);

    await connectDB();
    await ensurePlansSeeded();

    // Members may belong to a bounded number of organizations (abuse control).
    const count = await OrganizationMember.countDocuments({ userId: ctx.userId });
    if (count >= 10) throw ValidationError("You have reached the maximum number of organizations.");

    const org = await Organization.create({ name: parsed.data.name.trim(), ownerId: ctx.userId });
    await OrganizationMember.create({ orgId: org._id, userId: ctx.userId, role: "owner" });
    const { start, end } = monthlyPeriodFor();
    await Subscription.create({
      orgId: org._id,
      planKey: "free",
      status: "active",
      currentPeriodStart: start,
      currentPeriodEnd: end,
    });

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, String(org._id), { httpOnly: true, sameSite: "lax", path: "/" });

    await writeAudit({
      orgId: String(org._id),
      actorUserId: ctx.userId,
      action: "org.created",
      resourceType: "organization",
      resourceId: String(org._id),
    });

    revalidatePath("/dashboard");
    return actionSuccess(
      { id: String(org._id), name: org.name, role: "owner", memberCount: 1, planKey: "free", createdAt: org.createdAt.toISOString() },
      "Organization created."
    );
  } catch (error) {
    return actionError(error);
  }
}

export async function listMyOrganizations(): Promise<ActionResponse<OrganizationDTO[]>> {
  try {
    const ctx = await requireOrg();
    await connectDB();
    await ensurePlansSeeded();

    const memberships = await OrganizationMember.find({ userId: ctx.userId })
      .populate<{ orgId: { _id: unknown; name: string; createdAt: Date } }>("orgId")
      .lean<Array<{ orgId: { _id: unknown; name: string; createdAt: Date }; role: OrgRoleDTO }>>();

    const orgs: OrganizationDTO[] = [];
    for (const m of memberships) {
      const memberCount = await OrganizationMember.countDocuments({ orgId: m.orgId._id });
      const subscription = await Subscription.findOne({ orgId: m.orgId._id }).lean<{ planKey: string } | null>();
      orgs.push({
        id: String(m.orgId._id),
        name: m.orgId.name,
        role: m.role,
        memberCount,
        planKey: subscription?.planKey ?? "free",
        createdAt: m.orgId.createdAt.toISOString(),
      });
    }
    return actionSuccess(orgs);
  } catch (error) {
    return actionError(error);
  }
}

type OrgRoleDTO = import("@/types").OrgRole;

/* ─────────────────────────── Team management ───────────────────────────── */

export async function listMembers(): Promise<ActionResponse<MemberDTO[]>> {
  try {
    const ctx = await requireOrg();
    await connectDB();

    const members = await OrganizationMember.find({ orgId: ctx.orgId })
      .populate("userId", "name email createdAt")
      .lean<Array<{
        _id: unknown; userId: { _id: unknown; name: string; email: string; createdAt: Date }; role: OrgRoleDTO; createdAt: Date;
      }>>();

    return actionSuccess(
      members.map((m) => ({
        id: String(m._id),
        userId: String(m.userId._id),
        name: m.userId.name,
        email: m.userId.email,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    return actionError(error);
  }
}

export async function listInvitations(): Promise<ActionResponse<InvitationDTO[]>> {
  try {
    const ctx = await requireOrgRole("admin");
    await connectDB();

    const invites = await Invitation.find({ orgId: ctx.orgId, status: "pending" })
      .populate("invitedByUserId", "name")
      .lean<Array<{ _id: unknown; email: string; role: OrgRoleDTO; invitedByUserId: { name: string }; expiresAt: Date; createdAt: Date }>>();

    return actionSuccess(
      invites.map((i) => ({
        id: String(i._id),
        email: i.email,
        role: i.role,
        status: "pending" as const,
        invitedBy: i.invitedByUserId?.name ?? "",
        expiresAt: i.expiresAt.toISOString(),
        createdAt: i.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    return actionError(error);
  }
}

const InviteSchema = z.object({
  email: z.string().email().max(200),
  role: z.enum(["admin", "analyst", "member", "viewer"]),
});

/**
 * Creates an invitation and returns the one-time invite URL.
 * Email delivery is an external integration (documented); the token is
 * surfaced to the inviting admin so teams can self-serve.
 */
export async function inviteMember(email: string, role: string): Promise<ActionResponse<{ inviteUrl: string; expiresAt: string }>> {
  try {
    const ctx = await requireOrgRole("admin");
    const parsed = InviteSchema.safeParse({ email, role });
    if (!parsed.success) throw ValidationError(parsed.error.errors[0].message);

    await connectDB();

    const memberCount = await OrganizationMember.countDocuments({ orgId: ctx.orgId });
    const pendingCount = await Invitation.countDocuments({ orgId: ctx.orgId, status: "pending" });
    if (memberCount + pendingCount >= ctx.limits.maxMembers) {
      throw ValidationError(`Plan limit reached (${ctx.limits.maxMembers} members). Upgrade to invite more teammates.`);
    }

    const existingUser = await User.findOne({ email: parsed.data.email.toLowerCase() }).lean<{ _id: unknown } | null>();
    if (existingUser) {
      const alreadyMember = await OrganizationMember.findOne({
        orgId: ctx.orgId,
        userId: String(existingUser._id),
      }).lean();
      if (alreadyMember) throw new AppError("CONFLICT", "This user is already a member.");
    }

    const pendingExisting = await Invitation.findOne({
      orgId: ctx.orgId,
      email: parsed.data.email.toLowerCase(),
      status: "pending",
    }).lean<{ _id: unknown } | null>();
    if (pendingExisting) throw new AppError("CONFLICT", "An invitation for this email is already pending.");

    const { token, tokenHash } = generateInvitationToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await Invitation.create({
      orgId: ctx.orgId,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      tokenHash,
      invitedByUserId: ctx.userId,
      expiresAt,
    });

    await writeAudit({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: "org.member_invited",
      resourceType: "invitation",
      metadata: { email: parsed.data.email.toLowerCase(), role: parsed.data.role },
    });

    revalidatePath("/dashboard/team");
    return actionSuccess(
      {
        inviteUrl: `/invite/${token}`,
        expiresAt: expiresAt.toISOString(),
      },
      "Invitation created. Share the link with your teammate."
    );
  } catch (error) {
    return actionError(error);
  }
}

/** Accepts an invitation by its one-time token. Requires authentication. */
export async function acceptInvitation(token: string): Promise<ActionResponse<{ orgId: string; orgName: string }>> {
  try {
    const ctx = await requireAuthForInvite();
    await connectDB();

    const tokenHash = hashInvitationToken(token);
    const invitation = await Invitation.findOne({ tokenHash }).select("+tokenHash").lean<{
      _id: unknown; orgId: unknown; email: string; role: OrgRoleDTO; status: string; expiresAt: Date;
    } | null>();

    if (!invitation || invitation.status !== "pending") throw NotFoundError("This invitation is invalid or has been used.");
    if (new Date(invitation.expiresAt) < new Date()) {
      await Invitation.updateOne({ _id: invitation._id }, { $set: { status: "expired" } });
      throw NotFoundError("This invitation has expired.");
    }

    const userDoc = await User.findById(ctx.userId).lean<{ email: string } | null>();
    if (!userDoc || userDoc.email !== invitation.email) {
      throw AuthorizationError("This invitation was issued for a different email address. Sign in with the invited account.");
    }

    const existingMembership = await OrganizationMember.findOne({ orgId: invitation.orgId, userId: ctx.userId }).lean();
    if (!existingMembership) {
      await OrganizationMember.create({
        orgId: invitation.orgId,
        userId: ctx.userId,
        role: invitation.role,
        invitedByUserId: null,
      });
      await Organization.updateOne({ _id: invitation.orgId }, { $inc: { membershipVersion: 1 } });
    }
    await Invitation.updateOne(
      { _id: invitation._id },
      { $set: { status: "accepted", acceptedByUserId: ctx.userId } }
    );

    const org = await Organization.findById(invitation.orgId).lean<{ _id: unknown; name: string } | null>();
    if (!org) throw NotFoundError("Organization not found.");

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, String(org._id), { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });

    await writeAudit({
      orgId: String(invitation.orgId),
      actorUserId: ctx.userId,
      action: "org.member_joined",
      resourceType: "membership",
      metadata: { role: invitation.role },
    });

    return actionSuccess({ orgId: String(org._id), orgName: org.name });
  } catch (error) {
    return actionError(error);
  }
}

async function requireAuthForInvite(): Promise<{ userId: string }> {
  const { requireAuth } = await import("@/lib/auth/dal");
  return requireAuth();
}

const RoleChangeSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(["admin", "analyst", "member", "viewer"]),
});

export async function updateMemberRole(memberId: string, role: string): Promise<ActionResponse<boolean>> {
  try {
    const ctx = await requireOrgRole("owner"); // Only owners may change roles.
    const parsed = RoleChangeSchema.safeParse({ memberId, role });
    if (!parsed.success) throw ValidationError(parsed.error.errors[0].message);

    await connectDB();
    const member = await OrganizationMember.findOne({ _id: memberId, orgId: ctx.orgId });
    if (!member) throw NotFoundError("Member not found.");
    if (member.role === "owner") throw ValidationError("The organization owner's role cannot be changed. Transfer ownership instead (contact support).");

    member.role = parsed.data.role;
    await member.save();
    await Organization.updateOne({ _id: ctx.orgId }, { $inc: { membershipVersion: 1 } });

    await writeAudit({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: "org.member_role_changed",
      resourceType: "membership",
      resourceId: memberId,
      metadata: { newRole: parsed.data.role },
    });

    revalidatePath("/dashboard/team");
    return actionSuccess(true, "Role updated.");
  } catch (error) {
    return actionError(error);
  }
}

export async function removeMember(memberId: string): Promise<ActionResponse<boolean>> {
  try {
    const ctx = await requireOrgRole("admin");
    await connectDB();

    const member = await OrganizationMember.findOne({ _id: memberId, orgId: ctx.orgId });
    if (!member) throw NotFoundError("Member not found.");
    if (String(member.userId) === ctx.userId) throw ValidationError("You cannot remove yourself.");
    if (member.role === "owner") throw ValidationError("The organization owner cannot be removed.");

    await member.deleteOne();
    await Organization.updateOne({ _id: ctx.orgId }, { $inc: { membershipVersion: 1 } });

    await writeAudit({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: "org.member_removed",
      resourceType: "membership",
      resourceId: memberId,
      metadata: {},
    });

    revalidatePath("/dashboard/team");
    return actionSuccess(true, "Member removed.");
  } catch (error) {
    return actionError(error);
  }
}
