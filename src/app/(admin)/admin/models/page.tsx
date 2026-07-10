/**
 * @file src/app/(admin)/admin/models/page.tsx
 * @description Super Admin — AI Model Configuration Dashboard.
 *
 * THIS IS A SERVER COMPONENT (no "use client").
 *
 * DATA FETCHING STRATEGY (SSR):
 * We call `getAiModelConfigs()` Server Action directly in this Server Component.
 * The data is fetched on the server at request time — no useEffect, no API call from the browser.
 * Next.js renders the complete HTML on the server and sends it to the client.
 *
 * ARCHITECTURE:
 * page.tsx (Server Component — fetches data) →
 *   ModelsPageClient.tsx (Client Component — manages modal/toast state) →
 *     ModelCard.tsx (Client Component — individual card actions)
 *     ModelConfigForm.tsx (Client Component — create/edit form)
 */

import { Metadata } from "next";
import { getAiModelConfigs } from "@/actions/ai-models";
import ModelsPageClient from "./ModelsPageClient";

export const metadata: Metadata = {
  title: "AI Models",
  description: "Configure AI model integrations for the AIDL Platform.",
};

/**
 * SSR Server Component: fetches all model configs and passes to the client shell.
 * If fetching fails, shows an error state instead of crashing.
 */
export default async function AdminModelsPage() {
  // Fetch data server-side — runs at request time, not in the browser.
  const result = await getAiModelConfigs();

  if (!result.success) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          gap: "16px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "48px" }}>⚠️</div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>
          Failed to load configurations
        </h2>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", maxWidth: "380px" }}>
          {result.error}
        </p>
      </div>
    );
  }

  return <ModelsPageClient initialConfigs={result.data} />;
}
