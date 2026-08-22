"use client";

/**
 * Team management: members, invitations, role changes.
 */
import { useEffect, useState, useTransition } from "react";
import toast from "react-hot-toast";
import {
  inviteMember,
  listInvitations,
  listMembers,
  removeMember,
  updateMemberRole,
} from "@/actions/org";
import type { MemberDTO, InvitationDTO } from "@/types/dto";

const ROLES = ["admin", "analyst", "member", "viewer"] as const;

export default function TeamClient({ canManage, isOwner }: { canManage: boolean; isOwner: boolean }) {
  const [members, setMembers] = useState<MemberDTO[]>([]);
  const [invitations, setInvitations] = useState<InvitationDTO[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>("member");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      const [m, i] = await Promise.all([listMembers(), listInvitations()]);
      if (m.success) setMembers(m.data);
      else toast.error(m.error);
      if (i.success) setInvitations(i.data);
      setLoading(false);
    });
  };
  useEffect(load, []);

  const handleInvite = async () => {
    const res = await inviteMember(inviteEmail.trim(), inviteRole);
    if (res.success) {
      setLastInviteUrl(res.data.inviteUrl);
      setInviteEmail("");
      toast.success(res.message ?? "Invitation created.");
      load();
    } else {
      toast.error(res.error);
    }
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    const res = await updateMemberRole(memberId, role);
    if (res.success) {
      toast.success("Role updated.");
      load();
    } else {
      toast.error(res.error);
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!window.confirm("Remove this member from the organization?")) return;
    const res = await removeMember(memberId);
    if (res.success) {
      toast.success("Member removed.");
      load();
    } else {
      toast.error(res.error);
    }
  };

  if (loading) return <div style={{ height: "200px", borderRadius: "12px", background: "var(--bg-secondary)", opacity: 0.6 }} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* Invite */}
      {canManage && (
        <section style={card}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "14px" }}>Invite a teammate</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
              aria-label="Email address to invite"
              style={{ ...inputStyle, flex: 1, minWidth: "220px" }}
            />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)} aria-label="Role" style={inputStyle}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button onClick={handleInvite} disabled={!inviteEmail.includes("@")} style={primaryBtn}>
              Send invite
            </button>
          </div>
          {lastInviteUrl && (
            <div style={{ marginTop: "14px", background: "var(--accent-light)", borderRadius: "10px", padding: "12px 14px", fontSize: "13px" }}>
              <strong>Share this one-time invitation link</strong> (expires in 7 days):
              <code style={{ display: "block", marginTop: "6px", wordBreak: "break-all", fontSize: "12px", color: "var(--accent-primary)" }}>
                {typeof window !== "undefined" ? `${window.location.origin}${lastInviteUrl}` : lastInviteUrl}
              </code>
            </div>
          )}
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "10px" }}>
            Roles — Admin: manage team & keys · Analyst: upload & analyze · Member: view datasets · Viewer: dashboards only.
          </p>
        </section>
      )}

      {/* Members */}
      <section>
        <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px" }}>Members ({members.length})</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr>
                {["Name", "Email", "Role", "Joined"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
                {canManage && <th style={th}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td style={{ ...td, fontWeight: 600 }}>{m.name}</td>
                  <td style={{ ...td, color: "var(--text-secondary)" }}>{m.email}</td>
                  <td style={td}>
                    {isOwner && m.role !== "owner" ? (
                      <select
                        defaultValue={m.role}
                        onChange={(e) => handleRoleChange(m.id, e.target.value)}
                        aria-label={`Role for ${m.name}`}
                        style={{ ...inputStyle, padding: "5px 8px", fontSize: "13px" }}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{m.role}</span>
                    )}
                  </td>
                  <td style={{ ...td, fontSize: "12px", color: "var(--text-muted)" }}>{new Date(m.joinedAt).toLocaleDateString()}</td>
                  {canManage && (
                    <td style={td}>
                      {m.role !== "owner" && (
                        <button onClick={() => handleRemove(m.id)} style={{ ...ghostBtn, color: "#e5484d" }}>
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <section>
          <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px" }}>Pending invitations</h2>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
            {invitations.map((i) => (
              <li key={i.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ fontSize: "13.5px" }}>
                  <strong>{i.email}</strong> · {i.role}
                  <span style={{ color: "var(--text-muted)", fontSize: "12px", marginLeft: "8px" }}>
                    expires {new Date(i.expiresAt).toLocaleDateString()}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "14px",
  padding: "20px",
};
const inputStyle: React.CSSProperties = {
  padding: "11px 13px",
  borderRadius: "9px",
  border: "1px solid var(--border-color)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  fontSize: "14px",
};
const primaryBtn: React.CSSProperties = {
  padding: "11px 22px",
  borderRadius: "9px",
  background: "var(--brand-gradient)",
  color: "#fff",
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  fontSize: "14px",
};
const ghostBtn: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: "6px",
  background: "transparent",
  border: "1px solid var(--border-color)",
  fontWeight: 600,
  fontSize: "12px",
  cursor: "pointer",
  color: "var(--text-secondary)",
};
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
};
const td: React.CSSProperties = { padding: "12px" };
