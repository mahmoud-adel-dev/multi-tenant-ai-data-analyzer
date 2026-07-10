"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register } from "@/actions/auth";

export default function RegisterClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      // 1. Create account via Server Action
      const result = await register({ name, email, password });
      
      if (!result.success) {
        setError(result.error);
        return;
      }

      // 2. Sign in automatically with NextAuth
      const signInResult = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });

      if (signInResult?.error) {
        setError("Account created, but automatic sign-in failed. Please log in manually.");
        setTimeout(() => router.push("/login"), 2000);
      } else {
        router.push("/dashboard/api-keys");
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {error && (
        <div style={{ padding: "12px", borderRadius: "8px", background: "#ef444415", border: "1px solid #ef444430", color: "#ef4444", fontSize: "13px", fontWeight: 500 }}>
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>Company / Workspace Name</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)", fontSize: "14px", outline: "none", transition: "border-color 0.2s" }}
          placeholder="Acme Corp"
          onFocus={(e) => e.target.style.borderColor = "var(--accent-primary)"}
          onBlur={(e) => e.target.style.borderColor = "var(--border-color)"}
        />
      </div>

      <div>
        <label htmlFor="email" style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>Work Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)", fontSize: "14px", outline: "none", transition: "border-color 0.2s" }}
          placeholder="admin@acme.com"
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
          minLength={8}
          style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", background: "var(--bg-primary)", border: "1px solid var(--border-color)", color: "var(--text-primary)", fontSize: "14px", outline: "none", transition: "border-color 0.2s" }}
          placeholder="Min 8 characters"
          onFocus={(e) => e.target.style.borderColor = "var(--accent-primary)"}
          onBlur={(e) => e.target.style.borderColor = "var(--border-color)"}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        style={{ width: "100%", padding: "14px", borderRadius: "10px", background: "var(--brand-gradient)", color: "#fff", fontSize: "15px", fontWeight: 700, border: "none", cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.7 : 1, boxShadow: "0 4px 16px var(--accent-glow)", marginTop: "8px", transition: "transform 0.2s" }}
        onMouseEnter={(e) => !isPending && (e.currentTarget.style.transform = "translateY(-2px)")}
        onMouseLeave={(e) => !isPending && (e.currentTarget.style.transform = "translateY(0)")}
      >
        {isPending ? "Creating account..." : "Sign Up"}
      </button>

      <div style={{ textAlign: "center", fontSize: "13px", color: "var(--text-secondary)", marginTop: "16px" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--text-primary)", fontWeight: 600, textDecoration: "none" }}>
          Sign in
        </Link>
      </div>
    </form>
  );
}
