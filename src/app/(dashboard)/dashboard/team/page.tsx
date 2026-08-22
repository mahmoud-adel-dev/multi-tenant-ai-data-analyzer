import { requireOrg } from "@/lib/auth/dal";
import { roleAtLeast } from "@/types";
import TeamClient from "./TeamClient";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const ctx = await requireOrg();
  return (
    <div>
      <div style={{ marginBottom: "26px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "4px" }}>Team</h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          Manage members and role-based access for <strong>{ctx.orgName}</strong>.
        </p>
      </div>
      <TeamClient canManage={roleAtLeast(ctx.role, "admin")} isOwner={ctx.role === "owner"} />
    </div>
  );
}
