/**
 * @file src/app/(dashboard)/dashboard/api-keys/page.tsx
 * @description SSR page for tenant API key management.
 *
 * DATA FETCHING:
 * Calls `getApiKeys()` Server Action directly — no API route, no useEffect.
 * The full list is rendered server-side and hydrated on the client.
 */

import { Metadata } from "next";
import { requireTenantAdmin } from "@/lib/auth/dal";
import { getApiKeys } from "@/actions/api-keys";
import { Tenant } from "@/models";
import connectDB from "@/lib/db";
import ApiKeysPageClient from "./ApiKeysPageClient";

export const metadata: Metadata = {
  title: "API Keys",
  description: "Generate and manage your developer API keys.",
};

export default async function ApiKeysPage() {
  // Auth guard — also gives us the session.
  const session = await requireTenantAdmin();

  // Fetch API keys (SSR).
  const keysResult = await getApiKeys();

  // Fetch tenant quota info for the progress bar.
  await connectDB();
  const tenant = await Tenant.findById(session.userId).lean();

  const quota = {
    used: tenant?.quotas?.usedRequestsThisMonth ?? 0,
    max:  tenant?.quotas?.maxApiKeys           ?? 5,
  };

  if (!keysResult.success) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>Failed to load API keys</h2>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "8px" }}>{keysResult.error}</p>
      </div>
    );
  }

  return <ApiKeysPageClient initialKeys={keysResult.data} quota={quota} />;
}
