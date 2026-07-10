"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      style={{
        width: "100%", padding: "8px 12px", borderRadius: "8px",
        border: "1px solid var(--border-color)", background: "transparent",
        color: "var(--text-muted)", fontSize: "13px", fontWeight: 500,
        cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "8px",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.borderColor = "#ef444430"; e.currentTarget.style.background = "#ef44440a"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border-color)"; e.currentTarget.style.background = "transparent"; }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      Sign Out
    </button>
  );
}
