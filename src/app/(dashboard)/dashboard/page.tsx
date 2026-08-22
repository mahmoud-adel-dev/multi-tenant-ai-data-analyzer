/**
 * Tenant dashboard overview: usage vs quota, recent datasets, recent jobs.
 */
import Link from "next/link";
import { requireOrg } from "@/lib/auth/dal";
import connectDB from "@/lib/db";
import { AnalysisJob, ApiKey, Dataset, getUsage } from "@/models";
import { JobStatus } from "@/types";
import { formatBytes, formatDate, formatNumber } from "@/lib/utils";
import { getDictionary, getServerLocale } from "@/i18n/server";
import type { JobDTO } from "@/types/dto";

export const dynamic = "force-dynamic";

const ACTIVE_JOB_STATUSES = [
  JobStatus.QUEUED,
  JobStatus.PARSING,
  JobStatus.PROFILING,
  JobStatus.ANALYZING,
  JobStatus.GENERATING_DASHBOARD,
  JobStatus.GENERATING_REPORT,
];

export default async function DashboardOverview() {
  const ctx = await requireOrg();
  await connectDB();
  const d = getDictionary(await getServerLocale());

  const periodKey = ctx.periodKey;
  const [totalDatasets, activeKeys, jobsUsed, storageUsed, rowsAnalyzed, activeJobs, recentDatasets, recentJobs] =
    await Promise.all([
      Dataset.countDocuments({ orgId: ctx.orgId, deletedAt: null }),
      ApiKey.countDocuments({ orgId: ctx.orgId, status: "active" }),
      getUsage(ctx.orgId, "jobs", periodKey),
      getUsage(ctx.orgId, "storage_bytes", "all"),
      getUsage(ctx.orgId, "rows_analyzed", periodKey),
      AnalysisJob.countDocuments({ orgId: ctx.orgId, status: { $in: ACTIVE_JOB_STATUSES } }),
      Dataset.find({ orgId: ctx.orgId, deletedAt: null })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name fileType status rowCount qualityScore createdAt latestAnalysisRunId")
        .lean<Array<{
          _id: unknown; name: string; fileType: string; status: string;
          rowCount: number | null; qualityScore: number | null; createdAt: Date;
          latestAnalysisRunId?: unknown;
        }>>(),
      AnalysisJob.find({ orgId: ctx.orgId })
        .sort({ createdAt: -1 })
        .limit(6)
        .select("datasetId status stage progress error timings createdAt")
        .lean<Array<Record<string, unknown>>>(),
    ]);

  const jobPct = Math.min((jobsUsed / Math.max(1, ctx.limits.maxJobsPerMonth)) * 100, 100);
  const storagePct = Math.min((storageUsed / Math.max(1, ctx.limits.maxStorageBytes)) * 100, 100);

  const datasetNameById = new Map(recentDatasets.map((d) => [String(d._id), d.name]));
  const jobs: JobDTO[] = recentJobs.map((j) => {
    const timings = (j.timings ?? {}) as { startedAt?: Date; completedAt?: Date };
    const error = j.error as { code?: unknown; message?: unknown } | undefined;
    return {
      id: String(j._id),
      datasetId: String(j.datasetId),
      datasetName: datasetNameById.get(String(j.datasetId)) ?? null,
      status: String(j.status) as JobDTO["status"],
      stage: String(j.stage ?? ""),
      progress: typeof j.progress === "number" ? j.progress : 0,
      attempts: typeof j.attempts === "number" ? j.attempts : 0,
      maxAttempts: 3,
      error:
        error && typeof error.message === "string"
          ? { code: String(error.code ?? "ANALYSIS_ERROR"), message: String(error.message).slice(0, 200) }
          : null,
      resultRefs: { analysisRunId: null, dashboardId: null, reportId: null },
      createdAt: j.createdAt instanceof Date ? j.createdAt.toISOString() : String(j.createdAt),
      startedAt: timings.startedAt ? new Date(timings.startedAt).toISOString() : null,
      completedAt: timings.completedAt ? new Date(timings.completedAt).toISOString() : null,
      durationMs: null,
    };
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: "4px" }}>
            {d.home.welcomePrefix} {ctx.name.split(" ")[0]}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            <strong>{ctx.orgName}</strong> — {d.home.tagline}
          </p>
        </div>
        <Link
          href="/dashboard/upload"
          style={{
            padding: "10px 18px",
            borderRadius: "8px",
            background: "var(--brand-gradient)",
            color: "#fff",
            fontSize: "13.5px",
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {d.home.newAnalysis}
        </Link>
      </div>

      {/* Usage stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "28px" }}>
        <div className="panel">
          <StatLabel>{d.home.analysesThisMonth}</StatLabel>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={bigNum}>{jobsUsed}</span>
            <span style={smallMuted}>/ {ctx.limits.maxJobsPerMonth}</span>
          </div>
          <ProgressBar pct={jobPct} />
        </div>

        <div className="panel">
          <StatLabel>{d.home.storageUsed}</StatLabel>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={bigNum}>{formatBytes(storageUsed)}</span>
            <span style={smallMuted}>/ {formatBytes(ctx.limits.maxStorageBytes)}</span>
          </div>
          <ProgressBar pct={storagePct} />
        </div>

        <div className="panel">
          <StatLabel>{d.home.datasetsStat}</StatLabel>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <span style={bigNum}>{formatNumber(totalDatasets)}</span>
            {activeJobs > 0 && (
              <span style={{ fontSize: "12px", color: "var(--accent-primary)", fontWeight: 600 }}>
                ● {activeJobs} {d.home.runningNow}
              </span>
            )}
          </div>
          <Link href="/dashboard/data-explorer" style={link}>{d.home.viewAll}</Link>
        </div>

        <div className="panel">
          <StatLabel>{d.home.analysesThisMonth.replace("Analyses", "Rows")}</StatLabel>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <span style={bigNum}>{formatNumber(rowsAnalyzed)}</span>
          </div>
          <Link href="/dashboard/billing" style={link}>{d.home.usageDetails}</Link>
        </div>
      </div>

      {/* Two-column activity area */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "20px" }} className="home-grid">
        {/* Recent datasets */}
        <section>
          <SectionHeader title={d.home.recentDatasets} href="/dashboard/data-explorer" linkLabel={d.common.open} />
          {recentDatasets.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: "44px 24px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>{d.home.noDatasetsTitle}</h3>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: "400px", margin: "0 auto 16px" }}>
                {d.home.noDatasetsBody}
              </p>
              <Link href="/dashboard/upload" style={{ ...primaryButton }}>{d.home.noDatasetsCta}</Link>
            </div>
          ) : (
            <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "480px" }}>
                <tbody>
                  {recentDatasets.map((d) => (
                    <tr key={String(d._id)} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "12px 14px" }}>
                        <Link href={`/dashboard/datasets/${String(d._id)}`} style={{ color: "var(--accent-primary)", fontWeight: 600, textDecoration: "none" }}>
                          {d.name}
                        </Link>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          {d.fileType.toUpperCase()} · {formatDate(d.createdAt)}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: "12.5px" }}>
                        {d.rowCount !== null ? `${d.rowCount.toLocaleString()} rows` : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <StatusDot status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Quick actions */}
          <SectionHeader title={d.home.quickActions} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
            <Link href="/dashboard/upload" className="panel" style={{ ...quickAction }}>
              <div style={{ fontSize: "22px", marginBottom: "10px" }}>📊</div>
              <h3 style={quickTitle}>{d.home.qaUploadTitle}</h3>
              <p style={mutedText}>{d.home.qaUploadDesc}</p>
            </Link>
            <Link href="/dashboard/team" className="panel" style={{ ...quickAction }}>
              <div style={{ fontSize: "22px", marginBottom: "10px" }}>👥</div>
              <h3 style={quickTitle}>{d.home.qaTeamTitle}</h3>
              <p style={mutedText}>{d.home.qaTeamDesc}</p>
            </Link>
            <Link href="/dashboard/api-keys" className="panel" style={{ ...quickAction }}>
              <div style={{ fontSize: "22px", marginBottom: "10px" }}>🔑</div>
              <h3 style={quickTitle}>{d.home.qaApiTitle} ? {activeKeys}</h3>
              <p style={mutedText}>{activeKeys} {d.home.qaApiDesc}</p>
            </Link>
          </div>
        </section>

        {/* Recent jobs */}
        <section>
          <SectionHeader title={d.home.recentAnalyses} />
          {jobs.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: "36px 20px", color: "var(--text-muted)", fontSize: "13px" }}>
              {d.home.jobsEmpty}
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "9px" }}>
              {jobs.map((j) => {
                const tone = jobTone(j.status);
                return (
                  <li key={j.id} className="panel" style={{ padding: "12px 14px", display: "flex", gap: "11px", alignItems: "center" }}>
                    <span title={j.status} style={{ width: "9px", height: "9px", borderRadius: "50%", background: tone, flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {j.datasetName ?? "Dataset"}
                      </div>
                      <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                        {j.status === "completed"
                          ? `Completed ${j.completedAt ? formatDate(j.completedAt) : ""}`
                          : j.status === "failed"
                            ? `Failed · ${j.error?.code ?? "error"}`
                            : `${j.stage || j.status} · ${j.progress}%`}
                      </div>
                    </div>
                    <Link href={`/dashboard/datasets/${j.datasetId}`} style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent-primary)", textDecoration: "none", whiteSpace: "nowrap" }}>
                      Open →
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function jobTone(status: string): string {
  switch (status) {
    case "completed": return "#2ea043";
    case "failed": return "#e5484d";
    case "cancelled": return "#8b96b8";
    default: return "#508bfe";
  }
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    ready: "#2ea043",
    processing: "#508bfe",
    uploading: "#508bfe",
    failed: "#e5484d",
    deleted: "#999",
  };
  return <span title={status} style={{ display: "inline-block", width: "9px", height: "9px", borderRadius: "50%", background: map[status] ?? "#999" }} />;
}

function StatLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "10px" }}>{children}</div>;
}

function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px", marginTop: href ? "26px" : "26px" }}>
      <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>{title}</h2>
      {href && linkLabel && (
        <Link href={href} style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--accent-primary)", textDecoration: "none" }}>
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: "6px", borderRadius: "3px", background: "var(--bg-secondary)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, borderRadius: "3px", background: "var(--brand-gradient)" }} />
    </div>
  );
}

const bigNum: React.CSSProperties = { fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" };
const smallMuted: React.CSSProperties = { fontSize: "12.5px", color: "var(--text-muted)" };
const link: React.CSSProperties = { fontSize: "12.5px", fontWeight: 600, color: "var(--accent-primary)", textDecoration: "none" };
const quickAction: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  transition: "border-color .15s, transform .15s",
};
const quickTitle: React.CSSProperties = { fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" };
const mutedText: React.CSSProperties = { fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.5 };
const primaryButton: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 20px",
  borderRadius: "8px",
  background: "var(--brand-gradient)",
  color: "#fff",
  fontWeight: 600,
  fontSize: "13.5px",
  textDecoration: "none",
};
