import { Metadata } from "next";
import RegisterClient from "./RegisterClient";

export const metadata: Metadata = {
  title: "Create Account | AIDL Platform",
  description: "Sign up for a new AIDL Platform tenant account.",
};

export default function RegisterPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", padding: "24px" }}>
      <div style={{ position: "fixed", inset: 0, background: "var(--hero-gradient)", pointerEvents: "none" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: "420px", background: "var(--bg-card)", padding: "40px", borderRadius: "24px", border: "1px solid var(--border-color)", boxShadow: "var(--card-shadow)" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "48px", height: "48px", borderRadius: "12px", background: "var(--brand-gradient)", marginBottom: "16px", boxShadow: "0 4px 16px var(--accent-glow)" }}>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: "20px" }}>A</span>
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "8px" }}>Create an Account</h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Join the AIDL Platform and start extracting data today.</p>
        </div>
        <RegisterClient />
      </div>
    </div>
  );
}
