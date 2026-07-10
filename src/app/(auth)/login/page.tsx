import { Metadata } from "next";
import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Login | AIDL Platform",
  description: "Sign in to your AIDL Platform account.",
};

export default function LoginPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", padding: "24px" }}>
      <div style={{ position: "fixed", inset: 0, background: "var(--hero-gradient)", pointerEvents: "none" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: "420px", background: "var(--bg-card)", padding: "40px", borderRadius: "24px", border: "1px solid var(--border-color)", boxShadow: "var(--card-shadow)" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "48px", height: "48px", borderRadius: "12px", background: "var(--brand-gradient)", marginBottom: "16px", boxShadow: "0 4px 16px var(--accent-glow)" }}>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: "20px" }}>A</span>
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "8px" }}>Welcome Back</h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Enter your credentials to access your workspace.</p>
        </div>
        <Suspense fallback={<div style={{ textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>}>
          <LoginClient />
        </Suspense>
      </div>
    </div>
  );
}
