"use client";

/**
 * @file src/components/dashboard/ExplorerClient.tsx
 * @description Client shell for the Data Explorer page.
 * Handles state for: filters, pagination, detail modal, delete, and CSV export.
 */

import { useState, useTransition } from "react";
import { ExtractionListItem, ExtractionDetail, deleteExtractedData, getExtractedDataDetail, exportExtractedDataAsCsv } from "@/actions/data-explorer";
import { ExtractionStatus, SupportedFileType } from "@/types";

interface ExplorerClientProps {
  initialData: { items: ExtractionListItem[]; total: number };
  initialStatusFilter: string;
  initialTypeFilter: string;
}

export default function ExplorerClient({ initialData, initialStatusFilter, initialTypeFilter }: ExplorerClientProps) {
  const [items, setItems] = useState<ExtractionListItem[]>(initialData.items);
  const [total, setTotal] = useState(initialData.total);
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [typeFilter, setTypeFilter] = useState(initialTypeFilter);
  
  const [selectedItem, setSelectedItem] = useState<ExtractionDetail | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Handlers ──
  
  const handleFilterChange = (type: "status" | "fileType", value: string) => {
    const newStatus = type === "status" ? value : statusFilter;
    const newType = type === "fileType" ? value : typeFilter;
    
    // Instead of doing full client-side routing here, we just use window.location
    // to trigger a fresh SSR fetch with the query params.
    const params = new URLSearchParams();
    if (newStatus !== "all") params.set("status", newStatus);
    if (newType !== "all") params.set("type", newType);
    
    window.location.search = params.toString();
  };

  const handleExportCsv = () => {
    startTransition(async () => {
      const res = await exportExtractedDataAsCsv({
        status: statusFilter === "all" ? undefined : (statusFilter as ExtractionStatus),
        fileType: typeFilter === "all" ? undefined : (typeFilter as SupportedFileType),
      });

      if (!res.success) {
        showToast(res.error, "error");
        return;
      }

      // Trigger file download
      const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.filename;
      a.click();
      URL.revokeObjectURL(url);
      
      showToast("Export successful!");
    });
  };

  const openDetail = (id: string) => {
    startTransition(async () => {
      const res = await getExtractedDataDetail(id);
      if (!res.success) {
        showToast(res.error, "error");
      } else {
        setSelectedItem(res.data);
        setDetailModalOpen(true);
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this record?")) return;
    
    startTransition(async () => {
      const res = await deleteExtractedData(id);
      if (!res.success) {
        showToast(res.error, "error");
      } else {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setTotal((prev) => prev - 1);
        if (detailModalOpen && selectedItem?.id === id) {
          setDetailModalOpen(false);
        }
        showToast("Record deleted.");
      }
    });
  };

  // ── Rendering Helpers ──

  const getStatusBadge = (status: ExtractionStatus) => {
    const colors = {
      [ExtractionStatus.PENDING]: { bg: "#f59e0b20", color: "#f59e0b" },
      [ExtractionStatus.PROCESSING]: { bg: "#3b82f620", color: "#3b82f6" },
      [ExtractionStatus.COMPLETED]: { bg: "#10b98120", color: "#10b981" },
      [ExtractionStatus.FAILED]: { bg: "#ef444420", color: "#ef4444" },
    };
    const c = colors[status] || { bg: "var(--bg-secondary)", color: "var(--text-muted)" };
    return (
      <span style={{ padding: "4px 10px", borderRadius: "100px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", background: c.bg, color: c.color, border: `1px solid ${c.color}30` }}>
        {status}
      </span>
    );
  };

  const getFileIcon = (type: SupportedFileType) => {
    const icons = { [SupportedFileType.EXCEL]: "📊", [SupportedFileType.JSON]: "📋", [SupportedFileType.PDF]: "📄", [SupportedFileType.IMAGE]: "🖼️" };
    return icons[type] || "📁";
  };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "32px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: "6px" }}>
            Data Explorer
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            View, search, and export your AI-extracted data. <span style={{ fontWeight: 600 }}>{total} records found.</span>
          </p>
        </div>
        
        <div style={{ display: "flex", gap: "12px" }}>
          {/* Filters */}
          <select
            value={typeFilter}
            onChange={(e) => handleFilterChange("fileType", e.target.value)}
            disabled={isPending}
            style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px", outline: "none", cursor: "pointer" }}
          >
            <option value="all">All File Types</option>
            {Object.values(SupportedFileType).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          
          <select
            value={statusFilter}
            onChange={(e) => handleFilterChange("status", e.target.value)}
            disabled={isPending}
            style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "13px", outline: "none", cursor: "pointer" }}
          >
            <option value="all">All Statuses</option>
            {Object.values(ExtractionStatus).map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Export Button */}
          <button
            onClick={handleExportCsv}
            disabled={isPending}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--accent-primary)50", background: "var(--accent-light)", color: "var(--accent-primary)", fontSize: "13px", fontWeight: 600, cursor: isPending ? "not-allowed" : "pointer", transition: "all 0.2s" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* ── List ── */}
      {items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 24px", borderRadius: "16px", border: "2px dashed var(--border-color)", background: "var(--bg-card)" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔍</div>
          <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>No records found</h3>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Try adjusting your filters or upload a new file.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px" }}>
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => openDetail(item.id)}
              style={{ padding: "20px", borderRadius: "12px", border: "1px solid var(--border-color)", background: "var(--bg-card)", cursor: "pointer", transition: "transform 0.2s, box-shadow 0.2s", display: "flex", flexDirection: "column", gap: "12px" }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--card-shadow)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <span style={{ fontSize: "20px" }}>{getFileIcon(item.fileType)}</span>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", wordBreak: "break-all" }}>
                    {item.fileName}
                  </div>
                </div>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {getStatusBadge(item.status)}
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{new Date(item.createdAt).toLocaleDateString()}</span>
              </div>

              {item.status === ExtractionStatus.FAILED && item.errorMessage && (
                <div style={{ fontSize: "12px", color: "#ef4444", background: "#ef444410", padding: "8px", borderRadius: "6px" }}>
                  {item.errorMessage.slice(0, 80)}{item.errorMessage.length > 80 ? "..." : ""}
                </div>
              )}

              {item.status === ExtractionStatus.COMPLETED && item.resultPreview && (
                <div style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-secondary)", background: "var(--bg-primary)", padding: "10px", borderRadius: "6px", wordBreak: "break-all" }}>
                  {item.resultPreview}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Detail Modal ── */}
      {detailModalOpen && selectedItem && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }} onClick={(e) => { if (e.target === e.currentTarget) setDetailModalOpen(false); }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }} />
          <div style={{ position: "relative", width: "100%", maxWidth: "800px", maxHeight: "90vh", display: "flex", flexDirection: "column", borderRadius: "16px", border: "1px solid var(--border-color)", background: "var(--bg-card)", boxShadow: "0 32px 80px rgba(0,0,0,0.5)", overflow: "hidden" }}>
            
            {/* Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "var(--bg-secondary)" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                  <span style={{ fontSize: "24px" }}>{getFileIcon(selectedItem.fileType)}</span>
                  <h2 style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)", wordBreak: "break-all" }}>{selectedItem.fileName}</h2>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {getStatusBadge(selectedItem.status)}
                  <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{new Date(selectedItem.createdAt).toLocaleString()}</span>
                  <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>ID: <span style={{ fontFamily: "monospace" }}>{selectedItem.id}</span></span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => handleDelete(selectedItem.id)} disabled={isPending || selectedItem.status === ExtractionStatus.PROCESSING} style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid #ef444440", background: "#ef444410", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Delete Record">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
                <button onClick={() => setDetailModalOpen(false)} style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ✕
                </button>
              </div>
            </div>

            {/* Content (Scrollable) */}
            <div style={{ padding: "24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "24px" }}>
              
              {selectedItem.status === ExtractionStatus.FAILED && selectedItem.errorMessage && (
                <div>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Error Details</h3>
                  <div style={{ padding: "16px", borderRadius: "8px", background: "#ef444410", border: "1px solid #ef444430", color: "#ef4444", fontSize: "14px", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                    {selectedItem.errorMessage}
                  </div>
                </div>
              )}

              {selectedItem.result && (
                <div>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", justifyContent: "space-between" }}>
                    <span>Structured Result JSON</span>
                    <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(selectedItem.result, null, 2)); showToast("JSON Copied!"); }} style={{ background: "none", border: "none", color: "var(--accent-primary)", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>Copy</button>
                  </h3>
                  <div style={{ padding: "16px", borderRadius: "8px", background: "var(--bg-primary)", border: "1px solid var(--border-color)", overflowX: "auto" }}>
                    <pre style={{ fontSize: "13px", fontFamily: "monospace", color: "var(--text-primary)", margin: 0 }}>
                      {JSON.stringify(selectedItem.result, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {selectedItem.rawText && (
                <div>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Parsed Raw Text</h3>
                  <div style={{ padding: "16px", borderRadius: "8px", background: "var(--bg-primary)", border: "1px solid var(--border-color)", maxHeight: "300px", overflowY: "auto" }}>
                    <pre style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-muted)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                      {selectedItem.rawText}
                    </pre>
                  </div>
                </div>
              )}
              
              {selectedItem.prompt && (
                <div>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>AI Prompt</h3>
                  <div style={{ padding: "16px", borderRadius: "8px", background: "var(--bg-primary)", border: "1px solid var(--border-color)" }}>
                    <pre style={{ fontSize: "13px", fontFamily: "Inter, sans-serif", color: "var(--text-primary)", margin: 0, whiteSpace: "pre-wrap" }}>
                      {selectedItem.prompt}
                    </pre>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 200, padding: "14px 20px", borderRadius: "10px", background: toast.type === "success" ? "#10b981" : "#ef4444", color: "#fff", fontSize: "14px", fontWeight: 600, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", animation: "fadeInUp 0.3s ease" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
