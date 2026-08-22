"use client";

/**
 * Datasets list: search, status filter, sorting and pagination over the
 * org's datasets, with re-analyze / delete actions.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Database, Search } from "lucide-react";
import { useI18n } from "@/i18n/LocaleProvider";
import { deleteDataset, listDatasets, reanalyzeDataset } from "@/actions/datasets";
import type { DatasetDTO } from "@/types/dto";

const PAGE_SIZE = 10;

type SortKey = "date" | "name" | "rows" | "quality";

export default function DatasetsClient() {
  const { d, locale } = useI18n();
  const [datasets, setDatasets] = useState<DatasetDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [page, setPage] = useState(1);

  const load = () => {
    startTransition(async () => {
      const res = await listDatasets();
      if (res.success) setDatasets(res.data);
      else toast.error(res.error);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = datasets;
    if (q) {
      list = list.filter(
        (d) => d.name.toLowerCase().includes(q) || d.originalFilename.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") list = list.filter((d) => d.status === statusFilter);
    switch (sortKey) {
      case "name":
        list = [...list].sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "rows":
        list = [...list].sort((a, b) => (b.rowCount ?? -1) - (a.rowCount ?? -1));
        break;
      case "quality":
        list = [...list].sort((a, b) => (b.qualityScore ?? -1) - (a.qualityScore ?? -1));
        break;
      default:
        list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return list;
  }, [datasets, query, statusFilter, sortKey]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => setPage(1), [query, statusFilter, sortKey]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this dataset and its stored files? This cannot be undone.")) return;
    const res = await deleteDataset(id);
    if (res.success) {
      toast.success(d.datasetsPage.deletedToast);
      load();
    } else {
      toast.error(res.error);
    }
  };

  const handleReanalyze = async (id: string) => {
    const res = await reanalyzeDataset(id);
    if (res.success) {
      toast.success(d.datasetsPage.requeuedToast);
      load();
    } else {
      toast.error(res.error);
    }
  };

  if (loading) return <SkeletonRows />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Toolbar */}
      <div className="panel" style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", padding: "13px 16px" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: "340px" }}>
          <Search size={15} color="var(--text-muted)" style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={d.datasetsPage.searchPlaceholder}
            aria-label="Search datasets"
            style={{
              width: "100%", padding: "9px 12px 9px 34px", borderRadius: "8px",
              border: "1px solid var(--border-color)", background: "var(--bg-primary)",
              color: "var(--text-primary)", fontSize: "13px",
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          style={{ padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "13px" }}
        >
          <option value="all">{d.datasetsPage.allStatuses}</option>
          <option value="ready">{d.datasetsPage.ready}</option>
          <option value="processing">{d.datasetsPage.processing}</option>
          <option value="failed">{d.datasetsPage.failed}</option>
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          aria-label="Sort datasets"
          style={{ padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "13px" }}
        >
          <option value="date">{d.datasetsPage.sortNewest}</option>
          <option value="name">{d.datasetsPage.sortName}</option>
          <option value="rows">{d.datasetsPage.sortRows}</option>
          <option value="quality">{d.datasetsPage.sortQuality}</option>
        </select>
        <span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "auto" }}>
          {filtered.length} dataset{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="panel" style={emptyState}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px", color: "var(--text-muted)" }}>
            <Database size={38} strokeWidth={1.5} />
          </div>
          <h3 style={{ fontWeight: 700, marginBottom: "6px", fontSize: "16px", color: "var(--text-primary)" }}>
            {datasets.length === 0 ? d.datasetsPage.emptyTitle : d.datasetsPage.emptyFilteredTitle}
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "13.5px", marginBottom: "18px", maxWidth: "420px" }}>
            {datasets.length === 0
              ? "Upload your first CSV, XLSX or JSON file to generate an automated dashboard and executive report."
              : "Try a different search term or clear the filters."}
          </p>
          {datasets.length === 0 ? (
            <Link href="/dashboard/upload" style={primaryButton}>Upload a dataset</Link>
          ) : (
            <button
              onClick={() => { setQuery(""); setStatusFilter("all"); }}
              style={{ ...smallBtnGhost, margin: "0 auto" }}
            >
              {d.common.clearFilters}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px", minWidth: "760px" }}>
              <thead>
                <tr>
                  {[d.common.name, d.common.type, d.common.status, d.common.quality, d.common.domain, d.common.rows, d.common.size, d.common.uploaded, d.common.actions].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((d) => (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td style={td}>
                      <Link href={`/dashboard/datasets/${d.id}`} style={{ color: "var(--accent-primary)", fontWeight: 600, textDecoration: "none" }}>
                        {d.name}
                      </Link>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{d.originalFilename}</div>
                    </td>
                    <td style={td}><FileTypeBadge type={d.fileType} /></td>
                    <td style={td}><StatusBadge status={d.status} /></td>
                    <td style={td}>
                      {d.qualityScore !== null ? (
                        <QualityBadge score={d.qualityScore} />
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, color: "var(--text-secondary)" }}>{d.domain ? d.domain.domain.replace(/_/g, " ") : "—"}</td>
                    <td style={td}>{d.rowCount?.toLocaleString() ?? "—"}</td>
                    <td style={{ ...td, color: "var(--text-secondary)" }}>{formatSize(d.sizeBytes)}</td>
                    <td style={{ ...td, color: "var(--text-muted)", fontSize: "12px", whiteSpace: "nowrap" }}>
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        {d.hasResults && (
                          <Link href={`/dashboard/datasets/${d.id}`} style={smallBtn}>Open</Link>
                        )}
                        <button onClick={() => handleReanalyze(d.id)} disabled={pending} style={smallBtnGhost}>Re-run</button>
                        <button onClick={() => handleDelete(d.id)} disabled={pending} style={{ ...smallBtnGhost, color: "#e5484d" }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "10px" }}>
              <button onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} style={pagerBtn}>{d.common.prev}</button>
              <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
                {d.common.pageOf(safePage, pageCount)}
              </span>
              <button onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount} style={pagerBtn}>{d.common.next}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function QualityBadge({ score }: { score: number }) {
  const color = score >= 80 ? "#2ea043" : score >= 60 ? "#f59e0b" : "#e5484d";
  return (
    <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 9px", borderRadius: "999px", background: `${color}20`, color }}>
      {score}/100
    </span>
  );
}

function SkeletonRows() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: "52px" }} />
      ))}
    </div>
  );
}

function FileTypeBadge({ type }: { type: string }) {
  return (
    <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "6px", background: "var(--bg-secondary)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    ready: { bg: "rgba(46,160,67,0.15)", fg: "#2ea043" },
    processing: { bg: "rgba(80,139,254,0.15)", fg: "#508bfe" },
    uploading: { bg: "rgba(80,139,254,0.15)", fg: "#508bfe" },
    failed: { bg: "rgba(229,72,77,0.15)", fg: "#e5484d" },
    deleted: { bg: "rgba(150,150,150,0.15)", fg: "#999" },
  };
  const s = map[status] ?? { bg: "var(--bg-secondary)", fg: "var(--text-muted)" };
  return (
    <span style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "999px", background: s.bg, color: s.fg, fontWeight: 600, textTransform: "capitalize" }}>
      {status}
    </span>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "12px",
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
};
const td: React.CSSProperties = { padding: "12px", verticalAlign: "middle" };
const emptyState: React.CSSProperties = {
  textAlign: "center",
  padding: "64px 24px",
};
const primaryButton: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 20px",
  borderRadius: "8px",
  background: "var(--brand-gradient)",
  color: "#fff",
  fontWeight: 600,
  fontSize: "14px",
  textDecoration: "none",
};
const smallBtn: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: "6px",
  background: "var(--accent-light)",
  color: "var(--accent-primary)",
  fontWeight: 600,
  fontSize: "12px",
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
};
const smallBtnGhost: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: "6px",
  background: "transparent",
  border: "1px solid var(--border-color)",
  color: "var(--text-secondary)",
  fontWeight: 600,
  fontSize: "12px",
  cursor: "pointer",
};
const pagerBtn: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: "7px",
  border: "1px solid var(--border-color)",
  background: "var(--bg-card)",
  color: "var(--text-secondary)",
  fontSize: "12.5px",
  fontWeight: 600,
  cursor: "pointer",
};
