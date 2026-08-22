"use client";

/**
 * API key management UI: create (with one-time reveal), revoke, delete.
 */
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createApiKey, deleteApiKey, getApiKeys, revokeApiKey } from "@/actions/api-keys";
import type { ApiKeyDTO } from "@/types/dto";

export default function ApiKeysClient({ maxKeys }: { maxKeys: number }) {
  const [keys, setKeys] = useState<ApiKeyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [expiryDays, setExpiryDays] = useState<string>("90");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    getApiKeys().then((res) => {
      if (res.success) setKeys(res.data);
      else toast.error(res.error);
      setLoading(false);
    });
  };
  useEffect(load, []);

  const handleCreate = async () => {
    setBusy(true);
    const res = await createApiKey({
      name: name.trim(),
      expiresInDays: expiryDays === "never" ? null : Number(expiryDays),
    });
    setBusy(false);
    if (res.success) {
      setRevealedKey(res.data.rawKey);
      setName("");
      toast.success("API key created.");
      load();
    } else {
      toast.error(res.error);
    }
  };

  const activeCount = keys.filter((k) => k.status === "active").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "26px" }}>
      {/* Create */}
      <section style={card}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>Create a new key</h2>
        <p style={{ fontSize: "12.5px", color: "var(--text-muted)", marginBottom: "14px" }}>
          Keys authenticate the REST API (<code>Authorization: Bearer sk-…</code>). The full key is shown exactly
          once — store it securely. Active keys: {activeCount}/{maxKeys}
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Production App"
            maxLength={60}
            aria-label="Key name"
            style={{ ...inputStyle, flex: 1, minWidth: "200px" }}
          />
          <select value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} aria-label="Expiration" style={inputStyle}>
            <option value="30">Expires in 30 days</option>
            <option value="90">Expires in 90 days</option>
            <option value="365">Expires in 1 year</option>
            <option value="never">No expiration</option>
          </select>
          <button onClick={handleCreate} disabled={busy || name.trim().length < 2 || activeCount >= maxKeys} style={primaryBtn}>
            Generate key
          </button>
        </div>
      </section>

      {/* One-time reveal */}
      {revealedKey && (
        <div style={{ background: "rgba(46,160,67,0.08)", border: "1px solid rgba(46,160,67,0.5)", borderRadius: "12px", padding: "16px" }}>
          <strong style={{ fontSize: "13.5px", display: "block", marginBottom: "8px" }}>Copy your API key now — it will not be shown again:</strong>
          <code style={{ display: "block", background: "var(--bg-secondary)", borderRadius: "8px", padding: "12px", wordBreak: "break-all", fontSize: "13px" }}>
            {revealedKey}
          </code>
          <button onClick={() => { navigator.clipboard.writeText(revealedKey); toast.success("Copied to clipboard"); }} style={{ ...ghostBtn, marginTop: "10px" }}>
            Copy
          </button>
          <button onClick={() => setRevealedKey(null)} style={{ ...ghostBtn, marginTop: "10px", marginLeft: "8px" }}>
            I&apos;ve saved it
          </button>
        </div>
      )}

      {/* List */}
      <section>
        <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px" }}>Your keys</h2>
        {loading ? (
          <div style={{ height: "120px", borderRadius: "10px", background: "var(--bg-secondary)", opacity: 0.6 }} />
        ) : keys.length === 0 ? (
          <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>No API keys yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
              <thead>
                <tr>
                  {["Name", "Key", "Status", "Last used", "Requests", "Created"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td style={{ ...td, fontWeight: 600 }}>{k.name}</td>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: "12.5px", color: "var(--text-secondary)" }}>{k.maskedKey}</td>
                    <td style={td}>
                      <span
                        style={{
                          fontSize: "12px",
                          padding: "3px 10px",
                          borderRadius: "999px",
                          fontWeight: 600,
                          background: k.status === "active" ? "rgba(46,160,67,0.15)" : "rgba(150,150,150,0.15)",
                          color: k.status === "active" ? "#2ea043" : "#999",
                        }}
                      >
                        {k.status}
                      </span>
                      {k.expiresAt && (
                        <div style={{ fontSize: "11px", color: new Date(k.expiresAt) < new Date() ? "#e5484d" : "var(--text-muted)", marginTop: "3px" }}>
                          {new Date(k.expiresAt) < new Date() ? "expired" : `expires ${new Date(k.expiresAt).toLocaleDateString()}`}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, fontSize: "12px", color: "var(--text-muted)" }}>
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "never"}
                    </td>
                    <td style={td}>{k.requestCount.toLocaleString()}</td>
                    <td style={{ ...td, fontSize: "12px", color: "var(--text-muted)" }}>{new Date(k.createdAt).toLocaleDateString()}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {k.status === "active" && (
                          <button onClick={async () => {
                            const res = await revokeApiKey(k.id);
                            if (res.success) { toast.success("Key revoked."); load(); } else toast.error(res.error);
                          }} style={{ ...ghostBtn, color: "#e5484d" }}>
                            Revoke
                          </button>
                        )}
                        {k.status === "revoked" && (
                          <button onClick={async () => {
                            const res = await deleteApiKey(k.id);
                            if (res.success) { toast.success("Key deleted."); load(); } else toast.error(res.error);
                          }} style={ghostBtn}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "14px",
  padding: "20px",
};
const inputStyle: React.CSSProperties = {
  padding: "11px 13px",
  borderRadius: "9px",
  border: "1px solid var(--border-color)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  fontSize: "14px",
};
const primaryBtn: React.CSSProperties = {
  padding: "11px 22px",
  borderRadius: "9px",
  background: "var(--brand-gradient)",
  color: "#fff",
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  fontSize: "14px",
};
const ghostBtn: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: "6px",
  background: "transparent",
  border: "1px solid var(--border-color)",
  fontWeight: 600,
  fontSize: "12px",
  cursor: "pointer",
  color: "var(--text-secondary)",
};
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
};
const td: React.CSSProperties = { padding: "12px" };
