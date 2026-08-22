"use client";

/**
 * Dataset overview: profile stats, data-quality summary with severity filters.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useI18n } from "@/i18n/LocaleProvider";
import type { DatasetInfo } from "./DatasetWorkspace";

type Severity = "high" | "medium" | "low";

const SEVERITY_META: Record<Severity | "passed", { labelKey: "sevCritical" | "sevWarning" | "sevInfo" | "sevPassed"; color: string }> = {
  high: { labelKey: "sevCritical", color: "#e5484d" },
  medium: { labelKey: "sevWarning", color: "#f59e0b" },
  low: { labelKey: "sevInfo", color: "#8b96b8" },
  passed: { labelKey: "sevPassed", color: "#2ea043" },
};

export default function OverviewTab({ dataset }: { dataset: DatasetInfo }) {
  const { d, locale } = useI18n();
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [showAll, setShowAll] = useState(false);
  const summary = dataset.profileSummary;

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    for (const f of dataset.qualityFindings) c[f.severity] += 1;
    return c;
  }, [dataset.qualityFindings]);

  const filtered = useMemo(() => {
    const list =
      severityFilter === "all"
        ? dataset.qualityFindings
        : dataset.qualityFindings.filter((f) => f.severity === severityFilter);
    return showAll ? list : list.slice(0, 12);
  }, [dataset.qualityFindings, severityFilter, showAll]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      {/* Stat cards */}
      <div className="kpi-grid">
        <Stat label={d.workspace.statRows} value={summary ? summary.rowCount.toLocaleString() : dataset.rowCount?.toLocaleString() ?? "—"} />
        <Stat
          label={d.workspace.statColumns}
          value={summary ? String(summary.columnCount) : String(dataset.columnSnapshot.length || "—")}
        />
        <Stat
          label={d.workspace.statDuplicates}
          value={summary ? summary.duplicateRowCount.toLocaleString() : "—"}
          warn={summary !== null && summary.duplicateRowCount > 0}
        />
        <Stat
          label={d.workspace.statMissing}
          value={summary ? `${summary.missingCellPercentage.toFixed(1)}%` : "—"}
          warn={summary !== null && summary.missingCellPercentage > 10}
        />
        {dataset.qualityScore !== null && (
          <Stat label={d.workspace.statQuality} value={`${dataset.qualityScore}/100`} tone={qualityTone(dataset.qualityScore)} />
        )}
      </div>

      {/* Data quality */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
          <h2 style={sectionTitle}>{d.workspace.dqTitle}</h2>
          <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
            {(["high", "medium", "low"] as Severity[]).map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(severityFilter === sev ? "all" : sev)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  fontSize: "11.5px", fontWeight: 700, padding: "5px 11px",
                  borderRadius: "999px", cursor: "pointer",
                  border: `1px solid ${severityFilter === sev ? SEVERITY_META[sev].color : "var(--border-color)"}`,
                  background: severityFilter === sev ? `${SEVERITY_META[sev].color}18` : "var(--bg-card)",
                  color: SEVERITY_META[sev].color,
                }}
              >
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: SEVERITY_META[sev].color }} />
                {d.workspace[SEVERITY_META[sev].labelKey]} · {counts[sev]}
              </button>
            ))}
            {counts.high === 0 && counts.medium === 0 && counts.low === 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontWeight: 700, padding: "5px 11px", borderRadius: "999px", background: "rgba(46,160,67,0.12)", color: SEVERITY_META.passed.color }}>
                <CheckCircle2 size={13} /> {d.workspace.noIssues}
              </span>
            )}
          </div>
        </div>

        {dataset.qualityFindings.length === 0 ? (
          <div className="panel" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <CheckCircle2 size={20} color="#2ea043" />
            <div>
              <strong style={{ fontSize: "13.5px" }}>{d.workspace.noIssues}</strong>
              <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", marginTop: "3px" }}>
                {d.workspace.noIssuesDesc}
              </p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="panel">
            <p style={{ fontSize: "13px", color: "var(--text-muted)", display: "flex", gap: "8px", alignItems: "center" }}>
              <Info size={15} /> {d.workspace.noneAtSeverity}
            </p>
          </div>
        ) : (
          <>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "10px" }}>
              {filtered.map((f, i) => {
                const meta = SEVERITY_META[f.severity];
                return (
                  <li key={i} className="panel" style={{ padding: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 700, color: meta.color }}>
                        <AlertTriangle size={12} /> {d.workspace[meta.labelKey].toUpperCase()}
                      </span>
                      <strong style={{ fontSize: "13px", textTransform: "capitalize" }}>{f.issueType.replace(/_/g, " ")}</strong>
                      {f.column && (
                        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: "var(--bg-secondary)", fontFamily: "monospace" }}>{f.column}</span>
                      )}
                      <span style={{ fontSize: "11.5px", color: "var(--text-muted)", marginLeft: "auto" }}>
                        {f.affectedRows.toLocaleString()} rows
                      </span>
                    </div>
                    <p style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>{f.description}</p>
                    <p style={{ fontSize: "11.5px", color: "var(--accent-primary)", marginTop: "4px" }}>{d.workspace.suggested} {f.suggestedRemediation}</p>
                  </li>
                );
              })}
            </ul>
            {(severityFilter === "all" ? dataset.qualityFindings.length : filtered.length) > 12 && (
              <button
                onClick={() => setShowAll(!showAll)}
                style={{ marginTop: "12px", background: "none", border: "none", color: "var(--accent-primary)", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", padding: 0 }}
              >
                {showAll ? d.workspace.showLess : `${d.workspace.showAllFindings}` }
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone, warn }: { label: string; value: string; tone?: string; warn?: boolean }) {
  return (
    <div className="panel" style={{ padding: "16px" }}>
      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "21px", fontWeight: 800, color: tone ?? (warn ? "#f59e0b" : "var(--text-primary)") }}>{value}</div>
    </div>
  );
}

function qualityTone(score: number): string {
  if (score >= 80) return "#2ea043";
  if (score >= 60) return "#f59e0b";
  return "#e5484d";
}

const sectionTitle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "var(--text-primary)",
};
