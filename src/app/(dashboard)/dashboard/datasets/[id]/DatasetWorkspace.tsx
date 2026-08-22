"use client";

/**
 * Client workspace shell: job-progress polling, tabs, and the views
 * (Overview / Columns / Dashboard / Report) plus the AI Q&A panel.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  Loader2,
  MessageSquareText,
  Table2,
} from "lucide-react";
import { getJobStatus, reanalyzeDataset } from "@/actions/datasets";
import type { JobDTO } from "@/types/dto";
import type { ColumnProfile } from "@/types/analytics";
import DashboardRenderer from "@/components/dashboard/charts/DashboardRenderer";
import ReportView from "./ReportView";
import OverviewTab from "./OverviewTab";
import ColumnsProfileTab from "./ColumnsProfileTab";
import AskAiPanel from "./AskAiPanel";
import { useI18n } from "@/i18n/LocaleProvider";

export interface DatasetInfo {
  id: string;
  name: string;
  originalFilename: string;
  fileType: string;
  status: string;
  sizeBytes: number;
  rowCount: number | null;
  qualityScore: number | null;
  domain: { domain: string; confidence: number } | null;
  columnSnapshot: Array<{ name: string; normalizedName: string; inferredType: string; role: string }>;
  qualityFindings: Array<{
    severity: "low" | "medium" | "high";
    issueType: string;
    column: string | null;
    description: string;
    affectedRows: number;
    suggestedRemediation: string;
  }>;
  profileSummary: { rowCount: number; columnCount: number; duplicateRowCount: number; missingCellPercentage: number } | null;
  errorMessage: string | null;
  createdAt: string;
  latestJobId: string | null;
}

interface WorkspaceProps {
  dataset: DatasetInfo;
  dashboard: { title: string; plan: Parameters<typeof DashboardRenderer>[0]["plan"] } | null;
  report: Parameters<typeof ReportView>[0]["plan"] | null;
  narrative: { executiveSummary: string; keyInsights: string[]; recommendations: string[]; model?: string } | null;
  engineVersion: string | null;
  profileColumns: ColumnProfile[];
  engineWarnings: string[];
}

const TABS = [
  { key: "Overview", icon: <BarChart3 size={14} /> },
  { key: "Columns", icon: <Table2 size={14} /> },
  { key: "Dashboard", icon: <LayoutDashboard size={14} /> },
  { key: "Report", icon: <FileText size={14} /> },
  { key: "Ask AI", icon: <MessageSquareText size={14} /> },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const PIPELINE_STAGE_KEYS = ["queued", "parsing", "analyzing", "generating_dashboard", "generating_report"] as const;

const STAGE_ALIASES: Record<string, string> = {
  claimed: "parsing",
  scanning: "parsing",
  profiling: "analyzing",
  created: "queued",
  retry_scheduled: "queued",
};

export default function DatasetWorkspace({
  dataset,
  dashboard,
  report,
  narrative,
  engineVersion,
  profileColumns,
  engineWarnings,
}: WorkspaceProps) {
  const router = useRouter();
  const { d } = useI18n();
  const tabLabels: Record<TabKey, string> = {
    Overview: d.workspace.tabOverview,
    Columns: d.workspace.tabColumns,
    Dashboard: d.workspace.tabDashboard,
    Report: d.workspace.tabReport,
    "Ask AI": d.workspace.tabAskAi,
  };
  const stageLabels: Record<string, string> = {
    queued: d.upload.stageQueued,
    parsing: d.upload.stageParsing,
    analyzing: d.upload.stageAnalyzing,
    generating_dashboard: d.upload.stageDashboard,
    generating_report: d.upload.stageReport,
  };
  const [tab, setTab] = useState<TabKey>("Overview");
  const [job, setJob] = useState<JobDTO | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isProcessing =
    dataset.status === "processing" || (dataset.latestJobId !== null && !dashboard && !report && !["failed"].includes(dataset.status));

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    if (!isProcessing || !dataset.latestJobId) return;
    let stopping = false;
    pollRef.current = setInterval(async () => {
      try {
        const res = await getJobStatus(dataset.latestJobId as string);
        if (!res.success || stopping) return;
        setJob(res.data);
        if (res.data.status === "completed") {
          stopPolling();
          toast.success("Analysis complete!");
          setTimeout(() => router.refresh(), 600);
        } else if (res.data.status === "failed") {
          stopPolling();
          toast.error(res.data.error?.message ?? "Analysis failed.", { duration: 8000 });
          setTimeout(() => router.refresh(), 600);
        }
      } catch {
        // Keep polling through transient failures.
      }
    }, 2500);
    return () => {
      stopping = true;
      stopPolling();
    };
  }, [isProcessing, dataset.latestJobId, router, stopPolling]);

  const handleReanalyze = async () => {
    const res = await reanalyzeDataset(dataset.id);
    if (res.success) {
      toast.success("Re-analysis queued.");
      setJob(null);
      setTimeout(() => window.location.reload(), 800);
    } else {
      toast.error(res.error);
    }
  };

  // Live pipeline state derived from the polled job.
  const currentServerStage = job ? STAGE_ALIASES[job.stage] ?? job.stage : "";
  const activePipelineIndex = PIPELINE_STAGE_KEYS.findIndex((s) => s === currentServerStage);
  const jobFailed = job?.status === "failed";
  const progressPct = job?.progress ?? 5;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", letterSpacing: "-0.01em" }}>
            {dataset.name}
            <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "6px", background: "var(--bg-secondary)", textTransform: "uppercase", fontWeight: 700 }}>
              {dataset.fileType}
            </span>
            {dataset.domain && (
              <span
                title={`Detected with ${Math.round(dataset.domain.confidence * 100)}% confidence`}
                style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "999px", background: "var(--accent-light)", color: "var(--accent-primary)", fontWeight: 600 }}
              >
                {dataset.domain.domain.replace(/_/g, " ")}
              </span>
            )}
            {dataset.qualityScore !== null && (
              <span
                title="Data quality score"
                style={{
                  fontSize: "11px",
                  padding: "3px 10px",
                  borderRadius: "999px",
                  fontWeight: 700,
                  background: dataset.qualityScore >= 80 ? "rgba(46,160,67,0.15)" : dataset.qualityScore >= 60 ? "rgba(245,158,11,0.15)" : "rgba(229,72,77,0.15)",
                  color: dataset.qualityScore >= 80 ? "#2ea043" : dataset.qualityScore >= 60 ? "#f59e0b" : "#e5484d",
                }}
              >
                Quality {dataset.qualityScore}/100
              </span>
            )}
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
            {dataset.originalFilename} · {(dataset.sizeBytes / 1024).toFixed(0)} KB · uploaded {new Date(dataset.createdAt).toLocaleDateString()}
            {engineVersion && <> · engine v{engineVersion}</>}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }} className="no-print">
          <Link
            href="/dashboard/data-explorer"
            style={{
              padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--border-color)",
              background: "var(--bg-card)", color: "var(--text-secondary)",
              fontSize: "13px", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            {d.workspace.allDatasets}
          </Link>
          <button onClick={handleReanalyze} style={reanalyzeBtn}>
            Re-run analysis
          </button>
        </div>
      </div>

      {/* Processing banner with live pipeline */}
      {isProcessing && (
        <div className="panel" style={{ borderColor: "var(--accent-primary)", marginBottom: "22px" }} aria-live="polite">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "13px", flexWrap: "wrap", gap: "8px" }}>
            <strong style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <Loader2 size={15} className="animate-spin" color="var(--accent-primary)" />
              {d.workspace.inProgress} — {stageLabels[PIPELINE_STAGE_KEYS[Math.max(activePipelineIndex, 0)] ?? "queued"]}
            </strong>
            <span style={{ color: "var(--text-muted)" }}>{progressPct}%</span>
          </div>
          <div style={{ height: "7px", borderRadius: "4px", background: "var(--bg-secondary)", overflow: "hidden", marginBottom: "14px" }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--brand-gradient)", transition: "width .5s", borderRadius: "4px" }} />
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "6px" }}>
            {PIPELINE_STAGE_KEYS.map((stageKey, index) => {
              const state =
                jobFailed && index === Math.max(activePipelineIndex, 0)
                  ? "failed"
                  : activePipelineIndex < 0 || index < activePipelineIndex
                    ? "done"
                    : index === activePipelineIndex
                      ? "active"
                      : "pending";
              return (
                <li key={stageKey} style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "12px" }}>
                  {state === "done" ? (
                    <CheckCircle2 size={14} color="#22c55e" />
                  ) : state === "active" ? (
                    <Loader2 size={14} className="animate-spin" color="var(--accent-primary)" />
                  ) : state === "failed" ? (
                    <AlertCircle size={14} color="#e5484d" />
                  ) : (
                    <span style={{ width: "14px", height: "14px", borderRadius: "50%", border: "2px solid var(--border-color)", flexShrink: 0 }} />
                  )}
                  <span style={{ fontWeight: state === "active" ? 700 : 500, color: state === "pending" ? "var(--text-muted)" : "var(--text-primary)" }}>
                    {stageLabels[stageKey]}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Failed banner */}
      {dataset.status === "failed" && (
        <div className="panel" style={{ background: "rgba(229,72,77,0.08)", border: "1px solid rgba(229,72,77,0.5)", marginBottom: "22px" }}>
          <strong style={{ fontSize: "14px", color: "#e5484d" }}>{d.workspace.failedBanner}</strong>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>{dataset.errorMessage ?? "An unknown error occurred."}</p>
          <button onClick={handleReanalyze} className="no-print" style={{ ...reanalyzeBtn, marginTop: "10px" }}>
            {d.workspace.tryAgain}
          </button>
        </div>
      )}

      {/* Engine warnings — completed with warnings */}
      {!isProcessing && engineWarnings.length > 0 && (
        <div className="panel" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.4)", marginBottom: "22px" }}>
          <strong style={{ fontSize: "13px", color: "#f59e0b", display: "inline-flex", alignItems: "center", gap: "7px" }}>
            <AlertCircle size={14} /> {d.workspace.warningsBanner(engineWarnings.length)}
          </strong>
          <details style={{ marginTop: "6px" }}>
            <summary style={{ fontSize: "12px", color: "var(--text-muted)", cursor: "pointer" }}>Show details</summary>
            <ul style={{ margin: "8px 0 0", paddingLeft: "18px", fontSize: "12.5px", color: "var(--text-secondary)" }}>
              {engineWarnings.slice(0, 10).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label="Dataset views" style={{ display: "flex", gap: "2px", borderBottom: "1px solid var(--border-color)", marginBottom: "22px", overflowX: "auto" }} className="no-print">
        {TABS.map((t) => {
          const disabled = t.key !== "Overview" && t.key !== "Columns" && !dashboard && !report && dataset.status === "failed";
          const showEmptyForColumns = t.key === "Columns" && profileColumns.length === 0 && dataset.columnSnapshot.length > 0;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              disabled={disabled}
              onClick={() => setTab(t.key)}
              title={showEmptyForColumns ? "Detailed column statistics become available after analysis completes" : undefined}
              style={{
                padding: "9px 14px",
                fontSize: "13.5px",
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? "var(--accent-primary)" : disabled ? "var(--text-muted)" : "var(--text-secondary)",
                background: "none",
                border: "none",
                borderBottom: tab === t.key ? "2px solid var(--accent-primary)" : "2px solid transparent",
                cursor: disabled ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                opacity: tab === t.key ? 1 : disabled ? 0.5 : 0.85,
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
              }}
            >
              {t.icon}
              {tabLabels[t.key]}
            </button>
          );
        })}
      </div>

      {tab === "Overview" && <OverviewTab dataset={dataset} />}
      {tab === "Columns" &&
        (profileColumns.length > 0 ? (
          <ColumnsProfileTab columns={profileColumns} />
        ) : isProcessing ? (
          <EmptyState title={d.workspace.processingColsTitle} body={d.workspace.processingColsBody} icon={<Table2 size={30} />} />
        ) : (
          <EmptyState
            title={d.workspace.noColsTitle}
            body={dataset.status === "failed" ? d.workspace.noColsFailed : d.workspace.noColsYet}
            icon={<Table2 size={30} />}
            action={<button onClick={handleReanalyze} className="no-print" style={reanalyzeBtn}>{d.workspace.runAnalysis}</button>}
          />
        ))}
      {tab === "Dashboard" &&
        (dashboard ? (
          <DashboardRenderer plan={dashboard.plan} />
        ) : (
          <EmptyState
            title={isProcessing ? d.workspace.buildingDashboard : d.workspace.noDashTitle}
            body={isProcessing ? d.workspace.dashProcessingBody : d.workspace.noDashBody}
            icon={<LayoutDashboard size={30} />}
            action={!isProcessing ? <button onClick={handleReanalyze} className="no-print" style={reanalyzeBtn}>{d.workspace.runAnalysis}</button> : undefined}
          />
        ))}
      {tab === "Report" &&
        (report ? (
          <ReportView plan={report} narrativeSummary={narrative?.executiveSummary ?? null} />
        ) : (
          <EmptyState
            title={isProcessing ? d.workspace.writingReport : d.workspace.noReportTitle}
            body={isProcessing ? d.workspace.reportProcessingBody : d.workspace.noReportBody}
            icon={<FileText size={30} />}
            action={!isProcessing ? <button onClick={handleReanalyze} className="no-print" style={reanalyzeBtn}>{d.workspace.runAnalysis}</button> : undefined}
          />
        ))}
      {tab === "Ask AI" && <AskAiPanel datasetId={dataset.id} enabled={!isProcessing} />}
    </div>
  );
}

function EmptyState({ title, body, icon, action }: { title: string; body: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: "56px 24px", border: "1px dashed var(--border-color)", borderRadius: "14px", color: "var(--text-muted)" }}>
      {icon && <div style={{ marginBottom: "12px", display: "flex", justifyContent: "center", color: "var(--text-muted)" }}>{icon}</div>}
      <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>{title}</h3>
      <p style={{ fontSize: "13px", marginBottom: action ? "16px" : 0, maxWidth: "420px", marginInline: "auto" }}>{body}</p>
      {action}
    </div>
  );
}

const reanalyzeBtn: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: "8px",
  border: "1px solid var(--border-color)",
  background: "var(--bg-card)",
  color: "var(--text-primary)",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};
