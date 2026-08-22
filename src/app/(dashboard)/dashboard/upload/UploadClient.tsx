"use client";

/**
 * Upload workspace: drag-and-drop ingestion, client-side structural checks,
 * a live pipeline view backed by real job progress, and plan-limit guidance.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "react-hot-toast";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  Gauge,
  Loader2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UploadCloud,
  X,
} from "lucide-react";
import { getJobStatus } from "@/actions/datasets";
import { useI18n } from "@/i18n/LocaleProvider";

const ACCEPT = ".csv,.tsv,.xlsx,.json";
const ALLOWED_EXTENSIONS = new Set(["csv", "tsv", "xlsx", "json"]);

type UploadResult =
  | { success: true; data: { jobId: string; datasetId: string }; message?: string }
  | { success: false; error: string; code?: string };

type FileCheck = {
  status: "idle" | "checking" | "valid" | "invalid";
  pct: number;
  message: string;
};

type PreviewInfo = {
  rows: number | null;
  columns: string[];
};

type Progress = { stage: string; pct: number; status: string; label: string };

interface UploadClientProps {
  maxUploadBytes: number;
  maxRows: number;
}

/** Ordered pipeline ladder surfaced to the user. Keys map to JobStatus/stage values. */
const PIPELINE_STAGES: Array<{ key: string; hintKey: "hintQueued" | "hintParsing" | "hintAnalyzing" | "hintDashboard" | "hintReport" }> = [
  { key: "queued", hintKey: "hintQueued" },
  { key: "parsing", hintKey: "hintParsing" },
  { key: "analyzing", hintKey: "hintAnalyzing" },
  { key: "generating_dashboard", hintKey: "hintDashboard" },
  { key: "generating_report", hintKey: "hintReport" },
];

const STAGE_LABEL_KEYS = {
  uploading: "stageUploading",
  validating: "stageValidating",
  queued: "stageQueued",
  parsing: "stageParsing",
  analyzing: "stageAnalyzing",
  generating_dashboard: "stageDashboard",
  generating_report: "stageReport",
  completed: "stageDone",
} as const;

const STAGE_ALIASES: Record<string, string> = {
  claimed: "parsing",
  scanning: "parsing",
  profiling: "analyzing",
  created: "queued",
  retry_scheduled: "queued",
};

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Maps raw backend errors to dictionary keys; technical text stays available. */
function classifyAnalysisError(message: string): "errContract" | "errTimeout" | "errMemory" | null {
  if (/contract validation/i.test(message)) return "errContract";
  if (/timeout|timed out|abort/i.test(message)) return "errTimeout";
  if (/memory|heap|OOM/i.test(message)) return "errMemory";
  return null;
}

function readAsText(file: File, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    reader.onerror = () => reject(new Error("The browser could not read this file."));
    reader.readAsText(file);
  });
}

function assertJsonRecords(value: unknown): Record<string, unknown>[] {
  let records: unknown[];
  if (Array.isArray(value)) {
    records = value;
  } else if (value !== null && typeof value === "object") {
    const arrays = Object.values(value as Record<string, unknown>).filter(Array.isArray) as unknown[][];
    records = arrays.length
      ? arrays.reduce((largest, current) => current.length > largest.length ? current : largest)
      : [value];
  } else {
    throw new Error("JSON must contain an object or an array of record objects.");
  }

  if (records.length === 0) throw new Error("JSON contains no records to analyze.");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === null || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`JSON record ${index + 1} must be an object with named fields.`);
    }
  }
  if (Object.keys(records[0] as Record<string, unknown>).length === 0) {
    throw new Error("JSON records do not contain fields to analyze.");
  }
  return records as Record<string, unknown>[];
}

async function inspectFile(
  file: File,
  maxUploadBytes: number,
  onProgress: (pct: number) => void
): Promise<{ message: string; preview: PreviewInfo }> {
  const extension = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported format. Choose CSV, TSV, XLSX, or JSON.");
  }
  if (file.size === 0) throw new Error("The selected file is empty.");
  if (file.size > maxUploadBytes) {
    throw new Error(
      `This file is ${formatBytes(file.size)}, but your plan allows up to ${formatBytes(maxUploadBytes)}.`
    );
  }

  if (extension === "xlsx") {
    const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    onProgress(100);
    if (
      signature.length < 4 ||
      signature[0] !== 0x50 ||
      signature[1] !== 0x4b ||
      ![0x03, 0x05, 0x07].includes(signature[2])
    ) {
      throw new Error("This is not a valid XLSX workbook (ZIP signature is missing).");
    }
    return {
      message: "XLSX signature is valid. Full workbook validation will run on the server.",
      preview: { rows: null, columns: [] },
    };
  }

  if (extension === "json") {
    const text = (await readAsText(file, onProgress)).replace(/^\uFEFF/, "");
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      const detail = error instanceof SyntaxError ? error.message : "Invalid JSON syntax.";
      throw new Error(`Invalid JSON: ${detail}`);
    }
    const records = assertJsonRecords(value);
    const columns = new Set<string>();
    for (const record of records.slice(0, 20)) {
      Object.keys(record).forEach((k) => columns.add(k));
    }
    return {
      message: `Valid tabular JSON detected (${records.length.toLocaleString()} records).`,
      preview: { rows: records.length, columns: [...columns].slice(0, 40) },
    };
  }

  const sample = await file.slice(0, Math.min(file.size, 128 * 1024)).text();
  onProgress(100);
  const clean = sample.replace(/^\uFEFF/, "").trim();
  if (!clean) throw new Error("The file contains no readable data.");
  const lines = clean.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("The file needs a header and at least one data row.");
  const delimiter = extension === "tsv" ? "\t" : [",", ";", "|"].sort(
    (a, b) => lines[0].split(b).length - lines[0].split(a).length
  )[0];
  const headerColumns = lines[0]
    .split(delimiter)
    .map((c) => c.replace(/^"|"$/g, "").trim())
    .filter(Boolean)
    .slice(0, 40);

  if (!lines[0].includes(delimiter)) {
    return {
      message: "A single-column dataset was detected. Server validation will verify all rows.",
      preview: { rows: null, columns: headerColumns },
    };
  }
  return {
    message: "Header and data rows detected. Full row validation will run on the server.",
    preview: { rows: null, columns: headerColumns },
  };
}

function uploadWithProgress(
  formData: FormData,
  onUploadProgress: (pct: number) => void,
  onUploadComplete: () => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/datasets/upload");
    xhr.timeout = 20 * 60 * 1000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.upload.onload = onUploadComplete;
    xhr.onerror = () => reject(new Error("Network error while uploading the file."));
    xhr.ontimeout = () => reject(new Error("The upload timed out. Please try a smaller file."));
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as UploadResult;
        resolve(body);
      } catch {
        reject(new Error(`The server returned an invalid response (HTTP ${xhr.status}).`));
      }
    };
    xhr.send(formData);
  });
}

export default function UploadClient({ maxUploadBytes, maxRows }: UploadClientProps) {
  const router = useRouter();
  const { d } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [name, setName] = useState("");
  const [contextPrompt, setContextPrompt] = useState("");
  const [dragging, setDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileCheck, setFileCheck] = useState<FileCheck>({
    status: "idle",
    pct: 0,
    message: "Select a file to validate it before analysis.",
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkSequence = useRef(0);
  const startedAtRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // Elapsed-time ticker for the live pipeline view.
  useEffect(() => {
    if (!isUploading) return;
    const timer = setInterval(() => {
      if (startedAtRef.current) setElapsedMs(Date.now() - startedAtRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [isUploading]);

  const resetFileState = useCallback(() => {
    setFile(null);
    setPreview(null);
    setSubmitError(null);
    setProgress(null);
    setFileCheck({ status: "idle", pct: 0, message: "Select a file to validate it before analysis." });
  }, []);

  const handleFileChange = useCallback(
    async (selected: File | null) => {
      const sequence = ++checkSequence.current;
      setFile(selected);
      setPreview(null);
      setSubmitError(null);
      setProgress(null);
      if (!selected) {
        setFileCheck({ status: "idle", pct: 0, message: "Select a file to validate it before analysis." });
        return;
      }

      setFileCheck({ status: "checking", pct: 0, message: "Checking file structure..." });
      try {
        const { message: checkMessage, preview: info } = await inspectFile(selected, maxUploadBytes, (pct) => {
          if (sequence === checkSequence.current) {
            setFileCheck({ status: "checking", pct, message: "Checking file structure..." });
          }
        });
        if (sequence === checkSequence.current) {
          setFileCheck({ status: "valid", pct: 100, message: checkMessage });
          setPreview(info);
        }
      } catch (error) {
        if (sequence === checkSequence.current) {
          setFileCheck({
            status: "invalid",
            pct: 100,
            message: error instanceof Error ? error.message : "The file is not valid.",
          });
        }
      }
    },
    [maxUploadBytes]
  );

  const startPolling = useCallback(
    (jobId: string) => {
      pollRef.current = setInterval(async () => {
        try {
          const res = await getJobStatus(jobId);
          if (!res.success) {
            stopPolling();
            setSubmitError(res.error);
            toast.error(res.error, { id: "job" });
            setIsUploading(false);
            return;
          }
          setProgress({
            stage: res.data.stage || res.data.status,
            pct: res.data.progress,
            status: res.data.status,
            label: `Analysis: ${res.data.stage || res.data.status}`,
          });

          if (res.data.status === "completed") {
            stopPolling();
            toast.success("Analysis complete!", { id: "job" });
            router.push(`/dashboard/datasets/${res.data.datasetId}`);
          } else if (res.data.status === "failed") {
            stopPolling();
            const message = res.data.error?.message || "Analysis failed after multiple attempts.";
            setSubmitError(message);
            toast.error(message, { id: "job", duration: 8000 });
            setIsUploading(false);
          } else if (res.data.status === "cancelled") {
            stopPolling();
            setSubmitError("Analysis was cancelled.");
            toast.error("Analysis was cancelled.", { id: "job" });
            setIsUploading(false);
          }
        } catch {
          // Keep polling through transient network failures.
        }
      }, 2500);
    },
    [router, stopPolling]
  );

  const handleSubmit = async (): Promise<void> => {
    if (!file) return void toast.error("Please select a file first.");
    if (fileCheck.status !== "valid") {
      return void toast.error(fileCheck.message || "Wait for file validation to finish.");
    }

    setIsUploading(true);
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setSubmitError(null);
    setProgress({ stage: "uploading", pct: 0, status: "uploading", label: "Uploading file" });

    const formData = new FormData();
    formData.append("file", file);
    if (name.trim()) formData.append("name", name.trim());
    if (contextPrompt.trim()) formData.append("contextPrompt", contextPrompt.trim());

    try {
      const result = await uploadWithProgress(
        formData,
        (pct) => setProgress({ stage: "uploading", pct, status: "uploading", label: "Uploading file" }),
        () => setProgress({
          stage: "validating",
          pct: 100,
          status: "validating",
          label: "Upload complete â€” validating the full dataset on the server",
        })
      );

      if (!result.success) {
        setSubmitError(result.error);
        toast.error(result.error, { id: "job", duration: 8000 });
        setIsUploading(false);
        setProgress(null);
        return;
      }

      setProgress({ stage: "queued", pct: 0, status: "queued", label: "Validated â€” analysis queued" });
      toast.loading("File validated. Analysis is now runningâ€¦", { id: "job" });
      startPolling(result.data.jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed unexpectedly.";
      setSubmitError(message);
      toast.error(message, { id: "job", duration: 8000 });
      setIsUploading(false);
      setProgress(null);
    }
  };

  const stages = [
    { key: "uploading", label: d.upload.stageUploading },
    { key: "validating", label: d.upload.stageValidating },
    ...PIPELINE_STAGES.map((s, i) => ({ key: s.key, label: [d.upload.stageQueued, d.upload.stageParsing, d.upload.stageAnalyzing, d.upload.stageDashboard, d.upload.stageReport][i] })),
    { key: "completed", label: d.upload.stageDone },
  ];
  const hintByKey: Record<string, string> = {
    queued: d.upload.hintQueued,
    parsing: d.upload.hintParsing,
    analyzing: d.upload.hintAnalyzing,
    generating_dashboard: d.upload.hintDashboard,
    generating_report: d.upload.hintReport,
  };
  const currentStage = progress ? STAGE_ALIASES[progress.stage] ?? progress.stage : "";
  const activeStageIndex = stages.findIndex((stage) => stage.key === currentStage);
  const canSubmit = Boolean(file) && fileCheck.status === "valid" && !isUploading;

  const activeLadderIndex = (() => {
    if (!progress) return -1;
    if (progress.status === "completed") return stages.length - 1;
    return activeStageIndex;
  })();

  return (
    <div className="upload-grid">
      <div style={{ display: "flex", flexDirection: "column", gap: "18px", minWidth: 0 }}>
        {isUploading ? (
          <section className="panel" aria-live="polite">
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "9px" }}>
                <Loader2 size={17} className="animate-spin" color="var(--accent-primary)" />
                {d.upload.analyzing} {file?.name}
              </h2>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Clock size={13} /> {d.upload.elapsed.replace("{d}", formatDuration(elapsedMs))}
              </span>
            </header>

            <div style={{ height: "8px", borderRadius: "4px", background: "var(--bg-secondary)", overflow: "hidden", marginBottom: "16px" }}>
              <div
                style={{
                  height: "100%",
                  borderRadius: "4px",
                  background: "var(--brand-gradient)",
                  transition: "width .35s",
                }}
              />
            </div>

            <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {stages.map((stage, index) => {
                const state =
                  activeLadderIndex < 0 || index < activeLadderIndex
                    ? "done"
                    : index === activeLadderIndex
                      ? "active"
                      : "pending";
                const hint = hintByKey[stage.key];
                return (
                  <li key={stage.key} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "7px 0" }}>
                    {state === "done" ? (
                      <CheckCircle2 size={17} color="#22c55e" style={{ flexShrink: 0 }} />
                    ) : state === "active" ? (
                      <Loader2 size={17} className="animate-spin" color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: "17px", height: "17px", borderRadius: "50%", border: "2px solid var(--border-color)", flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: "13.5px", fontWeight: state === "active" ? 700 : 500, color: state === "pending" ? "var(--text-muted)" : "var(--text-primary)", minWidth: "128px" }}>
                      {stage.label}
                    </span>
                    {state === "active" && hint && (
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{hint}</span>
                    )}
                    {state === "active" && progress && progress.status !== "uploading" && (
                      <span style={{ marginInlineStart: "auto", fontSize: "12px", fontWeight: 600, color: "var(--accent-primary)" }}>{progress.pct}%</span>
                    )}
                  </li>
                );
              })}
            </ol>
            <p style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "12px" }}>
              {d.upload.largeNote}
            </p>
          </section>
        ) : (
          <>
            {/* Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); if (!isUploading) setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!isUploading) void handleFileChange(e.dataTransfer.files?.[0] ?? null);
              }}
              style={{
                border: `2px dashed ${dragging ? "var(--accent-primary)" : fileCheck.status === "invalid" ? "#ef4444" : file ? "var(--accent-primary)" : "var(--border-color)"}`,
                borderRadius: "14px",
                padding: dragging ? "52px 24px" : "44px 24px",
                textAlign: "center",
                background: dragging ? "var(--accent-light)" : "var(--bg-card)",
                position: "relative",
                transition: "all .15s ease",
              }}
            >
              <input
                type="file"
                accept={ACCEPT}
                disabled={isUploading}
                onChange={(event) => void handleFileChange(event.target.files?.[0] ?? null)}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: isUploading ? "not-allowed" : "pointer" }}
              />
              <UploadCloud size={42} color={dragging || file ? "var(--accent-primary)" : "var(--text-muted)"} style={{ margin: "0 auto 12px", display: "block" }} />
              {file ? (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", maxWidth: "90%", flexWrap: "wrap", justifyContent: "center" }}>
                  <FileSpreadsheet size={18} color="var(--accent-primary)" />
                  <span style={{ color: "var(--text-primary)", fontWeight: 600, wordBreak: "break-all" }}>{file.name}</span>
                  <span style={{ color: "var(--text-muted)" }}>({formatBytes(file.size)})</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); resetFileState(); }}
                    title={d.upload.removeFile}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: "26px", height: "26px", borderRadius: "7px",
                      border: "1px solid var(--border-color)", background: "var(--bg-card)",
                      color: "var(--text-secondary)", cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "15px" }}>
                    {d.upload.dropTitle}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: "12.5px", marginTop: "5px" }}>
                    or click to browse Â· CSV Â· TSV Â· XLSX Â· JSON Â· up to {formatBytes(maxUploadBytes)} on your plan
                  </div>
                </div>
              )}
            </div>

            {/* Validation + preview */}
            {(file || fileCheck.status !== "idle") && (
              <section
                aria-live="polite"
                className="panel"
                style={{
                  borderColor: fileCheck.status === "invalid" ? "#ef444455" : fileCheck.status === "valid" ? "#22c55e55" : undefined,
                }}
              >
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  {fileCheck.status === "checking" ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : fileCheck.status === "valid" ? (
                    <CheckCircle2 size={18} color="#22c55e" />
                  ) : (
                    <AlertCircle size={18} color="#ef4444" />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: fileCheck.status === "invalid" ? "#ef4444" : "var(--text-primary)" }}>
                      {fileCheck.status === "checking"
                        ? d.upload.checking
                        : fileCheck.status === "valid"
                          ? d.upload.passed
                          : d.upload.invalid}
                    </div>
                    <div style={{ marginTop: "3px", fontSize: "12.5px", color: "var(--text-secondary)" }}>{fileCheck.message}</div>
                    {fileCheck.status === "checking" && (
                      <div style={{ height: "5px", marginTop: "9px", borderRadius: "4px", background: "var(--bg-secondary)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${fileCheck.pct}%`, background: "var(--brand-gradient)", transition: "width .2s" }} />
                      </div>
                    )}
                  </div>
                </div>

                {preview && (preview.rows !== null || preview.columns.length > 0) && (
                  <div style={{ marginTop: "14px", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: preview.columns.length ? "9px" : 0 }}>
                      {preview.rows !== null && (
                        <MetaChip icon={<BarChart3 size={12} />}>{d.upload.recordsDetected.replace("{n}", preview.rows.toLocaleString())}</MetaChip>
                      )}
                      {preview.columns.length > 0 && (
                        <MetaChip icon={<Gauge size={12} />}>{d.upload.fieldsDetected.replace("{n}", String(preview.columns.length))}</MetaChip>
                      )}
                    </div>
                    {preview.columns.length > 0 && (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {preview.columns.slice(0, 12).map((col) => (
                          <span key={col} style={{ fontSize: "11px", padding: "3px 9px", borderRadius: "999px", background: "var(--bg-secondary)", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                            {col}
                          </span>
                        ))}
                        {preview.columns.length > 12 && (
                          <span style={{ fontSize: "11px", padding: "3px 9px", color: "var(--text-muted)" }}>+{preview.columns.length - 12} more</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Configuration */}
            <section className="panel">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  <label htmlFor="dataset-name" style={labelStyle}>{d.upload.datasetName}</label>
                  <input
                    id="dataset-name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={file ? file.name : "e.g., Q3 Sales Export"}
                    maxLength={200}
                    disabled={isUploading}
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  <label htmlFor="context" style={labelStyle}>{d.upload.businessContext} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>{d.upload.optional}</span></label>
                  <input
                    id="context"
                    type="text"
                    value={contextPrompt}
                    onChange={(event) => setContextPrompt(event.target.value)}
                    maxLength={1000}
                    disabled={isUploading}
                    placeholder="e.g., Monthly sales data; focus on regional performance."
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  {d.upload.contextHint}
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  {d.upload.rowsPerPlan.replace("{n}", maxRows.toLocaleString())}
                </span>
              </div>
            </section>

            {submitError && (
              <div aria-live="assertive" className="panel" style={{ borderColor: "#ef444455", background: "#ef444410" }}>
                <div style={{ display: "flex", gap: "10px" }}>
                  <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: "2px" }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ fontSize: "13.5px", color: "#ef4444" }}>{d.upload.errorTitle}</strong>
                    <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "5px", lineHeight: 1.55 }}>
                      {(() => {
                        const key = classifyAnalysisError(submitError);
                        if (!key) return d.upload.errGeneric;
                        const text = d.upload[key];
                        return /quota|limit reached|plan allows/i.test(submitError) ? submitError : text;
                      })()}
                    </p>
                    <details style={{ marginTop: "9px" }}>
                      <summary style={{ fontSize: "12px", color: "var(--text-muted)", cursor: "pointer" }}>{d.upload.techDetails}</summary>
                      <pre style={{ fontSize: "11px", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "var(--bg-secondary)", padding: "10px", borderRadius: "8px", marginTop: "7px", color: "var(--text-secondary)" }}>
                        {submitError}
                      </pre>
                    </details>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              style={{ padding: "14px", borderRadius: "10px", background: canSubmit ? "var(--brand-gradient)" : "var(--bg-secondary)", color: canSubmit ? "#fff" : "var(--text-muted)", fontWeight: 600, fontSize: "15px", border: "none", cursor: canSubmit ? "pointer" : "not-allowed", display: "flex", justifyContent: "center", alignItems: "center", gap: "9px" }}
            >
              {fileCheck.status === "checking" ? (
                <><Loader2 size={17} className="animate-spin" /> {d.upload.checkingShort}</>
              ) : (
                <><Sparkles size={17} /> {d.upload.submit}</>
              )}
            </button>
          </>
        )}

      </div>

            <aside style={{ display: "flex", flexDirection: "column", gap: "18px", minWidth: 0 }}>
        <section className="panel">
          <h3 style={sideTitle}>{d.upload.deliverablesTitle}</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "11px" }}>
            <Deliverable icon={<FileText size={15} />} label={d.upload.delivProfile} desc={d.upload.delivProfileDesc} />
            <Deliverable icon={<Gauge size={15} />} label={d.upload.delivKpis} desc={d.upload.delivKpisDesc} />
            <Deliverable icon={<TrendingUp size={15} />} label={d.upload.delivTrends} desc={d.upload.delivTrendsDesc} />
            <Deliverable icon={<AlertCircle size={15} />} label={d.upload.delivAnomalies} desc={d.upload.delivAnomaliesDesc} />
            <Deliverable icon={<BarChart3 size={15} />} label={d.upload.delivDashboard} desc={d.upload.delivDashboardDesc} />
            <Deliverable icon={<Sparkles size={15} />} label={d.upload.delivReport} desc={d.upload.delivReportDesc} />
          </ul>
        </section>

        <section className="panel">
          <h3 style={sideTitle}>{d.upload.limitsTitle}</h3>
          <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            <LimitRow label={d.upload.limitFileSize} value={formatBytes(maxUploadBytes)} />
            <LimitRow label={d.upload.limitRows} value={maxRows.toLocaleString()} />
            <LimitRow label={d.upload.limitFormats} value="CSV / TSV / XLSX / JSON" />
          </dl>
        </section>

        <section className="panel" style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <ShieldCheck size={16} color="#22c55e" style={{ flexShrink: 0, marginTop: "2px" }} />
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 }}>
            {d.upload.privacyNote}
            {" "}<Link href="/dashboard/docs" style={{ color: "var(--accent-primary)", textDecoration: "none", fontWeight: 600 }}>{d.upload.howItWorks}</Link>
          </p>
        </section>
      </aside>
    </div>
  );
}

/* Subcomponents */

function Deliverable({ icon, label, desc }: { icon: React.ReactNode; label: string; desc: string }) {
  return (
    <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
      <span style={{ color: "var(--accent-primary)", flexShrink: 0, marginTop: "1px" }}>{icon}</span>
      <div>
        <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-primary)" }}>{label}</div>
        <div style={{ fontSize: "11.5px", color: "var(--text-muted)", lineHeight: 1.4 }}>{desc}</div>
      </div>
    </li>
  );
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
      <dt style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{value}</dd>
    </div>
  );
}

function MetaChip({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11.5px", padding: "4px 10px", borderRadius: "999px", background: "var(--accent-light)", color: "var(--accent-primary)", fontWeight: 600 }}>
      {icon}
      {children}
    </span>
  );
}

const labelStyle: React.CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" };
const inputStyle: React.CSSProperties = { padding: "11px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "13.5px", width: "100%" };
const sideTitle: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "14px" };
