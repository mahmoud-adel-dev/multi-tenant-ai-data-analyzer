/**
 * Platform admin overview: users, orgs, jobs (incl. failures), models.
 */
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/dal";
import connectDB from "@/lib/db";
import { AiModelConfig, AnalysisJob, Dataset, Organization, User } from "@/models";
import { JobStatus } from "@/types";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  await requirePlatformAdmin();
  await connectDB();

  const [userCount, orgCount, datasetCount, activeModels, failedJobs, runningJobs] = await Promise.all([
    User.countDocuments({}),
    Organization.countDocuments({}),
    Dataset.countDocuments({ deletedAt: null }),
    AiModelConfig.countDocuments({ isActive: true }),
    AnalysisJob.find({ status: JobStatus.FAILED }).sort({ updatedAt: -1 }).limit(8).populate<{ datasetId: { name?: string } | unknown }>("datasetId").lean<Array<Record<string, unknown>>>(),
    AnalysisJob.countDocuments({ status: { $nin: [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED] } }),
  ]);

  return (
    <div>
      <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "24px" }}>Platform Overview</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "34px" }}>
        <Stat label="Users" value={userCount.toLocaleString()} href="/admin" />
        <Stat label="Organizations" value={orgCount.toLocaleString()} />
        <Stat label="Datasets" value={datasetCount.toLocaleString()} />
        <Stat label="Jobs in flight" value={runningJobs.toLocaleString()} />
        <Stat label="Active AI model" value={activeModels > 0 ? "Configured" : "None ⚠"} tone={activeModels > 0 ? undefined : "#f59e0b"} href="/admin/models" />
      </div>

      <section>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "14px" }}>Recent failed jobs</h2>
        {failedJobs.length === 0 ? (
          <p style={{ fontSize: "13.5px", color: "var(--text-secondary)" }}>No failed jobs. 🎉</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  {["Dataset", "Error", "Attempts", "When"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {failedJobs.map((j) => {
                  const ds = j.datasetId as { name?: string } | unknown;
                  const error = j.error as { message?: string } | null;
                  const updatedAt = j.updatedAt as Date | null;
                  return (
                    <tr key={String(j._id)} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <td style={td}>{(ds && typeof ds === "object" && "name" in ds ? (ds.name as string) : String(j.datasetId)) || "—"}</td>
                      <td style={{ ...td, color: "#e5484d", maxWidth: "420px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {error?.message ?? "unknown"}
                      </td>
                      <td style={td}>{String(j.attempts ?? "")}</td>
                      <td style={{ ...td, fontSize: "12px", color: "var(--text-muted)" }}>
                        {updatedAt ? new Date(updatedAt).toLocaleString() : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div style={{ marginTop: "26px", display: "flex", gap: "12px" }}>
        <Link href="/admin/models" style={linkBtn}>Manage AI models →</Link>
        <Link href="/admin/audit" style={linkBtn}>View audit log →</Link>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, href }: { label: string; value: string; tone?: string; href?: string }) {
  const inner = (
    <>
      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: 800, color: tone ?? "var(--text-primary)" }}>{value}</div>
    </>
  );
  return href ? (
    <Link href={href} style={{ ...statCard, textDecoration: "none", cursor: "pointer" }}>{inner}</Link>
  ) : (
    <div style={statCard}>{inner}</div>
  );
}

const statCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "14px",
  padding: "18px",
};
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
};
const td: React.CSSProperties = { padding: "10px 12px" };
const linkBtn: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: "9px",
  border: "1px solid var(--border-color)",
  background: "var(--bg-card)",
  color: "var(--accent-primary)",
  fontWeight: 600,
  fontSize: "13px",
  textDecoration: "none",
};
