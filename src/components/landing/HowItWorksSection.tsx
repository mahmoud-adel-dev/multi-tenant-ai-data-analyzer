"use client";

/**
 * @file src/components/landing/HowItWorksSection.tsx
 * @description "How it works" section with 3 steps and a dashboard mockup.
 * Server Component.
 */

const STEPS = [
  {
    number: "01",
    title: "Connect / Upload Data",
    description:
      "Upload Excel sheets, JSON files, PDFs, or invoice images via the dashboard or POST directly to our API.",
    color: "#6366f1",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M14 4 L14 18 M8 12 L14 18 L20 12" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 22 L24 22" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Process with AI Models",
    description:
      "Our pipeline parses your files, extracts text via OCR if needed, then sends it to your configured AI model for structured extraction.",
    color: "#8b5cf6",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="6" fill="#8b5cf6" opacity="0.8" />
        <circle cx="14" cy="14" r="11" stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx="14" cy="3"  r="2" fill="#8b5cf6" />
        <circle cx="25" cy="14" r="2" fill="#8b5cf6" opacity="0.6" />
        <circle cx="14" cy="25" r="2" fill="#8b5cf6" opacity="0.4" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Receive Structured Insights",
    description:
      "Get clean, structured JSON output stored in your tenant's data explorer — ready to query, export, or consume via API.",
    color: "#10b981",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="3"  y="7"  width="22" height="14" rx="3" stroke="#10b981" strokeWidth="1.5" />
        <line x1="3"  y1="12" x2="25" y2="12" stroke="#10b981" strokeWidth="1" opacity="0.5" />
        <line x1="9"  y1="7"  x2="9"  y2="21" stroke="#10b981" strokeWidth="1" opacity="0.5" />
        <rect x="10" y="13.5" width="5" height="2" rx="0.5" fill="#10b981" opacity="0.7" />
        <rect x="16" y="13.5" width="4" height="2" rx="0.5" fill="#10b981" opacity="0.5" />
        <rect x="10" y="17"   width="8" height="2" rx="0.5" fill="#10b981" opacity="0.4" />
      </svg>
    ),
  },
];

/** Dashboard UI mockup */
function DashboardMockup() {
  const rows = [
    { file: "invoice_jan.pdf",  type: "PDF",   status: "Completed", amount: "$4,250", vendor: "Acme Corp" },
    { file: "products.xlsx",    type: "Excel", status: "Completed", amount: "—",      vendor: "—" },
    { file: "orders.json",      type: "JSON",  status: "Processing",amount: "—",      vendor: "—" },
    { file: "receipt_q1.png",   type: "Image", status: "Completed", amount: "$890",   vendor: "XYZ Ltd" },
  ];

  const statusColor: Record<string, string> = {
    Completed:  "#10b981",
    Processing: "#f59e0b",
    Failed:     "#ef4444",
  };

  const typeColor: Record<string, string> = {
    PDF:   "#ea580c",
    Excel: "#16a34a",
    JSON:  "#2563eb",
    Image: "#8b5cf6",
  };

  return (
    <div
      style={{
        borderRadius: "16px",
        border: "1px solid var(--border-color)",
        background: "var(--bg-card)",
        overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
        width: "100%",
        maxWidth: "560px",
      }}
    >
      {/* Mockup Header */}
      <div
        style={{
          padding: "14px 18px",
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
        <span style={{ marginLeft: "12px", fontSize: "12px", color: "var(--text-muted)", fontFamily: "monospace" }}>
          Data Explorer — Tenant Dashboard
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg-secondary)" }}>
              {["File", "Type", "Status", "Amount", "Vendor"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 14px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                style={{
                  borderBottom: i < rows.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "var(--bg-secondary)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "transparent")}
              >
                <td style={{ padding: "10px 14px", fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                  {row.file}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: typeColor[row.type] + "20",
                      color: typeColor[row.type],
                    }}
                  >
                    {row.type}
                  </span>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: statusColor[row.status] + "20",
                      color: statusColor[row.status],
                    }}
                  >
                    {row.status}
                  </span>
                </td>
                <td style={{ padding: "10px 14px", fontSize: "13px", color: "var(--text-secondary)" }}>{row.amount}</td>
                <td style={{ padding: "10px 14px", fontSize: "13px", color: "var(--text-secondary)" }}>{row.vendor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 18px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Showing 4 of 128 records</span>
        <div style={{ display: "flex", gap: "6px" }}>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                background: n === 1 ? "var(--accent-primary)" : "var(--bg-secondary)",
                color: n === 1 ? "#fff" : "var(--text-muted)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      style={{
        padding: "96px 24px",
        backgroundColor: "var(--bg-primary)",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "72px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 14px",
              borderRadius: "100px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              color: "var(--text-muted)",
              fontSize: "12px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "20px",
            }}
          >
            How it Works
          </div>
          <h2
            style={{
              fontSize: "clamp(26px, 3.5vw, 40px)",
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            From raw data to{" "}
            <span className="gradient-text">structured insights</span>{" "}
            in seconds
          </h2>
        </div>

        {/* Steps + Mockup */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.2fr",
            gap: "64px",
            alignItems: "center",
          }}
          className="hiw-grid"
        >
          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
            {STEPS.map((step, index) => (
              <div
                key={step.number}
                style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}
              >
                {/* Number + connector */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div
                    style={{
                      width: "52px",
                      height: "52px",
                      borderRadius: "14px",
                      background: step.color + "15",
                      border: `1px solid ${step.color}40`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {step.icon}
                  </div>
                  {/* Vertical connector line */}
                  {index < STEPS.length - 1 && (
                    <div
                      style={{
                        width: "2px",
                        height: "32px",
                        marginTop: "8px",
                        background: `linear-gradient(to bottom, ${step.color}60, ${STEPS[index + 1].color}30)`,
                        borderRadius: "1px",
                      }}
                    />
                  )}
                </div>

                {/* Text */}
                <div style={{ paddingTop: "10px" }}>
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: step.color,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginBottom: "6px",
                    }}
                  >
                    Step {step.number}
                  </div>
                  <h3
                    style={{
                      fontSize: "17px",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      marginBottom: "8px",
                      lineHeight: 1.4,
                    }}
                  >
                    {step.title}
                  </h3>
                  <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.65 }}>
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Dashboard Mockup */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <DashboardMockup />
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .hiw-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
