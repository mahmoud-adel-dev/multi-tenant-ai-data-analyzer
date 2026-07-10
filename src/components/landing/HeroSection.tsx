"use client";

/**
 * @file src/components/landing/HeroSection.tsx
 * @description Hero section with headline, CTAs, and an interactive AI pipeline diagram.
 * Server Component — no interactivity needed here.
 */

import Link from "next/link";

/** SVG-based AI Pipeline Diagram matching the design screenshot */
function PipelineDiagram() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "520px",
        aspectRatio: "1 / 0.85",
      }}
      className="animate-float"
    >
      <svg
        viewBox="0 0 520 440"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "100%" }}
      >
        {/* ── Background glow ── */}
        <ellipse cx="260" cy="220" rx="180" ry="130" fill="var(--accent-glow)" opacity="0.25" />

        {/* ══════════════════════════════════════════
            LEFT SIDE — Input sources (Users / Data)
        ══════════════════════════════════════════ */}

        {/* User 1 */}
        <g transform="translate(20, 80)">
          <circle cx="28" cy="28" r="28" fill="var(--bg-card)" stroke="var(--border-color)" strokeWidth="1.5" />
          {/* Person icon */}
          <circle cx="28" cy="21" r="7" fill="var(--accent-primary)" opacity="0.9" />
          <path d="M10 46 C10 36 46 36 46 46" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.9" />
          <text x="28" y="70" textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontFamily="Inter,sans-serif">Tenant A</text>
        </g>

        {/* User 2 */}
        <g transform="translate(20, 180)">
          <circle cx="28" cy="28" r="28" fill="var(--bg-card)" stroke="var(--border-color)" strokeWidth="1.5" />
          <circle cx="28" cy="21" r="7" fill="#8b5cf6" opacity="0.9" />
          <path d="M10 46 C10 36 46 36 46 46" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.9" />
          <text x="28" y="70" textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontFamily="Inter,sans-serif">Tenant B</text>
        </g>

        {/* User 3 */}
        <g transform="translate(20, 280)">
          <circle cx="28" cy="28" r="28" fill="var(--bg-card)" stroke="var(--border-color)" strokeWidth="1.5" />
          <circle cx="28" cy="21" r="7" fill="#10b981" opacity="0.9" />
          <path d="M10 46 C10 36 46 36 46 46" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.9" />
          <text x="28" y="70" textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontFamily="Inter,sans-serif">Tenant C</text>
        </g>

        {/* ── Connecting lines (left → center) ── */}
        <line x1="76" y1="108" x2="200" y2="210" stroke="var(--accent-primary)" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.5" className="animated-dash" />
        <line x1="76" y1="208" x2="200" y2="220" stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.5" className="animated-dash" />
        <line x1="76" y1="308" x2="200" y2="230" stroke="#10b981" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.5" className="animated-dash" />

        {/* ══════════════════════════════════════════
            RIGHT SIDE — File types (inputs)
        ══════════════════════════════════════════ */}

        {/* Excel File */}
        <g transform="translate(360, 40)">
          <rect width="64" height="64" rx="12" fill="#16a34a" opacity="0.15" stroke="#16a34a" strokeWidth="1.5" strokeOpacity="0.4" />
          {/* Excel grid icon */}
          <rect x="16" y="16" width="32" height="32" rx="3" fill="#16a34a" opacity="0.8" />
          <line x1="24" y1="16" x2="24" y2="48" stroke="white" strokeWidth="1" opacity="0.7" />
          <line x1="32" y1="16" x2="32" y2="48" stroke="white" strokeWidth="1" opacity="0.7" />
          <line x1="40" y1="16" x2="40" y2="48" stroke="white" strokeWidth="1" opacity="0.7" />
          <line x1="16" y1="26" x2="48" y2="26" stroke="white" strokeWidth="1" opacity="0.7" />
          <line x1="16" y1="36" x2="48" y2="36" stroke="white" strokeWidth="1" opacity="0.7" />
          <text x="32" y="78" textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontFamily="Inter,sans-serif">Excel</text>
        </g>

        {/* JSON File */}
        <g transform="translate(430, 120)">
          <rect width="64" height="64" rx="12" fill="#2563eb" opacity="0.15" stroke="#2563eb" strokeWidth="1.5" strokeOpacity="0.4" />
          <rect x="16" y="16" width="32" height="32" rx="3" fill="#2563eb" opacity="0.8" />
          <text x="32" y="37" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="monospace">{`{}`}</text>
          <text x="48" y="78" textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontFamily="Inter,sans-serif">JSON</text>
        </g>

        {/* OCR / Image File */}
        <g transform="translate(360, 290)">
          <rect width="64" height="64" rx="12" fill="#ea580c" opacity="0.15" stroke="#ea580c" strokeWidth="1.5" strokeOpacity="0.4" />
          <rect x="16" y="16" width="32" height="32" rx="3" fill="#ea580c" opacity="0.8" />
          {/* Document lines */}
          <line x1="22" y1="24" x2="42" y2="24" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="22" y1="30" x2="42" y2="30" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="22" y1="36" x2="35" y2="36" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <text x="32" y="78" textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontFamily="Inter,sans-serif">PDF/OCR</text>
        </g>

        {/* ── Connecting lines (right inputs → center) ── */}
        <line x1="360" y1="72" x2="300" y2="205" stroke="#16a34a" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.5" className="animated-dash" />
        <line x1="430" y1="152" x2="300" y2="218" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.5" className="animated-dash" />
        <line x1="360" y1="318" x2="300" y2="232" stroke="#ea580c" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.5" className="animated-dash" />

        {/* ══════════════════════════════════════════
            CENTER — Core AI Engine
        ══════════════════════════════════════════ */}

        {/* Outer glow ring */}
        <circle cx="248" cy="220" r="75" fill="none" stroke="var(--accent-primary)" strokeWidth="1" opacity="0.2" strokeDasharray="4 8" className="animate-spin-slow" />

        {/* Main engine circle */}
        <circle cx="248" cy="220" r="60" fill="var(--bg-card)" stroke="var(--accent-primary)" strokeWidth="2" />
        <circle cx="248" cy="220" r="60" fill="url(#engineGradient)" opacity="0.4" />

        {/* Gradient definition */}
        <defs>
          <radialGradient id="engineGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Engine icon — circuit/brain */}
        <circle cx="248" cy="210" r="16" fill="none" stroke="var(--accent-primary)" strokeWidth="2" />
        <circle cx="248" cy="210" r="6" fill="var(--accent-primary)" />
        {/* Circuit lines */}
        <line x1="248" y1="194" x2="248" y2="184" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" />
        <line x1="264" y1="210" x2="274" y2="210" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" />
        <line x1="232" y1="210" x2="222" y2="210" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" />
        <line x1="248" y1="226" x2="248" y2="236" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" />

        <text x="248" y="252" textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="700" fontFamily="Inter,sans-serif">Core AI Engine</text>
        <text x="248" y="266" textAnchor="middle" fill="var(--text-muted)" fontSize="9" fontFamily="Inter,sans-serif">Multi-Tenant Isolated</text>
      </svg>
    </div>
  );
}

export default function HeroSection() {
  return (
    <section
      id="hero"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        paddingTop: "64px", /* navbar height */
        background: "var(--hero-gradient)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background grid pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(var(--border-subtle) 1px, transparent 1px),
            linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          opacity: 0.4,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "64px 24px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "64px",
          alignItems: "center",
          position: "relative",
          zIndex: 1,
          width: "100%",
        }}
        className="hero-grid"
      >
        {/* ── Left: Text Content ── */}
        <div>
          {/* Badge */}
          <div
            className="animate-fade-up"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              borderRadius: "100px",
              border: "1px solid var(--accent-primary)",
              background: "var(--accent-light)",
              color: "var(--accent-primary)",
              fontSize: "13px",
              fontWeight: 600,
              marginBottom: "24px",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--accent-primary)",
                display: "inline-block",
                animation: "pulse-ring 2s infinite",
              }}
            />
            Multi-Tenant AI Data Analysis Platform
          </div>

          {/* Headline */}
          <h1
            className="animate-fade-up delay-100"
            style={{
              fontSize: "clamp(32px, 4vw, 52px)",
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              marginBottom: "20px",
            }}
          >
            Unlock the Power of AI for{" "}
            <span className="gradient-text">Secure, Scalable</span>{" "}
            Data Analysis
          </h1>

          {/* Subtitle */}
          <p
            className="animate-fade-up delay-200"
            style={{
              fontSize: "16px",
              lineHeight: 1.7,
              color: "var(--text-secondary)",
              marginBottom: "36px",
              maxWidth: "460px",
            }}
          >
            A unified platform to build, manage, and scale your AI-driven data
            intelligence. Robust security, multi-tenant separation, and flexible
            model integrations.
          </p>

          {/* CTA Buttons */}
          <div
            className="animate-fade-up delay-300"
            style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}
          >
            <a
              href="/register"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "13px 28px",
                borderRadius: "10px",
                background: "var(--brand-gradient)",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 700,
                textDecoration: "none",
                transition: "transform 0.2s, box-shadow 0.2s",
                boxShadow: "0 4px 20px var(--accent-glow)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 8px 30px var(--accent-glow)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 4px 20px var(--accent-glow)";
              }}
            >
              Get Started Free
            </a>

            <a
              href="#features"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "13px 28px",
                borderRadius: "10px",
                border: "1.5px solid var(--border-color)",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                fontSize: "15px",
                fontWeight: 600,
                textDecoration: "none",
                transition: "border-color 0.2s, background 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--accent-primary)";
                (e.currentTarget as HTMLAnchorElement).style.background = "var(--accent-light)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border-color)";
                (e.currentTarget as HTMLAnchorElement).style.background = "var(--bg-card)";
              }}
            >
              Request a Demo
            </a>
          </div>

          {/* Trust Badges */}
          <div
            className="animate-fade-up delay-400"
            style={{
              marginTop: "48px",
              display: "flex",
              gap: "24px",
              flexWrap: "wrap",
            }}
          >
            {[
              { value: "99.9%", label: "Uptime SLA" },
              { value: "10x",   label: "Faster Extraction" },
              { value: "∞",     label: "Tenants Supported" },
            ].map((stat) => (
              <div key={stat.label}>
                <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--text-primary)" }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Pipeline Diagram ── */}
        <div
          style={{ display: "flex", justifyContent: "center", alignItems: "center" }}
          className="animate-fade-up delay-200"
        >
          <PipelineDiagram />
        </div>
      </div>

      {/* Responsive style */}
      <style>{`
        @media (max-width: 900px) {
          .hero-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
            text-align: center;
          }
          .hero-grid > div:last-child {
            justify-content: center;
          }
        }
      `}</style>
    </section>
  );
}
