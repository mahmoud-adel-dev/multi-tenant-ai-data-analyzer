"use client";

/**
 * @file src/app/error.tsx
 * @description Global Error Boundary for the application.
 * Catches unhandled runtime errors in Server and Client components.
 */

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service in production
    console.error("Global Error Caught:", error);
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", padding: "24px" }}>
      <div style={{ position: "fixed", inset: 0, background: "var(--hero-gradient)", pointerEvents: "none" }} />
      
      <div style={{ position: "relative", textAlign: "center", maxWidth: "480px", background: "var(--bg-card)", padding: "40px", borderRadius: "16px", border: "1px solid var(--border-color)", boxShadow: "var(--card-shadow)" }}>
        <div style={{ fontSize: "64px", marginBottom: "16px" }}>⚠️</div>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "12px" }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "32px", lineHeight: 1.6 }}>
          We encountered an unexpected error. Our team has been notified. 
          Please try reloading the page or contact support if the issue persists.
        </p>

        {process.env.NODE_ENV === "development" && (
          <div style={{ background: "#ef444415", border: "1px solid #ef444430", borderRadius: "8px", padding: "16px", marginBottom: "32px", textAlign: "left", overflowX: "auto" }}>
            <p style={{ color: "#ef4444", fontSize: "13px", fontFamily: "monospace", margin: 0 }}>
              {error.message || "Unknown error"}
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button 
            onClick={() => reset()}
            style={{ padding: "12px 24px", borderRadius: "8px", background: "var(--brand-gradient)", color: "#fff", fontSize: "14px", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 4px 16px var(--accent-glow)" }}
          >
            Try Again
          </button>
          <Link 
            href="/"
            style={{ padding: "12px 24px", borderRadius: "8px", background: "var(--bg-secondary)", color: "var(--text-primary)", fontSize: "14px", fontWeight: 600, border: "1px solid var(--border-color)", textDecoration: "none" }}
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
