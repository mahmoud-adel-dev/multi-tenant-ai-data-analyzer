import { requireOrgRole } from "@/lib/auth/dal";
import BillingClient from "./BillingClient";

export const metadata = { title: "Billing & Usage" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  await requireOrgRole("admin");

  return (
    <div>
      <div style={{ marginBottom: "26px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "4px" }}>Billing & Usage</h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Plan, limits and consumption for this workspace.</p>
      </div>
      <BillingClient />
    </div>
  );
}
