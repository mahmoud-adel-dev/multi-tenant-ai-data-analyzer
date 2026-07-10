/**
 * @file src/components/dashboard/DashboardSidebar.tsx
 * @description Tenant dashboard sidebar navigation.
 * Server Component — no client JS needed for static nav.
 */

import Link from "next/link";
import LogoutButton from "./LogoutButton";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";
import { UserRole } from "@/types";

interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
}

interface DashboardSidebarProps {
  session: SessionPayload;
  activePath?: string;
}

const NAV_ITEMS = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    label: "API Keys",
    href: "/dashboard/api-keys",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
      </svg>
    ),
  },
  {
    label: "Data Explorer",
    href: "/dashboard/data-explorer",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    label: "Upload & Analyze",
    href: "/dashboard/upload",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
      </svg>
    ),
  },
  {
    label: "API Docs",
    href: "/dashboard/docs",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
];

export default function DashboardSidebar({ session, activePath = "" }: DashboardSidebarProps) {
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
      <div style={{ padding: "20px", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "var(--brand-gradient)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>AIDL Platform</div>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: 1.2 }}>Tenant Dashboard</div>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav style={{ flex: 1, padding: "12px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", padding: "8px 12px 6px" }}>
          Workspace
        </div>
        <ul style={{ listStyle: "none" }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activePath === item.href || activePath.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "9px 12px", borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--accent-primary)" : "var(--text-secondary)",
                    background: isActive ? "var(--accent-light)" : "transparent",
                    textDecoration: "none",
                    marginBottom: "2px",
                    border: isActive ? "1px solid var(--accent-primary)30" : "1px solid transparent",
                    transition: "all 0.15s",
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

      {/* ── User + Logout ── */}
      <div style={{ padding: "12px", borderTop: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px" }}>
          <ThemeToggle />
          <NotificationBell />
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "4px 8px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--brand-gradient)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
            {session.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{session.name}</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{session.email}</div>
          </div>
        </div>

        <LogoutButton />
      </div>
    </aside>
  );
}
