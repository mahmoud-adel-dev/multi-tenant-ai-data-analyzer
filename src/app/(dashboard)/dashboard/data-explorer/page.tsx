/**
 * @file src/app/(dashboard)/dashboard/data-explorer/page.tsx
 * @description SSR Data Explorer page for tenants.
 * Fetches the extraction records server-side based on URL query parameters.
 */

import { Metadata } from "next";
import { requireTenantAdmin } from "@/lib/auth/dal";
import { getExtractedDataList, ExplorerFilters } from "@/actions/data-explorer";
import ExplorerClient from "@/components/dashboard/ExplorerClient";
import { ExtractionStatus, SupportedFileType } from "@/types";

export const metadata: Metadata = {
  title: "Data Explorer",
  description: "View and search your extracted AI data.",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DataExplorerPage({ searchParams }: PageProps) {
  // Auth guard
  await requireTenantAdmin();

  const resolvedSearchParams = await searchParams;

  // Extract query params for SSR filtering
  const statusParam = typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : "all";
  const typeParam = typeof resolvedSearchParams.type === "string" ? resolvedSearchParams.type : "all";

  const filters: ExplorerFilters = {};
  
  if (statusParam !== "all" && Object.values(ExtractionStatus).includes(statusParam as ExtractionStatus)) {
    filters.status = statusParam as ExtractionStatus;
  }
  
  if (typeParam !== "all" && Object.values(SupportedFileType).includes(typeParam as SupportedFileType)) {
    filters.fileType = typeParam as SupportedFileType;
  }

  // Fetch data server-side
  const result = await getExtractedDataList(filters);

  if (!result.success) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>Failed to load data</h2>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "8px" }}>{result.error}</p>
      </div>
    );
  }

  return (
    <ExplorerClient 
      initialData={result.data} 
      initialStatusFilter={statusParam} 
      initialTypeFilter={typeParam} 
    />
  );
}
