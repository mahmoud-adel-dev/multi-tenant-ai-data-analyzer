/**
 * @file src/app/(dashboard)/dashboard/page.tsx
 * @description Main dashboard overview page for tenants.
 */

import { Metadata } from "next";
import Link from "next/link";
import { requireTenantAdmin } from "@/lib/auth/dal";
import { Tenant, ExtractedData, ApiKey } from "@/models";
import connectDB from "@/lib/db";
import { ExtractionStatus } from "@/types";

export const metadata: Metadata = {
  title: "Dashboard Overview",
  description: "Overview of your AIDL Platform usage.",
};

export default async function DashboardOverview() {
  const session = await requireTenantAdmin();
  await connectDB();

  // Fetch stats concurrently
  const [tenant, totalExtractions, activeKeys] = await Promise.all([
    Tenant.findById(session.userId).lean(),
    ExtractedData.countDocuments({ tenantId: session.userId }),
    ApiKey.countDocuments({ tenantId: session.userId, status: "active" }),
  ]);

  const used = tenant?.quotas?.usedRequestsThisMonth ?? 0;
  const max = tenant?.quotas?.maxRequestsPerMonth ?? 100;

  return (
    <div>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: "6px" }}>
          Welcome back, {session.name}
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          Here&apos;s what&apos;s happening in your workspace today.
        </p>
      </div>

      {/* ── Stats Grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px", marginBottom: "40px" }}>
        
        {/* Analysis Quota */}
        <div style={{ padding: "24px", borderRadius: "16px", border: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "16px" }}>Monthly Analysis Quota</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "12px" }}>
            <span style={{ fontSize: "32px", fontWeight: 800, color: "var(--text-primary)" }}>{used}</span>
            <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>/ {max}</span>
          </div>
          <div style={{ height: "6px", borderRadius: "3px", background: "var(--bg-secondary)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min((used / max) * 100, 100)}%`, borderRadius: "3px", background: "var(--brand-gradient)" }} />
          </div>
        </div>

        {/* Total Processed */}
        <div style={{ padding: "24px", borderRadius: "16px", border: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "16px" }}>Total Documents Processed</div>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "12px" }}>{totalExtractions}</div>
          <Link href="/dashboard/data-explorer" style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-primary)", textDecoration: "none" }}>
            View Explorer →
          </Link>
        </div>

        {/* API Keys */}
        <div style={{ padding: "24px", borderRadius: "16px", border: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "16px" }}>Active API Keys</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "12px" }}>
            <span style={{ fontSize: "32px", fontWeight: 800, color: "var(--text-primary)" }}>{activeKeys}</span>
            <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>/ {tenant?.quotas?.maxApiKeys ?? 5}</span>
          </div>
          <Link href="/dashboard/api-keys" style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-primary)", textDecoration: "none" }}>
            Manage Keys →
          </Link>
        </div>

      </div>

      {/* ── Quick Actions ── */}
      <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "20px" }}>Quick Actions</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
        <Link href="/dashboard/upload" style={{ display: "block", padding: "24px", borderRadius: "16px", border: "1px solid var(--border-color)", background: "var(--bg-card)", textDecoration: "none", transition: "transform 0.2s, box-shadow 0.2s" }}>
          <div style={{ fontSize: "32px", marginBottom: "16px" }}>📤</div>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>Upload a File</h3>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Manually upload Excel, JSON, PDF, or image files for immediate AI extraction.</p>
        </Link>
        
        <Link href="/dashboard/api-keys" style={{ display: "block", padding: "24px", borderRadius: "16px", border: "1px solid var(--border-color)", background: "var(--bg-card)", textDecoration: "none", transition: "transform 0.2s, box-shadow 0.2s" }}>
          <div style={{ fontSize: "32px", marginBottom: "16px" }}>🔑</div>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>Generate API Key</h3>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Create a new secure key to connect your applications to the AIDL Platform.</p>
        </Link>
      </div>
    </div>
  );
}
