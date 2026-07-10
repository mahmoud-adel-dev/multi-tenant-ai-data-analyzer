"use client";

/**
 * @file src/components/dashboard/UploadForm.tsx
 * @description Drag-and-drop file upload form for the tenant dashboard.
 * "use client" — needed for drag events, file state, and action feedback.
 */

import { useState, useRef, useTransition } from "react";
import { uploadAndAnalyzeFile } from "@/actions/data-extraction";

const ACCEPTED_TYPES = ".xlsx,.xls,.json,.pdf,.jpg,.jpeg,.png,.webp";
const ACCEPTED_LABELS = ["Excel (.xlsx, .xls)", "JSON (.json)", "PDF (.pdf)", "Images (.jpg, .png, .webp)"];

const FILE_ICONS: Record<string, string> = {
  excel: "📊",
  json:  "📋",
  pdf:   "📄",
  image: "🖼️",
};

function getFileCategory(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["xlsx", "xls"].includes(ext)) return "excel";
  if (ext === "json")               return "json";
  if (ext === "pdf")                return "pdf";
  return "image";
}

export default function UploadForm() {
  const [dragOver,    setDragOver]    = useState(false);
  const [file,        setFile]        = useState<File | null>(null);
  const [prompt,      setPrompt]      = useState("");
  const [isPending,   startTransition]= useTransition();
  const [error,       setError]       = useState<string | null>(null);
  const [result,      setResult]      = useState<Record<string, unknown> | null>(null);
  const [resultStatus, setResultStatus] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) { setFile(dropped); setError(null); setResult(null); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) { setFile(selected); setError(null); setResult(null); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    if (prompt.trim()) formData.append("prompt", prompt.trim());

    startTransition(async () => {
      const res = await uploadAndAnalyzeFile(formData);
      if (!res.success) {
        setError(res.error);
      } else {
        setResultStatus(res.data.status);
        setResult(res.data.result);
        if (res.data.status === "completed") setFile(null);
      }
    });
  };

  const category = file ? getFileCategory(file.name) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* ── Drop Zone ── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          padding: "48px 24px",
          borderRadius: "16px",
          border: `2px dashed ${dragOver ? "var(--accent-primary)" : "var(--border-color)"}`,
          background: dragOver ? "var(--accent-light)" : "var(--bg-card)",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.2s ease",
          transform: dragOver ? "scale(1.01)" : "scale(1)",
        }}
      >
        <input ref={inputRef} type="file" accept={ACCEPTED_TYPES} onChange={handleFileChange} style={{ display: "none" }} />

        {file ? (
          <>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>{FILE_ICONS[category!] ?? "📁"}</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>{file.name}</div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              {(file.size / 1024).toFixed(1)} KB · {category?.toUpperCase()}
            </div>
            <button onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }} style={{ marginTop: "12px", padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-muted)", fontSize: "12px", cursor: "pointer" }}>
              Remove
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>📂</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>Drop your file here, or click to browse</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
              {ACCEPTED_LABELS.map((label) => (
                <span key={label} style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "100px", background: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-muted)" }}>
                  {label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Custom Prompt ── */}
      <div>
        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
          Custom Extraction Prompt <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span>
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g., "Extract only vendor names, invoice numbers, and total amounts"'
          rows={2}
          style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "14px", outline: "none", fontFamily: "inherit", resize: "vertical" }}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent-primary)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border-color)")}
        />
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", background: "#ef444420", border: "1px solid #ef444440", color: "#ef4444", fontSize: "13px" }}>
          ❌ {error}
        </div>
      )}

      {/* ── Processing Indicator ── */}
      {isPending && (
        <div style={{ padding: "16px", borderRadius: "10px", background: "var(--accent-light)", border: "1px solid var(--accent-primary)30", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "20px", height: "20px", borderRadius: "50%", border: "2px solid var(--accent-primary)", borderTopColor: "transparent", animation: "spin-slow 0.8s linear infinite", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>Analyzing your file…</div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>Parsing → AI Extraction → Saving results</div>
          </div>
        </div>
      )}

      {/* ── Result ── */}
      {result && !isPending && (
        <div style={{ borderRadius: "12px", border: `1px solid ${resultStatus === "completed" ? "#10b98150" : "#ef444450"}`, background: "var(--bg-card)", overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", background: resultStatus === "completed" ? "#10b98115" : "#ef444415", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>{resultStatus === "completed" ? "✅" : "❌"}</span>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
              {resultStatus === "completed" ? "Extraction Complete!" : `Status: ${resultStatus}`}
            </span>
          </div>
          <div style={{ padding: "16px", overflowX: "auto" }}>
            <pre style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* ── Submit ── */}
      <button
        onClick={handleSubmit}
        disabled={!file || isPending}
        style={{
          padding: "13px",
          borderRadius: "10px",
          background: (!file || isPending) ? "var(--text-muted)" : "var(--brand-gradient)",
          color: "#fff",
          fontSize: "15px",
          fontWeight: 700,
          border: "none",
          cursor: (!file || isPending) ? "not-allowed" : "pointer",
          boxShadow: (!file || isPending) ? "none" : "0 4px 16px var(--accent-glow)",
          transition: "all 0.2s",
        }}
      >
        {isPending ? "Processing…" : "🚀 Analyze File"}
      </button>
    </div>
  );
}
