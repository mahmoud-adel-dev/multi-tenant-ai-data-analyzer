/**
 * @file src/app/not-found.tsx
 * @description Global 404 page for unmatched routes.
 */

import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found | AIDL",
};

export default function NotFoundPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", padding: "24px" }}>
      <div style={{ position: "fixed", inset: 0, background: "var(--hero-gradient)", pointerEvents: "none" }} />
      
      <div style={{ position: "relative", textAlign: "center", maxWidth: "420px" }}>
        <div style={{ fontSize: "120px", fontWeight: 900, lineHeight: 1, background: "var(--brand-gradient)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "16px", textShadow: "0 8px 32px var(--accent-glow)" }}>
          404
        </div>
        
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "12px" }}>
          Page not found
        </h1>
        
        <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginBottom: "32px", lineHeight: 1.6 }}>
          Sorry, we couldn&apos;t find the page you&apos;re looking for. It might have been moved or doesn&apos;t exist.
        </p>

        <Link 
          href="/"
          style={{ display: "inline-block", padding: "14px 28px", borderRadius: "10px", background: "var(--brand-gradient)", color: "#fff", fontSize: "15px", fontWeight: 700, textDecoration: "none", boxShadow: "0 4px 16px var(--accent-glow)", transition: "transform 0.2s" }}
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
