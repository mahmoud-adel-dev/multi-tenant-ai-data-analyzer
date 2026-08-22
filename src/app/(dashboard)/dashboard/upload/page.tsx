import Link from "next/link";
import { requireOrg } from "@/lib/auth/dal";
import { getDictionary, getServerLocale } from "@/i18n/server";
import UploadClient from "./UploadClient";

export const metadata = { title: "Upload Dataset" };

export default async function UploadPage() {
  const ctx = await requireOrg();
  const d = getDictionary(await getServerLocale());

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: "6px" }}>
            {d.upload.title}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", maxWidth: "680px" }}>
            {d.upload.subtitle}</p>
        </div>
        <Link
          href="/dashboard/data-explorer"
          style={{
            padding: "9px 16px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            background: "var(--bg-card)",
            color: "var(--text-primary)",
            fontSize: "13px",
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          View datasets →
        </Link>
      </div>
      <UploadClient
        maxUploadBytes={ctx.limits.maxUploadBytes}
        maxRows={ctx.limits.maxRowsPerDataset}
      />
    </div>
  );
}
