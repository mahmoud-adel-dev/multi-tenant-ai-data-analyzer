import Link from "next/link";
import { requireOrg } from "@/lib/auth/dal";
import { getDictionary, getServerLocale } from "@/i18n/server";
import DatasetsClient from "./DatasetsClient";

export const metadata = { title: "Datasets" };
export const dynamic = "force-dynamic";

export default async function DataExplorerPage() {
  await requireOrg();
  const d = getDictionary(await getServerLocale());

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: "4px" }}>
            {d.datasetsPage.title}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            {d.datasetsPage.subtitle}
          </p>
        </div>
        <Link
          href="/dashboard/upload"
          style={{
            padding: "9px 16px",
            borderRadius: "8px",
            background: "var(--brand-gradient)",
            color: "#fff",
            fontSize: "13px",
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          {d.datasetsPage.uploadCta}
        </Link>
      </div>
      <DatasetsClient />
    </div>
  );
}
