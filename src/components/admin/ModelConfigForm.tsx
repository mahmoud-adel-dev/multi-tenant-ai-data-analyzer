"use client";

/**
 * @file src/components/admin/ModelConfigForm.tsx
 * @description Form for creating or editing an AI Model Configuration.
 * "use client" — needed for controlled inputs, state management, and action feedback.
 *
 * FEATURES:
 * - Provider presets (one-click fill for OpenAI, Ollama, DeepSeek, etc.)
 * - Dynamic apiKey visibility (hidden for local models)
 * - Real-time connection test button
 * - Integrated with Server Actions for submit and test
 */

import { useState, useTransition } from "react";
import { AiModelConfigDTO } from "@/types/dto";
import { ModelProviderType } from "@/types";
import {
  createAiModelConfig,
  updateAiModelConfig,
  testAiModelConnection,
} from "@/actions/ai-models";

// ============================================================
// Provider Presets
// ============================================================

interface Preset {
  label: string;
  providerType: ModelProviderType;
  modelIdentifier: string;
  baseUrl: string;
  needsApiKey: boolean;
  badge: string;
  color: string;
}

const PRESETS: Preset[] = [
  {
    label: "OpenAI",
    providerType: ModelProviderType.CLOUD,
    modelIdentifier: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    needsApiKey: true,
    badge: "Cloud",
    color: "#10a37f",
  },
  {
    label: "Anthropic",
    providerType: ModelProviderType.CLOUD,
    modelIdentifier: "claude-3-5-sonnet-20241022",
    baseUrl: "https://api.anthropic.com/v1",
    needsApiKey: true,
    badge: "Cloud",
    color: "#d4a853",
  },
  {
    label: "DeepSeek",
    providerType: ModelProviderType.CLOUD,
    modelIdentifier: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
    needsApiKey: true,
    badge: "Cloud",
    color: "#4f7bff",
  },
  {
    label: "Gemini",
    providerType: ModelProviderType.CLOUD,
    modelIdentifier: "gemini-1.5-pro",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    needsApiKey: true,
    badge: "Cloud",
    color: "#ea4335",
  },
  {
    label: "Ollama",
    providerType: ModelProviderType.LOCAL,
    modelIdentifier: "llama3:8b",
    baseUrl: "http://localhost:11434/v1",
    needsApiKey: false,
    badge: "Local",
    color: "#8b5cf6",
  },
  {
    label: "LM Studio",
    providerType: ModelProviderType.LOCAL,
    modelIdentifier: "local-model",
    baseUrl: "http://localhost:1234/v1",
    needsApiKey: false,
    badge: "Local",
    color: "#6366f1",
  },
  {
    label: "Qwen (Ollama)",
    providerType: ModelProviderType.LOCAL,
    modelIdentifier: "qwen2:7b",
    baseUrl: "http://localhost:11434/v1",
    needsApiKey: false,
    badge: "Local",
    color: "#f59e0b",
  },
  {
    label: "DeepSeek (Local)",
    providerType: ModelProviderType.LOCAL,
    modelIdentifier: "deepseek-coder:6.7b",
    baseUrl: "http://localhost:11434/v1",
    needsApiKey: false,
    badge: "Local",
    color: "#10b981",
  },
];

// ============================================================
// Props
// ============================================================

interface ModelConfigFormProps {
  /** If provided, the form is in edit mode. Otherwise it's create mode. */
  existing?: AiModelConfigDTO;
  onSuccess?: (msg: string) => void;
  onCancel?: () => void;
}

// ============================================================
// Component
// ============================================================

export default function ModelConfigForm({
  existing,
  onSuccess,
  onCancel,
}: ModelConfigFormProps) {
  const isEditMode = !!existing;
  const [isPending, startTransition] = useTransition();
  const [testPending, setTestPending] = useState(false);

  // ── Form State ──
  const [form, setForm] = useState({
    name:            existing?.name            ?? "",
    providerType:    existing?.providerType    ?? ModelProviderType.CLOUD,
    modelIdentifier: existing?.modelIdentifier ?? "",
    baseUrl:         existing?.baseUrl         ?? "",
    apiKey:          "",  // Never pre-fill the apiKey for security.
    description:     existing?.description     ?? "",
    isActive:        existing?.isActive        ?? false,
  });

  const [error,      setError]      = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError,  setTestError]  = useState<string | null>(null);

  const isLocalModel = form.providerType === ModelProviderType.LOCAL;

  // ── Apply Preset ──
  const applyPreset = (preset: Preset) => {
    setForm((prev) => ({
      ...prev,
      name:            preset.label,
      providerType:    preset.providerType,
      modelIdentifier: preset.modelIdentifier,
      baseUrl:         preset.baseUrl,
      apiKey:          "",
    }));
    setError(null);
    setTestResult(null);
    setTestError(null);
  };

  // ── Handle Field Change ──
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = type === "checkbox" ? (e.target as HTMLInputElement).checked : undefined;
    setForm((prev) => ({ ...prev, [name]: checked !== undefined ? checked : value }));
  };

  // ── Submit Handler ──
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = isEditMode
        ? await updateAiModelConfig(existing!.id, form)
        : await createAiModelConfig(form);

      if (!result.success) {
        setError(result.error);
      } else {
        onSuccess?.(result.message ?? "Saved successfully.");
      }
    });
  };

  // ── Test Connection ──
  const handleTest = async () => {
    if (!existing?.id) {
      setTestError("Save the configuration first before testing.");
      return;
    }
    setTestPending(true);
    setTestResult(null);
    setTestError(null);

    const result = await testAiModelConnection(existing.id);
    setTestPending(false);

    if (result.success) {
      setTestResult(`✅ Connected! Latency: ${result.data.latencyMs}ms`);
    } else {
      setTestError(`❌ ${result.error}`);
    }
  };

  // ── Styles ──
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid var(--border-color)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.2s",
    fontFamily: "inherit",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: "6px",
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Provider Presets ── */}
      <div>
        <p style={labelStyle}>Quick Presets</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: `1px solid ${preset.color}40`,
                background: `${preset.color}10`,
                color: preset.color,
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              {preset.label}
              <span style={{ opacity: 0.7, fontSize: "10px" }}>({preset.badge})</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: "1px", background: "var(--border-subtle)" }} />

      {/* ── Name ── */}
      <div>
        <label htmlFor="name" style={labelStyle}>Display Name *</label>
        <input
          id="name" name="name" type="text" required
          value={form.name} onChange={handleChange}
          placeholder="e.g., GPT-4o Production"
          style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent-primary)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border-color)")}
        />
      </div>

      {/* ── Provider Type ── */}
      <div>
        <label htmlFor="providerType" style={labelStyle}>Provider Type *</label>
        <select
          id="providerType" name="providerType"
          value={form.providerType} onChange={handleChange}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          <option value={ModelProviderType.CLOUD}>☁️ Cloud API (OpenAI, Anthropic, DeepSeek…)</option>
          <option value={ModelProviderType.LOCAL}>🖥️ Local Model (Ollama, LM Studio, Qwen…)</option>
        </select>
      </div>

      {/* ── Base URL ── */}
      <div>
        <label htmlFor="baseUrl" style={labelStyle}>
          Base URL *
          <span style={{ fontWeight: 400, marginLeft: "6px", color: "var(--text-muted)", fontSize: "12px" }}>
            {isLocalModel ? "(Ollama: http://localhost:11434/v1)" : "(e.g., https://api.openai.com/v1)"}
          </span>
        </label>
        <input
          id="baseUrl" name="baseUrl" type="url" required
          value={form.baseUrl} onChange={handleChange}
          placeholder={isLocalModel ? "http://localhost:11434/v1" : "https://api.openai.com/v1"}
          style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent-primary)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border-color)")}
        />
      </div>

      {/* ── Model Identifier ── */}
      <div>
        <label htmlFor="modelIdentifier" style={labelStyle}>
          Model Identifier *
          <span style={{ fontWeight: 400, marginLeft: "6px", color: "var(--text-muted)", fontSize: "12px" }}>
            {isLocalModel ? "(e.g., llama3:8b, qwen2:7b, deepseek-coder:6.7b)" : "(e.g., gpt-4o, claude-3-5-sonnet-20241022)"}
          </span>
        </label>
        <input
          id="modelIdentifier" name="modelIdentifier" type="text" required
          value={form.modelIdentifier} onChange={handleChange}
          placeholder={isLocalModel ? "llama3:8b" : "gpt-4o"}
          style={{ ...inputStyle, fontFamily: "monospace" }}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent-primary)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border-color)")}
        />
      </div>

      {/* ── API Key (hidden for local models) ── */}
      {!isLocalModel && (
        <div>
          <label htmlFor="apiKey" style={labelStyle}>
            API Key
            {isEditMode && (
              <span style={{ fontWeight: 400, marginLeft: "6px", color: "var(--text-muted)", fontSize: "12px" }}>
                (leave blank to keep existing key)
              </span>
            )}
          </label>
          <input
            id="apiKey" name="apiKey" type="password"
            value={form.apiKey} onChange={handleChange}
            placeholder={isEditMode ? "••••••••••••••••" : "sk-..."}
            style={{ ...inputStyle, fontFamily: "monospace" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent-primary)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border-color)")}
          />
        </div>
      )}

      {isLocalModel && (
        <div
          style={{
            padding: "12px",
            borderRadius: "8px",
            background: "#8b5cf620",
            border: "1px solid #8b5cf640",
            fontSize: "13px",
            color: "#8b5cf6",
          }}
        >
          🖥️ Local models (Ollama, LM Studio) don&apos;t require an API key.
          Make sure your local server is running at the Base URL above.
        </div>
      )}

      {/* ── Description ── */}
      <div>
        <label htmlFor="description" style={labelStyle}>Description (optional)</label>
        <textarea
          id="description" name="description"
          value={form.description} onChange={handleChange}
          placeholder="Notes about this model (cost, performance, use case…)"
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent-primary)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border-color)")}
        />
      </div>

      {/* ── Set as Active ── */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          cursor: "pointer",
          padding: "12px",
          borderRadius: "8px",
          border: "1px solid var(--border-subtle)",
          background: form.isActive ? "var(--accent-light)" : "var(--bg-secondary)",
          transition: "all 0.2s",
        }}
      >
        <input
          type="checkbox"
          name="isActive"
          checked={form.isActive}
          onChange={handleChange}
          style={{ width: "16px", height: "16px", accentColor: "var(--accent-primary)" }}
        />
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
            Set as Active Model
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
            The active model is used for all new data extraction jobs.
          </div>
        </div>
      </label>

      {/* ── Error Message ── */}
      {error && (
        <div
          style={{
            padding: "12px",
            borderRadius: "8px",
            background: "#ef444420",
            border: "1px solid #ef444440",
            color: "#ef4444",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Test Result ── */}
      {testResult && (
        <div style={{ padding: "12px", borderRadius: "8px", background: "#10b98120", border: "1px solid #10b98140", color: "#10b981", fontSize: "13px" }}>
          {testResult}
        </div>
      )}
      {testError && (
        <div style={{ padding: "12px", borderRadius: "8px", background: "#ef444420", border: "1px solid #ef444440", color: "#ef4444", fontSize: "13px" }}>
          {testError}
        </div>
      )}

      {/* ── Action Buttons ── */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {/* Test Connection (edit mode only) */}
        {isEditMode && (
          <button
            type="button"
            onClick={handleTest}
            disabled={testPending}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: testPending ? "not-allowed" : "pointer",
              opacity: testPending ? 0.7 : 1,
              transition: "all 0.2s",
            }}
          >
            {testPending ? "Testing…" : "🔌 Test Connection"}
          </button>
        )}

        {/* Cancel */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              background: "transparent",
              color: "var(--text-secondary)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending}
          style={{
            padding: "10px 24px",
            borderRadius: "8px",
            background: isPending ? "var(--text-muted)" : "var(--brand-gradient)",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 700,
            cursor: isPending ? "not-allowed" : "pointer",
            border: "none",
            transition: "opacity 0.2s",
            marginLeft: "auto",
          }}
        >
          {isPending
            ? "Saving…"
            : isEditMode
            ? "Update Configuration"
            : "Create Configuration"}
        </button>
      </div>
    </form>
  );
}
