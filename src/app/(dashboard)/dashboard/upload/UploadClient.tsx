"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { UploadCloud, Loader2 } from "lucide-react";
import { uploadAndProcess } from "@/actions/upload";
import { ModelDTO } from "@/actions/models";

export default function UploadClient({ initialModels }: { initialModels: ModelDTO[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(initialModels[0]?.id || "");
  const [isUploading, setIsUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error("Please select a file first.");
    if (!prompt) return toast.error("Please enter an AI prompt.");
    if (!selectedModel) return toast.error("No active AI Models found.");

    setIsUploading(true);
    const toastId = toast.loading("Uploading and Processing with AI...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("prompt", prompt);
    formData.append("modelId", selectedModel);

    try {
      const result = await uploadAndProcess(formData);
      if (result.success) {
        toast.success(result.message || "Report Generated!", { id: toastId });
        router.push("/dashboard/data-explorer");
      } else {
        toast.error(result.error || "Failed to process", { id: toastId });
      }
    } catch (err) {
      toast.error("An unexpected error occurred.", { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* File Upload Area */}
      <div style={{
        border: "2px dashed var(--border-color)", borderRadius: "12px", padding: "40px 20px",
        textAlign: "center", background: "var(--bg-card)", transition: "all 0.2s",
        borderColor: file ? "var(--accent-primary)" : "var(--border-color)"
      }}>
        <UploadCloud size={48} color={file ? "var(--accent-primary)" : "var(--text-muted)"} style={{ margin: "0 auto 16px" }} />
        {file ? (
          <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{file.name}</div>
        ) : (
          <div>
            <div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: "8px" }}>Click or drag Excel file to upload</div>
            <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>Supports .xlsx up to 5MB</div>
          </div>
        )}
        <input 
          type="file" 
          accept=".xlsx, .xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} 
        />
        <div style={{ position: "relative", marginTop: file ? "16px" : "0" }}>
            <input 
              type="file" 
              accept=".xlsx, .xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
              id="file-upload"
            />
            {!file && (
              <label htmlFor="file-upload" style={{
                display: "inline-block", padding: "8px 16px", background: "var(--bg-secondary)", 
                color: "var(--text-primary)", borderRadius: "6px", fontSize: "13px", cursor: "pointer",
                marginTop: "16px", border: "1px solid var(--border-color)"
              }}>Select File</label>
            )}
        </div>
      </div>

      {/* AI Model Selection */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <label style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>AI Model</label>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          required
          style={{
            padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)",
            background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "14px"
          }}
        >
          {initialModels.length === 0 && <option value="">No Active Models Available</option>}
          {initialModels.map(m => (
            <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
          ))}
        </select>
      </div>

      {/* AI Prompt Area */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <label style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>Your Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Generate a summary report of the sales by region..."
          required
          rows={5}
          style={{
            padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)",
            background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "14px",
            resize: "vertical"
          }}
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isUploading}
        style={{
          padding: "14px", borderRadius: "8px", background: "var(--brand-gradient)",
          color: "#fff", fontWeight: 600, fontSize: "15px", border: "none", cursor: isUploading ? "not-allowed" : "pointer",
          display: "flex", justifyContent: "center", alignItems: "center", gap: "8px",
          opacity: isUploading ? 0.7 : 1
        }}
      >
        {isUploading ? <><Loader2 size={18} className="animate-spin-slow" /> Processing...</> : "Generate AI Report"}
      </button>
    </form>
  );
}
