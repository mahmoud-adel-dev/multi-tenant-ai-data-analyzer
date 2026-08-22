import { requireOrg } from "@/lib/auth/dal";
import ApiKeysClient from "./ApiKeysPageClient";

export const metadata = { title: "API Keys" };
export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const ctx = await requireOrg();

  return (
    <div>
      <div style={{ marginBottom: "26px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "4px" }}>API Keys</h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          Programmatic access to the analysis pipeline for <strong>{ctx.orgName}</strong>.
        </p>
      </div>
      <ApiKeysClient maxKeys={ctx.limits.maxApiKeys} />
    </div>
  );
}
