/**
 * @file src/components/admin/AdminSidebar.tsx
 * @description Super Admin sidebar navigation.
 * Server Component — reads session on the server, no client JS needed.
 */

import Link from "next/link";
import { SessionPayload } from "@/lib/auth/session";

interface AdminSidebarProps {
  session: SessionPayload;
  /** Current pathname for active link highlighting — passed from the layout. */
  activePath?: string;
}

const NAV_ITEMS = [
  {
    label: "Overview",
    href: "/admin",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    label: "AI Models",
    href: "/admin/models",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
        <line x1="12" y1="3" x2="12" y2="1" /><line x1="21" y1="12" x2="23" y2="12" />
        <line x1="12" y1="21" x2="12" y2="23" /><line x1="3" y1="12" x2="1" y2="12" />
      </svg>
    ),
  },
  {
    label: "Tenants",
    href: "/admin/tenants",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: "System Logs",
    href: "/admin/logs",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export default function AdminSidebar({ session, activePath = "" }: AdminSidebarProps) {
  return (
    <aside
      style={{
        width: "240px",
        minHeight: "100vh",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        flexShrink: 0,
      }}
    >
      {/* ── Logo ── */}
      <div
        style={{
          padding: "20px",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <div
          style={{
            width: "32px", height: "32px", borderRadius: "8px",
            background: "var(--brand-gradient)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>AIDL</div>
          <div style={{ fontSize: "10px", color: "var(--accent-primary)", lineHeight: 1.2, fontWeight: 600 }}>Super Admin</div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav style={{ flex: 1, padding: "12px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", padding: "8px 12px 6px" }}>
          Management
        </div>
        <ul style={{ listStyle: "none" }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activePath === item.href || activePath.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--accent-primary)" : "var(--text-secondary)",
                    background: isActive ? "var(--accent-light)" : "transparent",
                    textDecoration: "none",
                    marginBottom: "2px",
                    transition: "all 0.15s",
                    border: isActive ? "1px solid var(--accent-primary)30" : "1px solid transparent",
                  }}
                >
                  <span style={{ opacity: isActive ? 1 : 0.6 }}>{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── User Info ── */}
      <div
        style={{
          padding: "16px",
          borderTop: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <div
          style={{
            width: "34px", height: "34px", borderRadius: "50%",
            background: "var(--brand-gradient)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "13px", fontWeight: 700, color: "#fff",
            flexShrink: 0,
          }}
        >
          {session.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ overflow: "hidden" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {session.name}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Super Admin</div>
        </div>
      </div>
    </aside>
  );
}
