import Link from "next/link";

import InviteAcceptClient from "./InviteAcceptClient";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/options";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getServerSession(authOptions);

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", padding: "24px" }}>
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-color)",
          borderRadius: "18px",
          padding: "40px",
          maxWidth: "460px",
          width: "100%",
          textAlign: "center",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "10px" }}>🤝</div>
        <h1 style={{ fontSize: "21px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "8px" }}>
          Team Invitation
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "22px" }}>
          You&apos;ve been invited to join an organization on AIDL Platform.
        </p>

        {session ? (
          <InviteAcceptClient token={token} />
        ) : (
          <Link
            href={`/login?callbackUrl=/invite/${token}`}
            style={{
              display: "inline-block",
              padding: "13px 34px",
              borderRadius: "10px",
              background: "var(--brand-gradient)",
              color: "#fff",
              fontWeight: 700,
              fontSize: "15px",
              textDecoration: "none",
            }}
          >
            Sign in to accept
          </Link>
        )}
      </div>
    </main>
  );
}
