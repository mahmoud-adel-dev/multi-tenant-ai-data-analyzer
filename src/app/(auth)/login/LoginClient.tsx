"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "unauthorized") {
      setError("Your session expired or you lack permissions. Please log in again.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });

    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
    } else {
      router.push("/dashboard/api-keys");
      router.refresh();
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {error && (
        <div style={{ padding: "12px", borderRadius: "8px", background: "#ef444415", border: "1px solid #ef444430", color: "#ef4444", fontSize: "13px", fontWeight: 500 }}>
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>Email Address</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)", fontSize: "14px", outline: "none", transition: "border-color 0.2s" }}
          placeholder="admin@aidl.com"
          onFocus={(e) => e.target.style.borderColor = "var(--accent-primary)"}
          onBlur={(e) => e.target.style.borderColor = "var(--border-color)"}
        />
      </div>

      <div>
        <label htmlFor="password" style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)", fontSize: "14px", outline: "none", transition: "border-color 0.2s" }}
          placeholder="••••••••"
          onFocus={(e) => e.target.style.borderColor = "var(--accent-primary)"}
          onBlur={(e) => e.target.style.borderColor = "var(--border-color)"}
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        style={{ width: "100%", padding: "14px", borderRadius: "10px", background: "var(--brand-gradient)", color: "#fff", fontSize: "15px", fontWeight: 700, border: "none", cursor: isLoading ? "not-allowed" : "pointer", opacity: isLoading ? 0.7 : 1, boxShadow: "0 4px 16px var(--accent-glow)", marginTop: "8px", transition: "transform 0.2s" }}
        onMouseEnter={(e) => !isLoading && (e.currentTarget.style.transform = "translateY(-2px)")}
        onMouseLeave={(e) => !isLoading && (e.currentTarget.style.transform = "translateY(0)")}
      >
        {isLoading ? "Signing in..." : "Sign In"}
      </button>

      <div style={{ textAlign: "center", fontSize: "13px", color: "var(--text-secondary)", marginTop: "16px" }}>
        Don&apos;t have an account?{" "}
        <Link href="/register" style={{ color: "var(--text-primary)", fontWeight: 600, textDecoration: "none" }}>
          Sign up
        </Link>
      </div>
    </form>
  );
}
