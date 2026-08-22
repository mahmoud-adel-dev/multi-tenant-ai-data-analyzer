"use client";

/**
 * Dashboard renderer: renders the validated DashboardPlan DSL produced by the
 * deterministic Python chart planner. Each widget type is its own component
 * so hooks stay unconditional; charts use ECharts; tables render as HTML.
 */
import { useMemo, useState } from "react";
import type { VisualizationSpec, DashboardPlan } from "@/types/analytics";
import { Chart } from "./Chart";
import {
  barOption,
  forecastOption,
  heatmapOption,
  histogramOption,
  lineOption,
  pieOption,
  scatterOption,
  formatCompact,
} from "./options";

type Json = Record<string, unknown>;

const asJson = (data: unknown): Json => ((data && typeof data === "object") || Array.isArray(data) ? (data as Json) : {});

export default function DashboardRenderer({ plan }: { plan: DashboardPlan }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {plan.pages.map((page, idx) => (
        <section key={idx} aria-label={page.title}>
          {plan.pages.length > 1 && (
            <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "14px" }}>
              {page.title}
            </h2>
          )}
          <KpiRow widgets={page.widgets.filter((w) => w.type === "kpi")} />
          <div className="dash-grid">
            {page.widgets
              .filter((w) => w.type !== "kpi")
              .map((w) => (
                <WidgetCard key={w.id} widget={w} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ─────────────────────────────── KPI row ────────────────────────────────── */

function KpiRow({ widgets }: { widgets: VisualizationSpec[] }) {
  if (widgets.length === 0) return null;
  return (
    <div className="kpi-grid" style={{ marginBottom: "18px" }}>
      {widgets.map((w) => (
        <KpiCard key={w.id} widget={w} />
      ))}
    </div>
  );
}

function KpiCard({ widget }: { widget: VisualizationSpec }) {
  const data = asJson(widget.data);
  const value = typeof data.value === "number" ? data.value : null;
  const unit = typeof data.unit === "string" ? ` ${data.unit}` : "";
  const aggregation = typeof data.aggregation === "string" ? data.aggregation : null;
  const sourceColumns = Array.isArray(data.sourceColumns) ? (data.sourceColumns as unknown[]).filter((c): c is string => typeof c === "string") : [];
  const provenance =
    aggregation || sourceColumns.length > 0
      ? `${aggregation ?? ""}${sourceColumns.length ? ` of ${sourceColumns.join(", ")}` : ""}`
      : null;

  return (
    <div style={kpiStyle} title={provenance ? `Computed via ${provenance}` : undefined}>
      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", minHeight: "32px", lineHeight: 1.3 }}>{widget.title}</div>
      <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
        {value === null ? "—" : formatCompact(value)}
        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-muted)" }}>{unit}</span>
      </div>
      {provenance && <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "6px" }}>{provenance}</div>}
    </div>
  );
}

const kpiStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "14px",
  padding: "16px",
};

/* ─────────────────────────── Widget dispatcher ──────────────────────────── */

function WidgetCard({ widget }: { widget: VisualizationSpec }) {
  const wide = ["forecast", "correlation_matrix", "anomaly_chart", "table"].includes(widget.type);
  return (
    <figure
      className={wide ? "dash-span-2" : ""}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "14px",
        padding: "18px",
        margin: 0,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <figcaption style={{ marginBottom: "10px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{widget.title}</div>
        {widget.subtitle != null && widget.subtitle !== "" && (
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>{widget.subtitle}</div>
        )}
      </figcaption>

      {widget.insightText != null && widget.insightText !== "" && (
        <div style={{ fontSize: "12px", color: "var(--accent-primary)", background: "var(--accent-light)", borderRadius: "8px", padding: "8px 10px", marginBottom: "10px" }}>
          ℹ {widget.insightText}
        </div>
      )}

      <WidgetBody widget={widget} />

      {widget.selectionReason != null && widget.selectionReason !== "" && (
        <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "10px" }} title="Why this visualization was chosen">
          {widget.selectionReason}
        </div>
      )}
    </figure>
  );
}

function WidgetBody({ widget }: { widget: VisualizationSpec }) {
  const data = asJson(widget.data);
  switch (widget.type) {
    case "line":
    case "area":
      return <LineBody data={data} />;
    case "bar":
    case "stacked_bar": {
      const count = Array.isArray(data.categories) ? data.categories.length : 0;
      return <BarBody data={data} horizontal={count > 8} />;
    }
    case "pie":
      return <PieBody data={data} />;
    case "histogram":
      return <HistogramBody data={data} />;
    case "scatter":
      return <ScatterBody data={data} />;
    case "heatmap":
    case "correlation_matrix": {
      const cols = Array.isArray(data.columns) ? data.columns.length : 8;
      return <HeatmapBody data={data} height={Math.max(340, cols * 44)} />;
    }
    case "forecast":
      return <ForecastBody data={data} />;
    case "table":
      return <TableWidget data={data} />;
    case "anomaly_chart":
      return <AnomalyTable data={data} />;
    case "text":
      return <TextWidget data={data} />;
    default:
      return <p style={{ color: "var(--text-muted)", fontSize: "12px" }}>Unsupported widget type.</p>;
  }
}

/* ───────────────────────────── Chart bodies ─────────────────────────────── */

function LineBody({ data }: { data: Json }) {
  const option = useMemo(() => lineOption(data), [data]);
  return <Chart height={300} option={option} />;
}

function BarBody({ data, horizontal }: { data: Json; horizontal: boolean }) {
  const count = Array.isArray(data.categories) ? data.categories.length : 10;
  const option = useMemo(() => barOption(data, horizontal), [data, horizontal]);
  return <Chart height={horizontal ? Math.max(260, Math.min(count * 30, 460)) : 300} option={option} />;
}

function PieBody({ data }: { data: Json }) {
  const option = useMemo(() => pieOption(data), [data]);
  return <Chart height={320} option={option} />;
}

function HistogramBody({ data }: { data: Json }) {
  const option = useMemo(() => histogramOption(data), [data]);
  return <Chart height={280} option={option} />;
}

function ScatterBody({ data }: { data: Json }) {
  const option = useMemo(() => scatterOption(data), [data]);
  return <Chart height={320} option={option} />;
}

function HeatmapBody({ data, height }: { data: Json; height: number }) {
  const option = useMemo(() => heatmapOption(data), [data]);
  return <Chart height={height} option={option} />;
}

function ForecastBody({ data }: { data: Json }) {
  const option = useMemo(() => forecastOption(data), [data]);
  return <Chart height={340} option={option} />;
}

/* ───────────────────────────── Table widgets ────────────────────────────── */

function TableWidget({ data }: { data: Json }) {
  const columns = Array.isArray(data.columns) ? (data.columns as unknown[]).map(String) : [];
  let rows: unknown[][] = [];
  if (Array.isArray(data.rows)) {
    rows = data.rows as unknown[][];
  } else if (Array.isArray(data.topRows) || Array.isArray(data.bottomRows)) {
    rows = [
      ...(Array.isArray(data.topRows) ? (data.topRows as unknown[][]) : []),
      ...(Array.isArray(data.bottomRows) ? [["…", "…"] as unknown[]] : []),
      ...(Array.isArray(data.bottomRows) ? (data.bottomRows as unknown[][]) : []),
    ];
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} style={{ textAlign: "left", padding: "8px 10px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)" }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 40).map((row, i) => (
            <tr key={i}>
              {row.slice(0, columns.length || row.length).map((cell, j) => (
                <td key={j} style={{ padding: "7px 10px", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>
                  {String(cell ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SEVERITY_COLORS: Record<string, string> = {
  high: "#e5484d",
  medium: "#f59e0b",
  low: "#8b96b8",
};

function AnomalyTable({ data }: { data: Json }) {
  const [expanded, setExpanded] = useState(false);
  const rows = Array.isArray(data.rows) ? (data.rows as Json[]) : [];
  const visible = expanded ? rows : rows.slice(0, 8);

  if (rows.length === 0) {
    return <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>No outliers flagged.</p>;
  }

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
        <thead>
          <tr>
            {["Severity", "Column", "Row", "Value", "Method"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "7px 9px", fontSize: "10.5px", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => {
            const severity = String(r.severity ?? "low");
            return (
              <tr key={i} title={String(r.explanation ?? "")}>
                <td style={{ padding: "6px 9px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: SEVERITY_COLORS[severity] ?? "#999" }} />
                  <span style={{ marginLeft: "6px", fontSize: "11px", color: "var(--text-secondary)" }}>{severity}</span>
                </td>
                <td style={{ padding: "6px 9px", borderBottom: "1px solid var(--border-subtle)" }}>{String(r.column ?? "")}</td>
                <td style={{ padding: "6px 9px", borderBottom: "1px solid var(--border-subtle)" }}>{r.rowIndex == null ? "—" : String(r.rowIndex)}</td>
                <td style={{ padding: "6px 9px", borderBottom: "1px solid var(--border-subtle)" }}>{typeof r.value === "number" ? r.value.toLocaleString() : "—"}</td>
                <td style={{ padding: "6px 9px", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-muted)", fontSize: "11px" }}>{String(r.method ?? "")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > 8 && (
        <button onClick={() => setExpanded(!expanded)} style={{ marginTop: "10px", background: "none", border: "none", color: "var(--accent-primary)", fontSize: "12px", fontWeight: 600, cursor: "pointer", padding: 0 }}>
          {expanded ? "Show less" : `Show all ${rows.length} outliers`}
        </button>
      )}
    </div>
  );
}

function TextWidget({ data }: { data: Json }) {
  const score = typeof data.qualityScore === "number" ? data.qualityScore : null;
  return (
    <div>
      <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", lineHeight: 1.6 }}>{String(data.text ?? "")}</p>
      {score !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }} role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={`Data quality score ${score} out of 100`}>
          <div style={{ flex: 1, height: "7px", borderRadius: "4px", background: "var(--bg-secondary)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${score}%`,
                borderRadius: "4px",
                background: score >= 80 ? "#2ea043" : score >= 60 ? "#f59e0b" : "#e5484d",
              }}
            />
          </div>
          <strong style={{ fontSize: "13px" }}>{score}/100</strong>
        </div>
      )}
    </div>
  );
}
