"use client";

/**
 * @file src/components/landing/FeaturesSection.tsx
 * @description Four feature cards matching the design screenshot.
 * Server Component — static content, no interactivity.
 */

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
  accentColor: string;
}

/** SVG icon components */
const TenantIcon = ({ color }: { color: string }) => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="15" stroke={color} strokeWidth="1.5" opacity="0.3" />
    <circle cx="16" cy="12" r="5" fill={color} opacity="0.9" />
    <path d="M6 26 C6 20 26 20 26 26" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.9" />
    <circle cx="8"  cy="14" r="3.5" fill={color} opacity="0.5" />
    <circle cx="24" cy="14" r="3.5" fill={color} opacity="0.5" />
    <path d="M2 26 C2 22 14 22 14 26" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
    <path d="M18 26 C18 22 30 22 30 26" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
  </svg>
);

const ModelIcon = ({ color }: { color: string }) => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="6" fill={color} opacity="0.8" />
    <circle cx="16" cy="16" r="12" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.4" />
    {/* Orbit dots */}
    <circle cx="16" cy="4"  r="2.5" fill={color} />
    <circle cx="28" cy="16" r="2.5" fill={color} opacity="0.7" />
    <circle cx="16" cy="28" r="2.5" fill={color} opacity="0.5" />
    <circle cx="4"  cy="16" r="2.5" fill={color} opacity="0.3" />
  </svg>
);

const ApiIcon = ({ color }: { color: string }) => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect x="4" y="8" width="24" height="16" rx="4" stroke={color} strokeWidth="1.5" opacity="0.4" />
    <text x="16" y="20" textAnchor="middle" fill={color} fontSize="9" fontWeight="700" fontFamily="monospace">{"</>"}</text>
    <circle cx="8"  cy="8" r="2" fill={color} />
    <circle cx="14" cy="8" r="2" fill={color} opacity="0.6" />
    <circle cx="20" cy="8" r="2" fill={color} opacity="0.3" />
  </svg>
);

const PipelineIcon = ({ color }: { color: string }) => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect x="2"  y="6"  width="8" height="8" rx="2" fill={color} opacity="0.8" />
    <rect x="12" y="6"  width="8" height="8" rx="2" fill={color} opacity="0.6" />
    <rect x="22" y="6"  width="8" height="8" rx="2" fill={color} opacity="0.4" />
    <rect x="7"  y="18" width="18" height="8" rx="2" fill={color} opacity="0.7" />
    <line x1="6"  y1="14" x2="16" y2="18" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    <line x1="16" y1="14" x2="16" y2="18" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    <line x1="26" y1="14" x2="16" y2="18" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
  </svg>
);

const FEATURES: Feature[] = [
  {
    icon: <TenantIcon color="#6366f1" />,
    title: "Tenant Isolation (indexed tenantId)",
    description:
      "A unified platform to build, manage, and scale your AI-driven data analysis. Every document is scoped by tenantId — guaranteed data isolation.",
    accentColor: "#6366f1",
  },
  {
    icon: <ModelIcon color="#8b5cf6" />,
    title: "Dynamic AI Model Integration (Ollama, Cloud APIs)",
    description:
      "Dynamic AI model integration covering Ollama, cloud AIs, and flexible model via APIs. Swap models without redeployment.",
    accentColor: "#8b5cf6",
  },
  {
    icon: <ApiIcon color="#06b6d4" />,
    title: "Developer-First APIs & SDKs",
    description:
      "Developer-first APIs & SDKs maximize composure across APIs & SDKs. Secure API keys with per-tenant quota management.",
    accentColor: "#06b6d4",
  },
  {
    icon: <PipelineIcon color="#10b981" />,
    title: "Automated Data Processing Pipelines",
    description:
      "Automated data processing pipelines to optimize processing and integrations. Excel, JSON, PDF, and image OCR — all in one place.",
    accentColor: "#10b981",
  },
];

export default function FeaturesSection() {
  return (
    <section
      id="features"
      style={{
        padding: "96px 24px",
        backgroundColor: "var(--bg-secondary)",
        borderTop:    "1px solid var(--border-subtle)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* Section Header */}
        <div style={{ textAlign: "center", marginBottom: "64px" }}>
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
            Platform Features
          </div>
          <h2
            style={{
              fontSize: "clamp(26px, 3.5vw, 40px)",
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
              marginBottom: "14px",
            }}
          >
            Everything you need to scale{" "}
            <span className="gradient-text">AI-powered analysis</span>
          </h2>
          <p
            style={{
              fontSize: "16px",
              color: "var(--text-secondary)",
              maxWidth: "520px",
              margin: "0 auto",
              lineHeight: 1.7,
            }}
          >
            Built for enterprises with security, scalability, and developer
            experience as first-class priorities.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "20px",
          }}
        >
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Individual feature card */
function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <div
      style={{
        padding: "28px",
        borderRadius: "16px",
        border: "1px solid var(--border-subtle)",
        background: "var(--bg-card)",
        boxShadow: "var(--card-shadow)",
        transition: "transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = "translateY(-6px)";
        el.style.borderColor = feature.accentColor + "60";
        el.style.boxShadow = `0 16px 48px ${feature.accentColor}20`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = "translateY(0)";
        el.style.borderColor = "var(--border-subtle)";
        el.style.boxShadow = "var(--card-shadow)";
      }}
    >
      {/* Icon container */}
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "14px",
          background: feature.accentColor + "15",
          border: `1px solid ${feature.accentColor}30`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "20px",
        }}
      >
        {feature.icon}
      </div>

      <h3
        style={{
          fontSize: "15px",
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: "10px",
          lineHeight: 1.4,
        }}
      >
        {feature.title}
      </h3>

      <p
        style={{
          fontSize: "13.5px",
          color: "var(--text-secondary)",
          lineHeight: 1.65,
        }}
      >
        {feature.description}
      </p>
    </div>
  );
}
