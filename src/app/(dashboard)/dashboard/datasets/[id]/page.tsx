/**
 * Dataset workspace — profile, generated dashboard, executive report and AI Q&A.
 */
import { notFound } from "next/navigation";
import connectDB from "@/lib/db";
import { requireOrg } from "@/lib/auth/dal";
import { AnalysisRun, Dashboard, Dataset, Report } from "@/models";
import type {
  AiNarrative,
  ColumnProfile,
  DashboardPlan,
  ReportPlan,
} from "@/types/analytics";
import type { QualityFinding } from "@/types/analytics";
import DatasetWorkspace from "./DatasetWorkspace";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DatasetPage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await requireOrg();
  await connectDB();

  // Org-scoped fetches — a wrong ID from another tenant resolves to null.
  const dataset = await Dataset.findOne({ _id: id, orgId: ctx.orgId, deletedAt: null })
    .lean<{
      _id: unknown;
      name: string;
      originalFilename: string;
      fileType: string;
      status: string;
      sizeBytes: number;
      rowCount: number | null;
      columnCount?: number | null;
      qualityScore: number | null;
      domain: { domain: string; confidence: number } | null;
      columnSnapshot: Array<{ name: string; normalizedName: string; inferredType: string; role: string }>;
      qualityFindings: QualityFinding[];
      profileSummary: { rowCount: number; columnCount: number; duplicateRowCount: number; missingCellPercentage: number } | null;
      latestJobId: unknown;
      errorMessage: string | null;
      createdAt: Date;
    } | null>()
    .catch(() => null);

  if (!dataset || !dataset._id) notFound();

  const [dashboardDoc, reportDoc, runDoc] = await Promise.all([
    Dashboard.findOne({ orgId: ctx.orgId, datasetId: dataset._id }).sort({ createdAt: -1 }).lean<{ title: string; plan: DashboardPlan } | null>(),
    Report.findOne({ orgId: ctx.orgId, datasetId: dataset._id }).sort({ createdAt: -1 }).lean<{ plan: ReportPlan } | null>(),
    // Projection keeps the heavy dashboard/report plans out of this fetch.
    AnalysisRun.findOne({ orgId: ctx.orgId, datasetId: dataset._id })
      .sort({ createdAt: -1 })
      .select("engineVersion aiNarrative payload.profile payload.warnings")
      .lean<{ engineVersion: string; aiNarrative: AiNarrative | null; payload?: { profile?: { columns?: ColumnProfile[] }; warnings?: string[] } } | null>(),
  ]);

  return (
    <DatasetWorkspace
      dataset={{
        id: String(dataset._id),
        name: dataset.name,
        originalFilename: dataset.originalFilename,
        fileType: dataset.fileType,
        status: dataset.status,
        sizeBytes: dataset.sizeBytes,
        rowCount: dataset.rowCount,
        qualityScore: dataset.qualityScore,
        domain: dataset.domain ?? null,
        columnSnapshot: dataset.columnSnapshot ?? [],
        qualityFindings: (dataset.qualityFindings ?? []) as QualityFinding[],
        profileSummary: dataset.profileSummary ?? null,
        errorMessage: dataset.errorMessage ?? null,
        createdAt: dataset.createdAt.toISOString(),
        latestJobId: dataset.latestJobId ? String(dataset.latestJobId) : null,
      }}
      dashboard={
        dashboardDoc
          ? { title: dashboardDoc.title, plan: dashboardDoc.plan }
          : null
      }
      report={reportDoc ? reportDoc.plan : null}
      narrative={runDoc?.aiNarrative ?? null}
      engineVersion={runDoc?.engineVersion ?? null}
      profileColumns={runDoc?.payload?.profile?.columns ?? []}
      engineWarnings={runDoc?.payload?.warnings ?? []}
    />
  );
}
