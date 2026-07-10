"use client";

/**
 * @file src/components/landing/Navbar.tsx
 * @description Top navigation bar with theme toggle and mobile menu.
 * "use client" is required for useState (theme toggle + mobile open state).
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sun, Moon, Menu, X, Zap } from "lucide-react";

const NAV_LINKS = [
  { label: "Features",      href: "#features" },
  { label: "API",           href: "#api" },
  { label: "Pricing",       href: "#pricing" },
  { label: "Documentation", href: "#docs" },
];

export default function Navbar() {
  const [theme, setTheme]           = useState<"dark" | "light">("dark");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled]     = useState(false);

  /** Apply theme to the <html> element so CSS vars kick in. */
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  /** Add shadow to navbar on scroll. */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleTheme = () =>
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: "var(--nav-bg)",
        borderBottom: `1px solid ${scrolled ? "var(--border-color)" : "transparent"}`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
        boxShadow: scrolled ? "0 4px 24px rgba(0,0,0,0.15)" : "none",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 24px",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* ── Logo ── */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "var(--brand-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Zap size={18} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
              AI DATA
            </div>
            <div style={{ fontSize: "11px", fontWeight: 500, color: "var(--accent-primary)", lineHeight: 1.2 }}>
              ANALYSIS SaaS
            </div>
          </div>
        </Link>

        {/* ── Desktop Nav Links ── */}
        <ul
          style={{
            display: "flex",
            listStyle: "none",
            gap: "8px",
            alignItems: "center",
          }}
          className="hidden-mobile"
        >
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <Link
                href={link.href}
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  textDecoration: "none",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  transition: "color 0.2s, background 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLAnchorElement).style.color = "var(--text-primary)";
                  (e.target as HTMLAnchorElement).style.background = "var(--accent-light)";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLAnchorElement).style.color = "var(--text-secondary)";
                  (e.target as HTMLAnchorElement).style.background = "transparent";
                }}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* ── Right Controls ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent-primary)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--accent-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-color)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
            }}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Sign In Button */}
          <Link
            href="/login"
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "#fff",
              textDecoration: "none",
              padding: "8px 20px",
              borderRadius: "8px",
              background: "var(--brand-gradient)",
              transition: "opacity 0.2s, transform 0.2s",
              display: "inline-block",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.opacity = "0.9";
              (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.opacity = "1";
              (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
            }}
          >
            Sign In
          </Link>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileOpen((o) => !o)}
            style={{
              display: "none",
              width: "36px",
              height: "36px",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
            id="mobile-menu-btn"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* ── Mobile Dropdown ── */}
      {mobileOpen && (
        <div
          style={{
            borderTop: "1px solid var(--border-color)",
            background: "var(--bg-secondary)",
            padding: "12px 24px 20px",
          }}
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              style={{
                display: "block",
                padding: "10px 0",
                fontSize: "15px",
                fontWeight: 500,
                color: "var(--text-secondary)",
                textDecoration: "none",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}

      {/* Inline responsive style */}
      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          #mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </nav>
  );
}
