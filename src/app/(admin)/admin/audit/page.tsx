/**
 * Platform admin: append-only audit log viewer.
 */
import { requirePlatformAdmin } from "@/lib/auth/dal";
import connectDB from "@/lib/db";
import { AuditLog } from "@/models";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  await requirePlatformAdmin();
  await connectDB();

  const entries = await AuditLog.find({})
    .sort({ createdAt: -1 })
    .limit(150)
    .populate<{ actorUserId: { email?: string } | null }>("actorUserId", "email")
    .lean<Array<{
      _id: unknown; action: string; orgId?: unknown; actorUserId: { email?: string } | null;
      actorType: string; resourceType: string; resourceId: string | null;
      metadata: Record<string, unknown>; createdAt: Date;
    }>>();

  return (
    <div>
      <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "6px" }}>Audit Log</h1>
      <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginBottom: "22px" }}>
        Append-only record of security-relevant actions (latest 150 events).
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr>
              {["When", "Action", "Actor", "Scope", "Resource", "Details"].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={String(e._id)} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td style={{ ...td, whiteSpace: "nowrap", fontSize: "12px", color: "var(--text-muted)" }}>
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td style={{ ...td, fontWeight: 600 }}>{e.action}</td>
                <td style={{ ...td, fontSize: "12.5px" }}>
                  {e.actorUserId?.email ?? e.actorType}
                </td>
                <td style={{ ...td, fontSize: "12px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                  {e.orgId ? String(e.orgId).slice(-6) : "—"}
                </td>
                <td style={{ ...td, fontSize: "12px" }}>{e.resourceType}{e.resourceId ? `:${String(e.resourceId).slice(-6)}` : ""}</td>
                <td style={{ ...td, fontSize: "11.5px", color: "var(--text-secondary)", maxWidth: "360px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {JSON.stringify(e.metadata ?? {})}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
};
const td: React.CSSProperties = { padding: "10px 12px" };
