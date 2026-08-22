"use client";

/**
 * Column profiling view: per-column statistics, distributions and top values.
 * Renders inline CSS micro-charts (no chart library) so wide schemas stay fast.
 */
import { useMemo, useState } from "react";
import { useI18n } from "@/i18n/LocaleProvider";
import { Search } from "lucide-react";
import type { ColumnProfile } from "@/types/analytics";

const TYPE_TONES: Record<string, { bg: string; fg: string }> = {
  numeric: { bg: "rgba(80,139,254,0.14)", fg: "#508bfe" },
  integer: { bg: "rgba(80,139,254,0.14)", fg: "#508bfe" },
  date: { bg: "rgba(168,85,247,0.14)", fg: "#a855f7" },
  datetime: { bg: "rgba(168,85,247,0.14)", fg: "#a855f7" },
  boolean: { bg: "rgba(34,197,94,0.14)", fg: "#22c55e" },
  categorical: { bg: "rgba(245,158,11,0.14)", fg: "#f59e0b" },
  text: { bg: "rgba(139,150,184,0.16)", fg: "#8b96b8" },
  identifier: { bg: "rgba(139,150,184,0.16)", fg: "#8b96b8" },
  unknown: { bg: "rgba(139,150,184,0.16)", fg: "#8b96b8" },
};

type SortKey = "name" | "nulls" | "unique";

export default function ColumnsProfileTab({ columns }: { columns: ColumnProfile[] }) {
  const { d } = useI18n();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = columns;
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    if (roleFilter !== "all") list = list.filter((c) => c.role === roleFilter);
    if (sortKey === "nulls") list = [...list].sort((a, b) => b.nullPercentage - a.nullPercentage);
    else if (sortKey === "unique") list = [...list].sort((a, b) => b.uniqueCount - a.uniqueCount);
    else list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [columns, query, sortKey, roleFilter]);

  const roles = useMemo(() => ["all", ...new Set(columns.map((c) => c.role))], [columns]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Controls */}
      <div className="panel" style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", padding: "13px 16px" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: "340px" }}>
          <Search size={15} color="var(--text-muted)" style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={d.columnsTab.filterPlaceholder}
            aria-label="Filter columns"
            style={{
              width: "100%", padding: "9px 12px 9px 34px", borderRadius: "8px",
              border: "1px solid var(--border-color)", background: "var(--bg-primary)",
              color: "var(--text-primary)", fontSize: "13px",
            }}
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter by role"
          style={{ padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "13px" }}
        >
          {roles.map((r) => (
            <option key={r} value={r}>{r === "all" ? d.columnsTab.allRoles : r}</option>
          ))}
        </select>
        <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
          {(["name", "nulls", "unique"] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              style={{
                padding: "7px 12px", fontSize: "12px", fontWeight: sortKey === k ? 700 : 500,
                borderRadius: "7px", cursor: "pointer",
                border: `1px solid ${sortKey === k ? "var(--accent-primary)" : "var(--border-color)"}`,
                background: sortKey === k ? "var(--accent-light)" : "transparent",
                color: sortKey === k ? "var(--accent-primary)" : "var(--text-secondary)",
                textTransform: "capitalize",
              }}
            >
              {k === "nulls" ? d.columnsTab.mostNulls : k === "unique" ? d.columnsTab.mostUnique : d.columnsTab.az}
            </button>
          ))}
        </div>
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          {d.columnsTab.showingOf(visible.length, columns.length)}
        </span>
      </div>

      {/* Column cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "14px" }}>
        {visible.map((col) => (
          <ColumnCard key={`${col.normalizedName}-${col.name}`} col={col} totalRows={columns.length} />
        ))}
      </div>
    </div>
  );
}

function ColumnCard({ col }: { col: ColumnProfile; totalRows: number }) {
  const { d } = useI18n();
  const tone = TYPE_TONES[col.inferredType] ?? TYPE_TONES.unknown;
  const maxTopValue = col.topValues.length > 0 ? Math.max(...col.topValues.map((t) => t.count)) : 0;

  return (
    <article className="panel" style={{ padding: "16px", margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "14px", color: "var(--text-primary)", wordBreak: "break-all" }}>{col.name}</strong>
        <span style={{ fontSize: "10.5px", padding: "2px 8px", borderRadius: "6px", background: tone.bg, color: tone.fg, fontWeight: 700, textTransform: "capitalize" }}>
          {col.inferredType}
        </span>
        <span style={{ fontSize: "10.5px", padding: "2px 8px", borderRadius: "6px", background: "var(--bg-secondary)", color: "var(--text-muted)", fontWeight: 600 }}>
          {col.role}
        </span>
      </header>

      {/* Stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))", gap: "8px" }}>
        <MiniStat label={d.columnsTab.nulls} value={`${col.nullPercentage.toFixed(1)}%`} warn={col.nullPercentage > 30} />
        <MiniStat label={d.columnsTab.unique} value={formatCompactNumber(col.uniqueCount)} />
        {col.min !== undefined && col.min !== null && (
          <>
            <MiniStat label={d.columnsTab.min} value={formatCompactNumber(col.min)} />
            <MiniStat label={d.columnsTab.max} value={formatCompactNumber(col.max)} />
            <MiniStat label={d.columnsTab.mean} value={formatCompactNumber(col.mean ?? null)} />
            <MiniStat label={d.columnsTab.median} value={formatCompactNumber(col.median ?? null)} />
            <MiniStat label={d.columnsTab.stdDev} value={formatCompactNumber(col.stdDev ?? null)} />
          </>
        )}
      </div>

      {/* Date range */}
      {col.dateRange && (
        <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", background: "var(--bg-secondary)", borderRadius: "8px", padding: "7px 10px" }}>
          📅 {col.dateRange.min} → {col.dateRange.max}
        </div>
      )}

      {/* Histogram */}
      {col.histogram.length > 0 && (
        <section>
          <CardLabel>{d.columnsTab.distribution}</CardLabel>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "56px" }} role="img" aria-label={`Distribution of ${col.name}`}>
            {col.histogram.map((bucket, i) => {
              const max = Math.max(...col.histogram.map((b) => b.count)) || 1;
              return (
                <div
                  key={i}
                  title={`${bucket.bucket}: ${bucket.count.toLocaleString()}`}
                  style={{
                    flex: 1,
                    height: `${Math.max(4, (bucket.count / max) * 100)}%`,
                    background: "linear-gradient(180deg, var(--accent-primary), var(--accent-hover))",
                    borderRadius: "3px 3px 0 0",
                    opacity: 0.85,
                    minWidth: "4px",
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Top values */}
      {col.topValues.length > 0 && (
        <section>
          <CardLabel>{d.columnsTab.topValues}</CardLabel>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "5px" }}>
            {col.topValues.slice(0, 5).map((tv, i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "minmax(60px, 38%) 1fr auto", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tv.value}>
                  {tv.value || <em style={{ color: "var(--text-muted)" }}>(empty)</em>}
                </span>
                <div style={{ height: "7px", borderRadius: "4px", background: "var(--bg-secondary)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${maxTopValue > 0 ? Math.max(3, (tv.count / maxTopValue) * 100) : 3}%`,
                      background: "var(--brand-gradient)",
                      borderRadius: "4px",
                    }}
                  />
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{tv.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sample values for columns with neither chart nor stats */}
      {col.histogram.length === 0 && col.topValues.length === 0 && col.sampleValues.length > 0 && (
        <section>
          <CardLabel>{d.columnsTab.sampleValues}</CardLabel>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            {col.sampleValues.slice(0, 5).map((v, i) => (
              <span key={i} style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "6px", background: "var(--bg-secondary)", color: "var(--text-secondary)", fontFamily: "monospace", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v}>
                {v}
              </span>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function MiniStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ background: "var(--bg-secondary)", borderRadius: "8px", padding: "7px 9px", minWidth: 0 }}>
      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "2px", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: "12.5px", fontWeight: 700, color: warn ? "#f59e0b" : "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={value}>
        {value}
      </div>
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "7px" }}>
      {children}
    </div>
  );
}

function formatCompactNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(v / 1_000).toFixed(1)}k`;
  if (abs >= 100) return v.toFixed(0);
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 1000) / 1000);
}
