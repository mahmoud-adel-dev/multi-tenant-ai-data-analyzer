"use client";

/**
 * @file src/app/(dashboard)/dashboard/api-keys/ApiKeysPageClient.tsx
 * @description Client shell for the API Keys page.
 * Manages create modal, copy-to-clipboard, revoke confirmations, toast.
 */

import { useState, useTransition } from "react";
import { ApiKeyDTO, ApiKeyStatus } from "@/types";
import { createApiKey, revokeApiKey, deleteApiKey } from "@/actions/api-keys";

interface ApiKeysPageClientProps {
  initialKeys: ApiKeyDTO[];
  quota: { used: number; max: number };
}

/** Copy text to clipboard with visual feedback */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      style={{
        padding: "4px 10px", borderRadius: "6px",
        border: "1px solid var(--border-color)",
        background: copied ? "#10b98120" : "var(--bg-secondary)",
        color: copied ? "#10b981" : "var(--text-muted)",
        fontSize: "12px", fontWeight: 600, cursor: "pointer",
        transition: "all 0.2s", whiteSpace: "nowrap",
      }}
    >
      {copied ? "✓ Copied!" : "Copy"}
    </button>
  );
}

export default function ApiKeysPageClient({ initialKeys, quota }: ApiKeysPageClientProps) {
  const [keys, setKeys]             = useState<ApiKeyDTO[]>(initialKeys);
  const [modalOpen, setModalOpen]   = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null); // shown once
  const [isPending, startTransition]= useTransition();
  const [toast, setToast]           = useState<{ msg: string; type: "success"|"error" } | null>(null);

  const showToast = (msg: string, type: "success"|"error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Create Key ──
  const handleCreate = () => {
    if (!newKeyName.trim()) return;
    startTransition(async () => {
      const result = await createApiKey({ name: newKeyName });
      if (!result.success) {
        showToast(result.error, "error");
      } else {
        setCreatedKey(result.data.rawKey);
        setKeys((prev) => [result.data.dto, ...prev]);
        setNewKeyName("");
        showToast(result.message ?? "Key created!");
      }
    });
  };

  // ── Revoke Key ──
  const handleRevoke = (keyId: string) => {
    startTransition(async () => {
      const result = await revokeApiKey(keyId);
      if (!result.success) {
        showToast(result.error, "error");
      } else {
        setKeys((prev) => prev.map((k) => k.id === keyId ? { ...k, status: ApiKeyStatus.REVOKED } : k));
        showToast(result.message ?? "Revoked.");
      }
    });
  };

  // ── Delete Key ──
  const handleDelete = (keyId: string) => {
    startTransition(async () => {
      const result = await deleteApiKey(keyId);
      if (!result.success) {
        showToast(result.error, "error");
      } else {
        setKeys((prev) => prev.filter((k) => k.id !== keyId));
        showToast(result.message ?? "Deleted.");
      }
    });
  };

  const activeKeys  = keys.filter((k) => k.status === ApiKeyStatus.ACTIVE);
  const revokedKeys = keys.filter((k) => k.status === ApiKeyStatus.REVOKED);
  const usagePercent = quota.max > 0 ? (quota.used / quota.max) * 100 : 0;

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "32px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: "6px" }}>
            API Keys
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            Generate and manage keys for external API access.
          </p>
        </div>
        <button
          onClick={() => { setModalOpen(true); setCreatedKey(null); }}
          disabled={activeKeys.length >= quota.max}
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "10px 20px", borderRadius: "10px",
            background: activeKeys.length >= quota.max ? "var(--text-muted)" : "var(--brand-gradient)",
            color: "#fff", fontSize: "14px", fontWeight: 700, border: "none",
            cursor: activeKeys.length >= quota.max ? "not-allowed" : "pointer",
            boxShadow: "0 4px 16px var(--accent-glow)", flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Generate Key
        </button>
      </div>

      {/* ── Quota Bar ── */}
      <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", marginBottom: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>Key Usage</span>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--accent-primary)" }}>{quota.used} / {quota.max} active keys</span>
        </div>
        <div style={{ height: "8px", borderRadius: "4px", background: "var(--bg-secondary)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(usagePercent, 100)}%`, borderRadius: "4px", background: usagePercent >= 90 ? "#ef4444" : usagePercent >= 70 ? "#f59e0b" : "var(--brand-gradient)", transition: "width 0.4s ease" }} />
        </div>
      </div>

      {/* ── Active Keys ── */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
          Active Keys ({activeKeys.length})
        </h2>

        {activeKeys.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", borderRadius: "12px", border: "2px dashed var(--border-color)", background: "var(--bg-card)" }}>
            <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>No active API keys. Generate one to start using the API.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {activeKeys.map((key) => (
              <ApiKeyRow key={key.id} apiKey={key} onRevoke={handleRevoke} onDelete={handleDelete} isPending={isPending} />
            ))}
          </div>
        )}
      </section>

      {/* ── Revoked Keys ── */}
      {revokedKeys.length > 0 && (
        <section>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
            Revoked Keys ({revokedKeys.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", opacity: 0.7 }}>
            {revokedKeys.map((key) => (
              <ApiKeyRow key={key.id} apiKey={key} onRevoke={handleRevoke} onDelete={handleDelete} isPending={isPending} />
            ))}
          </div>
        </section>
      )}

      {/* ── API Docs Hint ── */}
      <div style={{ marginTop: "40px", padding: "20px", borderRadius: "12px", border: "1px solid var(--accent-primary)30", background: "var(--accent-light)" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>📡 Using the API</h3>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "12px" }}>Send your API key in the Authorization header:</p>
        <div style={{ background: "var(--bg-primary)", borderRadius: "8px", padding: "12px", fontFamily: "monospace", fontSize: "13px", color: "var(--accent-primary)", border: "1px solid var(--border-color)" }}>
          <div style={{ color: "var(--text-muted)", marginBottom: "4px" }}># POST /api/v1/analyze</div>
          <div>Authorization: Bearer sk-your-api-key</div>
          <div>Content-Type: application/json</div>
        </div>
      </div>

      {/* ── Create Modal ── */}
      {modalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }} onClick={(e) => { if (e.target === e.currentTarget && !createdKey) setModalOpen(false); }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }} />
          <div style={{ position: "relative", width: "100%", maxWidth: "480px", borderRadius: "16px", border: "1px solid var(--border-color)", background: "var(--bg-card)", padding: "28px", boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}>

            {/* Close button — only if key not yet created */}
            {!createdKey && (
              <button onClick={() => setModalOpen(false)} style={{ position: "absolute", top: "16px", right: "16px", width: "28px", height: "28px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-muted)", cursor: "pointer" }}>✕</button>
            )}

            {!createdKey ? (
              <>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "6px" }}>Generate New API Key</h2>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "24px" }}>Give your key a recognizable name (e.g., "Production App").</p>

                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>Key Name *</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="e.g., Production App"
                  maxLength={60}
                  autoFocus
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "14px", marginBottom: "20px", outline: "none", fontFamily: "inherit" }}
                />

                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                  <button onClick={() => setModalOpen(false)} style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "transparent", color: "var(--text-secondary)", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                  <button onClick={handleCreate} disabled={isPending || !newKeyName.trim()} style={{ padding: "10px 24px", borderRadius: "8px", background: "var(--brand-gradient)", color: "#fff", fontSize: "14px", fontWeight: 700, border: "none", cursor: "pointer", opacity: isPending ? 0.7 : 1 }}>
                    {isPending ? "Generating…" : "Generate"}
                  </button>
                </div>
              </>
            ) : (
              /* ── Key Created — Show Once ── */
              <>
                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <div style={{ fontSize: "40px", marginBottom: "8px" }}>🔑</div>
                  <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "6px" }}>API Key Created!</h2>
                  <p style={{ fontSize: "13px", color: "#f59e0b", fontWeight: 600 }}>⚠️ Copy this key now — it will NEVER be shown again.</p>
                </div>

                <div style={{ background: "var(--bg-primary)", borderRadius: "10px", border: "1px solid #10b98150", padding: "14px 16px", marginBottom: "16px" }}>
                  <div style={{ fontFamily: "monospace", fontSize: "13px", color: "#10b981", wordBreak: "break-all", marginBottom: "10px" }}>{createdKey}</div>
                  <CopyButton text={createdKey} />
                </div>

                <button onClick={() => { setModalOpen(false); setCreatedKey(null); }} style={{ width: "100%", padding: "12px", borderRadius: "8px", background: "var(--brand-gradient)", color: "#fff", fontSize: "14px", fontWeight: 700, border: "none", cursor: "pointer" }}>
                  I&apos;ve saved my key — Close
                </button>
              </>
            )}
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

// ── Individual key row ──────────────────────────────────────────

function ApiKeyRow({ apiKey, onRevoke, onDelete, isPending }: {
  apiKey: ApiKeyDTO;
  onRevoke: (id: string) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
}) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const isActive = apiKey.status === ApiKeyStatus.ACTIVE;

  const handleRevoke = () => {
    if (!confirmRevoke) { setConfirmRevoke(true); setTimeout(() => setConfirmRevoke(false), 3000); return; }
    onRevoke(apiKey.id);
  };

  return (
    <div style={{ padding: "16px 20px", borderRadius: "10px", border: `1px solid ${isActive ? "var(--border-color)" : "var(--border-subtle)"}`, background: "var(--bg-card)", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>

      {/* Status dot */}
      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: isActive ? "#10b981" : "#ef4444", flexShrink: 0 }} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: "200px" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>{apiKey.name}</div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-muted)" }}>{apiKey.maskedKey}</span>
          {apiKey.lastUsedAt && <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Last used: {new Date(apiKey.lastUsedAt).toLocaleDateString()}</span>}
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Created: {new Date(apiKey.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Status badge */}
      <span style={{ padding: "3px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: isActive ? "#10b98120" : "#ef444420", color: isActive ? "#10b981" : "#ef4444", border: `1px solid ${isActive ? "#10b98130" : "#ef444430"}` }}>
        {isActive ? "Active" : "Revoked"}
      </span>

      {/* Actions */}
      <div style={{ display: "flex", gap: "6px" }}>
        {isActive ? (
          <button onClick={handleRevoke} disabled={isPending} style={{ padding: "6px 12px", borderRadius: "7px", border: `1px solid ${confirmRevoke ? "#f59e0b" : "var(--border-color)"}`, background: confirmRevoke ? "#f59e0b20" : "var(--bg-secondary)", color: confirmRevoke ? "#f59e0b" : "var(--text-muted)", fontSize: "12px", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
            {confirmRevoke ? "Confirm?" : "Revoke"}
          </button>
        ) : (
          <button onClick={() => onDelete(apiKey.id)} disabled={isPending} style={{ padding: "6px 12px", borderRadius: "7px", border: "1px solid #ef444440", background: "#ef444415", color: "#ef4444", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
