"use client";

/**
 * Invitation acceptance: verifies the one-time token and joins the org.
 * The raw token lives only in the URL; the server stores its hash.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { acceptInvitation } from "@/actions/org";

export default function InviteAcceptClient({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    const res = await acceptInvitation(token);
    if (res.success) {
      setDone(true);
      toast.success(`Welcome to ${res.data.orgName}!`);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 900);
    } else {
      setError(res.error);
      setBusy(false);
    }
  };

  if (done) {
    return <p style={{ fontSize: "15px", color: "#2ea043", fontWeight: 600 }}>Joined! Redirecting to your dashboard…</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center" }}>
      <button
        onClick={accept}
        disabled={busy}
        style={{
          padding: "13px 34px",
          borderRadius: "10px",
          background: "var(--brand-gradient)",
          color: "#fff",
          fontWeight: 700,
          fontSize: "15px",
          border: "none",
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Joining…" : "Accept invitation"}
      </button>
      {error && (
        <p style={{ fontSize: "13px", color: "#e5484d", textAlign: "center", maxWidth: "380px" }}>
          {error}
          <br />
          <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>
            Invitations are tied to the invited email address — sign in with that account.
          </span>
        </p>
      )}
    </div>
  );
}
