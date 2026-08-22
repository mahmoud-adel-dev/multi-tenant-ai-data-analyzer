"use client";

/**
 * Billing: current plan, usage vs limits, plan change requests.
 * Payment provider integration is not configured — changes are manual and
 * clearly labeled (no fake payment success).
 */
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getBillingOverview, requestPlanChange, cancelSubscription } from "@/actions/billing";
import type { BillingOverviewDTO } from "@/types/dto";

export default function BillingClient() {
  const [data, setData] = useState<BillingOverviewDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    getBillingOverview().then((res) => {
      if (res.success) setData(res.data);
      else setError(res.error);
    });
  };
  useEffect(load, []);

  const changePlan = async (planKey: string) => {
    if (!window.confirm(`Switch plan to "${planKey}"? Payment processing is not yet enabled; this applies the change manually.`)) return;
    setBusy(true);
    const res = await requestPlanChange(planKey);
    setBusy(false);
    if (res.success) {
      toast.success(res.message ?? "Plan updated.", { duration: 6000 });
      load();
    } else {
      toast.error(res.error);
    }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel subscription at the end of the billing period?")) return;
    const res = await cancelSubscription();
    if (res.success) {
      toast.success("Subscription will not renew.");
      load();
    } else {
      toast.error(res.error);
    }
  };

  if (error) return <p style={{ color: "#e5484d", fontSize: "14px" }}>{error}</p>;
  if (!data) return <div style={{ height: "220px", borderRadius: "12px", background: "var(--bg-secondary)", opacity: 0.6 }} />;

  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
  const usageRows = [
    { label: "Analyses this month", used: data.usage.jobsThisMonth, limit: data.limits.maxJobsPerMonth, fmt: (v: number) => String(v) },
    { label: "Storage used", used: data.usage.storageBytes, limit: data.limits.maxStorageBytes, fmt: mb },
    { label: "Rows analyzed this month", used: data.usage.rowsAnalyzedThisMonth, limit: null as number | null, fmt: (v: number) => v.toLocaleString() },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* Current plan */}
      <section
        style={{
          background: "linear-gradient(135deg, var(--accent-light), transparent)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "16px",
          padding: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
        }}
      >
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>Current plan</div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", marginTop: "4px" }}>
            {data.planName}
            <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-muted)", marginLeft: "10px" }}>
              {data.monthlyPriceCents === 0 ? "Free" : `$${(data.monthlyPriceCents / 100).toFixed(2)}/mo`}
            </span>
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "6px" }}>
            Status: {data.status.replace("_", " ")}
            {data.cancelAtPeriodEnd && " · cancels at period end"} · renews{" "}
            {new Date(data.currentPeriodEnd).toLocaleDateString()}
          </div>
        </div>
        <button onClick={cancel} disabled={busy || data.cancelAtPeriodEnd} style={ghostBtn}>
          {data.cancelAtPeriodEnd ? "Cancellation scheduled" : "Cancel subscription"}
        </button>
      </section>

      {/* Usage */}
      <section>
        <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "14px" }}>Usage this period</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {usageRows.map((row) => (
            <div key={row.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                <span style={{ fontWeight: 600 }}>{row.label}</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {row.fmt(row.used)}
                  {row.limit !== null ? ` of ${row.fmt(row.limit)}` : ""}
                </span>
              </div>
              {row.limit !== null && (
                <div style={{ height: "7px", borderRadius: "4px", background: "var(--bg-secondary)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min((row.used / Math.max(1, row.limit)) * 100, 100)}%`,
                      borderRadius: "4px",
                      background:
                        row.used >= row.limit ? "#e5484d" : row.used > row.limit * 0.8 ? "#f59e0b" : "var(--brand-gradient)",
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Plans */}
      <section>
        <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "6px" }}>Plans</h2>
        <p style={{ fontSize: "12.5px", color: "var(--text-muted)", marginBottom: "14px" }}>
          Online payment processing is not yet configured. Plan switches are applied manually by the platform and never simulate a payment.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
          {data.availablePlans.map((p) => (
            <div
              key={p.key}
              style={{
                background: p.key === data.planKey ? "var(--accent-light)" : "var(--bg-card)",
                border: `1px solid ${p.key === data.planKey ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                borderRadius: "14px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <strong style={{ fontSize: "17px" }}>{p.name}</strong>
                <span style={{ fontSize: "15px", fontWeight: 700 }}>
                  {p.monthlyPriceCents === 0 ? "Free" : `$${(p.monthlyPriceCents / 100).toFixed(2)}/mo`}
                </span>
              </div>
              <ul style={{ listStyle: "none", fontSize: "12.5px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                <li>· Up to {(data.limits.maxUploadBytes / 1024 / 1024).toFixed(0)}MB per file</li>
                <li>· {data.limits.maxJobsPerMonth} analyses / month</li>
                <li>· {mb(data.limits.maxStorageBytes)} storage</li>
                <li>· {data.limits.maxMembers} team members</li>
                <li>· {data.limits.aiNarrativeEnabled ? "AI narratives included" : "—"}</li>
              </ul>
              {p.key !== data.planKey ? (
                <button onClick={() => changePlan(p.key)} disabled={busy} style={primaryBtn}>
                  Switch to {p.name}
                </button>
              ) : (
                <span style={{ textAlign: "center", fontSize: "12.5px", fontWeight: 700, color: "var(--accent-primary)", padding: "9px 0" }}>
                  Current plan
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: "8px",
  background: "var(--brand-gradient)",
  color: "#fff",
  fontWeight: 600,
  fontSize: "13px",
  border: "none",
  cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: "8px",
  border: "1px solid var(--border-color)",
  background: "transparent",
  color: "var(--text-secondary)",
  fontWeight: 600,
  fontSize: "13px",
  cursor: "pointer",
};
