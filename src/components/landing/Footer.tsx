"use client";

/**
 * @file src/components/landing/Footer.tsx
 * @description Site footer with nav links, social icons, and theme toggle.
 * Server Component — links are static.
 */

const FOOTER_LINKS = {
  Company:       ["About", "Blog", "Careers", "Press"],
  API:           ["Reference", "SDKs", "Webhooks", "Status"],
  Pricing:       ["Free Tier", "Pro", "Enterprise", "Compare"],
  Documentation: ["Quickstart", "Guides", "Examples", "Changelog"],
};

/** Twitter / X */
const TwitterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const YouTubeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const SOCIAL_LINKS = [
  { icon: <TwitterIcon />,  href: "#", label: "Twitter" },
  { icon: <GitHubIcon />,   href: "#", label: "GitHub" },
  { icon: <LinkedInIcon />, href: "#", label: "LinkedIn" },
  { icon: <YouTubeIcon />,  href: "#", label: "YouTube" },
];

export default function Footer() {
  return (
    <footer
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderTop: "1px solid var(--border-color)",
        padding: "64px 24px 32px",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* Top: Logo + Links Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "200px repeat(4, 1fr)",
            gap: "32px",
            marginBottom: "56px",
          }}
          className="footer-grid"
        >
          {/* Logo column */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "9px",
                  background: "var(--brand-gradient)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>AI DATA</div>
                <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--accent-primary)", lineHeight: 1.2 }}>ANALYSIS SaaS</div>
              </div>
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.65 }}>
              Enterprise AI data analysis platform with multi-tenant isolation and flexible model integrations.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h4
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: "16px",
                  letterSpacing: "0.02em",
                }}
              >
                {category}
              </h4>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      style={{
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                        textDecoration: "none",
                        transition: "color 0.2s",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--text-primary)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--text-secondary)")}
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "var(--border-color)", marginBottom: "24px" }} />

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            © {new Date().getFullYear()} AIDL Platform. All rights reserved.
          </p>

          {/* Social links */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                aria-label={social.label}
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-card)",
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textDecoration: "none",
                  transition: "border-color 0.2s, color 0.2s, background 0.2s",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.borderColor = "var(--accent-primary)";
                  el.style.color = "var(--accent-primary)";
                  el.style.background = "var(--accent-light)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.borderColor = "var(--border-color)";
                  el.style.color = "var(--text-muted)";
                  el.style.background = "var(--bg-card)";
                }}
              >
                {social.icon}
              </a>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .footer-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 500px) {
          .footer-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </footer>
  );
}
