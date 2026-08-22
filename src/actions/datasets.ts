"use server";

/**
 * Dataset actions: async upload → job creation, listing, detail, deletion.
 *
 * Upload flow (never synchronous analysis):
 *   auth (org role ≥ analyst) → file validation → quota reservation (atomic)
 *   → object storage put → Dataset + AnalysisJob(QUEUED) → return jobId.
 */
import { z } from "zod";
import crypto from "crypto";
import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db";
import {
  AnalysisJob,
  Dataset,
  UsageLedger,
  releaseQuota,
  reserveQuota,
  writeAudit,
} from "@/models";
import type { IAnalysisJob } from "@/models";
import { requireOrg, requireOrgRole } from "@/lib/auth/dal";
import { getStorage, datasetKey } from "@/lib/storage";
import { validateTabularUpload } from "@/lib/files/validation";
import { enqueueAnalysisJob, updateProgress } from "@/lib/jobs/queue";
import { actionSuccess, actionError, type ActionResponse } from "@/lib/utils";
import { NotFoundError, ValidationError, QuotaExceededError } from "@/lib/errors";
import { JobStatus, DatasetStatus } from "@/types";
import type { DatasetDTO, JobDTO } from "@/types/dto";
import { logger } from "@/lib/logger";
import { validateAnalyticsUpload } from "@/lib/analytics/client";

/* ─────────────────────────────── Upload ────────────────────────────────── */

export async function uploadDataset(formData: FormData): Promise<ActionResponse<{ jobId: string; datasetId: string }>> {
  try {
    const ctx = await requireOrgRole("analyst"); // viewer/member cannot upload
    await connectDB();

    const file = formData.get("file");
    if (!(file instanceof File)) throw ValidationError("No file provided.");

    const nameRaw = z
      .string()
      .max(200)
      .optional()
      .parse(formData.get("name") ?? undefined);
    const contextPrompt = z
      .string()
      .max(1000)
      .optional()
      .parse(formData.get("contextPrompt") ?? undefined);

    const buffer = Buffer.from(await file.arrayBuffer());

    // ── Validate content (magic bytes, size limits, sanitization) ────────
    const validated = validateTabularUpload(
      { name: file.name, size: file.size },
      buffer,
      { maxUploadBytes: ctx.limits.maxUploadBytes }
    );

    // Confirm the compute plane can parse the complete file before consuming
    // quota or creating any durable upload/job records.
    const preflight = await validateAnalyticsUpload({
      buffer: validated.buffer,
      filename: validated.sanitizedFilename,
      fileType: validated.fileType,
    });
    if (preflight.rowCount > ctx.limits.maxRowsPerDataset) {
      throw QuotaExceededError(
        `This dataset contains ${preflight.rowCount.toLocaleString()} rows, but your ${ctx.planKey} plan allows up to ${ctx.limits.maxRowsPerDataset.toLocaleString()} rows per dataset.`
      );
    }

    // ── Atomic quota reservations (jobs/month + upload bytes + storage) ──
    const jobsReserved = await reserveQuota(ctx.orgId, "jobs", ctx.periodKey, 1, ctx.limits.maxJobsPerMonth);
    if (!jobsReserved) {
      throw QuotaExceededError(
        `Monthly job limit reached (${ctx.limits.maxJobsPerMonth}/month on the ${ctx.planKey} plan). Upgrade or wait for the next cycle.`
      );
    }
    const storageReserved = await reserveQuota(ctx.orgId, "storage_bytes", "all", validated.sizeBytes, ctx.limits.maxStorageBytes);
    if (!storageReserved) {
      await releaseQuota(ctx.orgId, "jobs", ctx.periodKey, 1);
      throw QuotaExceededError(
        `Storage limit reached (${Math.round(ctx.limits.maxStorageBytes / 1024 / 1024)}MB on the ${ctx.planKey} plan). Delete old datasets or upgrade.`
      );
    }

    // ── Persist metadata + original bytes ────────────────────────────────
    const datasetId = new Types.ObjectId();
    const jobId = new Types.ObjectId();
    const storageKey = datasetKey(
      ctx.orgId,
      String(datasetId),
      "original",
      validated.sanitizedFilename
    );
    const storage = getStorage();
    let ledgerId: Types.ObjectId | null = null;
    let fileStored = false;
    let dataset;
    let job;

    try {
      dataset = await Dataset.create({
        _id: datasetId,
        orgId: ctx.orgId,
        createdByUserId: ctx.userId,
        name: (nameRaw ?? validated.sanitizedFilename).slice(0, 200),
        originalFilename: validated.originalFilename.slice(0, 255),
        sanitizedFilename: validated.sanitizedFilename,
        pipelineType: "tabular_data",
        fileType: validated.fileType,
        sizeBytes: validated.sizeBytes,
        checksumSha256: createChecksum(validated.buffer),
        originalStorageKey: storageKey,
        latestJobId: jobId,
        status: DatasetStatus.UPLOADING,
      });

      await storage.put(storageKey, validated.buffer);
      fileStored = true;

      dataset.status = DatasetStatus.READY;
      await dataset.save();

      const ledger = await UsageLedger.create({
        orgId: ctx.orgId,
        metric: "upload_bytes",
        periodKey: ctx.periodKey,
        delta: validated.sizeBytes,
        source: { userId: ctx.userId, reason: "dataset_upload" },
      });
      ledgerId = ledger._id as Types.ObjectId;

    // ── Enqueue background analysis ──────────────────────────────────────
      job = await enqueueAnalysisJob(
        {
          orgId: ctx.orgId,
          datasetId: String(datasetId),
          createdByUserId: ctx.userId,
        },
        { jobId: String(jobId), contextPrompt: contextPrompt ?? null }
      );
    } catch (err) {
      if (ledgerId) await UsageLedger.deleteOne({ _id: ledgerId }).catch(() => undefined);
      await AnalysisJob.deleteOne({ _id: jobId }).catch(() => undefined);
      await Dataset.deleteOne({ _id: datasetId }).catch(() => undefined);
      if (fileStored) await storage.delete(storageKey).catch(() => undefined);
      await releaseQuota(ctx.orgId, "jobs", ctx.periodKey, 1).catch(() => undefined);
      await releaseQuota(ctx.orgId, "storage_bytes", "all", validated.sizeBytes).catch(() => undefined);
      throw err;
    }

    await writeAudit({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: "dataset.uploaded",
      resourceType: "dataset",
      resourceId: String(dataset._id),
      metadata: { fileName: validated.sanitizedFilename, sizeBytes: validated.sizeBytes, fileType: validated.fileType },
    }).catch((error) => {
      logger.error("Upload audit write failed", {
        orgId: ctx.orgId,
        datasetId: String(datasetId),
        error: String(error),
      });
    });

    revalidatePath("/dashboard/data-explorer");
    return actionSuccess(
      { jobId: String(job._id), datasetId: String(dataset._id) },
      "Upload complete. Analysis is running."
    );
  } catch (error) {
    return actionError(error);
  }
}

function createChecksum(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/* ──────────────────────────── Listing/detail ───────────────────────────── */

export async function listDatasets(): Promise<ActionResponse<DatasetDTO[]>> {
  try {
    const ctx = await requireOrg();
    await connectDB();

    const datasets = await Dataset.find({ orgId: ctx.orgId, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean<Array<{
        _id: unknown; name: string; originalFilename: string; fileType: string; status: string;
        sizeBytes: number; rowCount: number | null; qualityScore: number | null;
        domain: { domain: string; confidence: number } | null;
        latestAnalysisRunId: unknown; latestJobId: unknown; errorMessage: string | null; createdAt: Date;
      }>>();

    return actionSuccess(
      datasets.map((d) => ({
        id: String(d._id),
        name: d.name,
        originalFilename: d.originalFilename,
        fileType: d.fileType as DatasetDTO["fileType"],
        status: d.status as DatasetDTO["status"],
        sizeBytes: d.sizeBytes,
        rowCount: d.rowCount,
        qualityScore: d.qualityScore,
        domain: d.domain,
        hasResults: Boolean(d.latestAnalysisRunId),
        latestJobId: d.latestJobId ? String(d.latestJobId) : null,
        errorMessage: d.errorMessage,
        createdAt: d.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    return actionError(error);
  }
}

export async function getDatasetDetail(datasetId: string): Promise<
  ActionResponse<
    DatasetDTO & {
      columnSnapshot: Array<{ name: string; normalizedName: string; inferredType: string; role: string }>;
      qualityFindings: Array<{ severity: string; issueType: string; column: string | null; description: string; affectedRows: number; suggestedRemediation: string }>;
      profileSummary: { rowCount: number; columnCount: number; duplicateRowCount: number; missingCellPercentage: number } | null;
    }
  >
> {
  try {
    const ctx = await requireOrg();
    await connectDB();

    const d = await Dataset.findOne({ _id: datasetId, orgId: ctx.orgId, deletedAt: null })
      .lean<{
        _id: unknown; name: string; originalFilename: string; fileType: string; status: string;
        sizeBytes: number; rowCount: number | null; qualityScore: number | null;
        domain: { domain: string; confidence: number } | null;
        latestAnalysisRunId: unknown; latestJobId: unknown; errorMessage: string | null; createdAt: Date;
        columnSnapshot: Array<{ name: string; normalizedName: string; inferredType: string; role: string }>;
        qualityFindings: Array<{ severity: string; issueType: string; column: string | null; description: string; affectedRows: number; suggestedRemediation: string }>;
        profileSummary: { rowCount: number; columnCount: number; duplicateRowCount: number; missingCellPercentage: number } | null;
      } | null>();

    if (!d) throw NotFoundError("Dataset not found.");

    return actionSuccess({
      id: String(d._id),
      name: d.name,
      originalFilename: d.originalFilename,
      fileType: d.fileType as DatasetDTO["fileType"],
      status: d.status as DatasetDTO["status"],
      sizeBytes: d.sizeBytes,
      rowCount: d.rowCount,
      qualityScore: d.qualityScore,
      domain: d.domain,
      hasResults: Boolean(d.latestAnalysisRunId),
      latestJobId: d.latestJobId ? String(d.latestJobId) : null,
      errorMessage: d.errorMessage,
      createdAt: d.createdAt.toISOString(),
      columnSnapshot: d.columnSnapshot ?? [],
      qualityFindings: d.qualityFindings ?? [],
      profileSummary: d.profileSummary ?? null,
    });
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteDataset(datasetId: string): Promise<ActionResponse<boolean>> {
  try {
    const ctx = await requireOrgRole("analyst");
    await connectDB();

    const dataset = await Dataset.findOne({ _id: datasetId, orgId: ctx.orgId, deletedAt: null });
    if (!dataset) throw NotFoundError("Dataset not found.");

    // Mark deleted first (tombstone), then best-effort remove stored bytes.
    dataset.deletedAt = new Date();
    dataset.status = DatasetStatus.DELETED;
    await dataset.save();

    try {
      const storage = getStorage();
      if (dataset.originalStorageKey) await storage.delete(dataset.originalStorageKey);
      if (dataset.parquetStorageKey) await storage.delete(dataset.parquetStorageKey);
      // Release storage quota.
      await releaseQuota(ctx.orgId, "storage_bytes", "all", dataset.sizeBytes);
    } catch {
      // Storage cleanup failures are logged via audit but don't block deletion.
    }

    await writeAudit({
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: "dataset.deleted",
      resourceType: "dataset",
      resourceId: datasetId,
      metadata: { name: dataset.name, sizeBytes: dataset.sizeBytes },
    });

    revalidatePath("/dashboard/data-explorer");
    return actionSuccess(true, "Dataset deleted.");
  } catch (error) {
    return actionError(error);
  }
}

/* ─────────────────────────────── Jobs ──────────────────────────────────── */

function jobToDTO(j: IAnalysisJob, datasetName: string | null): JobDTO {
  return {
    id: String(j._id),
    datasetId: String(j.datasetId),
    datasetName,
    status: j.status,
    stage: j.stage,
    progress: j.progress,
    attempts: j.attempts,
    maxAttempts: j.maxAttempts,
    error: j.error
      ? {
          code: String(j.error.code),
          message: String(j.error.message),
        }
      : null,
    resultRefs: {
      analysisRunId: j.resultRefs?.analysisRunId ? String(j.resultRefs.analysisRunId) : null,
      dashboardId: j.resultRefs?.dashboardId ? String(j.resultRefs.dashboardId) : null,
      reportId: j.resultRefs?.reportId ? String(j.resultRefs.reportId) : null,
    },
    createdAt: j.createdAt.toISOString(),
    startedAt: j.timings?.startedAt ? new Date(j.timings.startedAt).toISOString() : null,
    completedAt: j.timings?.completedAt ? new Date(j.timings.completedAt).toISOString() : null,
    durationMs: j.timings?.durationMs ?? null,
  };
}

export async function getJobStatus(jobId: string): Promise<ActionResponse<JobDTO>> {
  try {
    const ctx = await requireOrg();
    await connectDB();

    const job = await AnalysisJob.findOne({ _id: jobId, orgId: ctx.orgId }).lean<IAnalysisJob | null>();
    if (!job) throw NotFoundError("Job not found.");

    const dataset = await Dataset.findById(job.datasetId).lean<{ name: string } | null>();
    return actionSuccess(jobToDTO(job, dataset?.name ?? null));
  } catch (error) {
    return actionError(error);
  }
}

export async function listRecentJobs(limit = 20): Promise<ActionResponse<JobDTO[]>> {
  try {
    const ctx = await requireOrg();
    await connectDB();

    const jobs = await AnalysisJob.find({ orgId: ctx.orgId })
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100))
      .lean<IAnalysisJob[]>();

    const names = await Dataset.find({ orgId: ctx.orgId })
      .select("name")
      .lean<Array<{ _id: unknown; name: string }>>();
    const nameById = new Map(names.map((n) => [String(n._id), n.name]));

    return actionSuccess(jobs.map((j) => jobToDTO(j, nameById.get(String(j.datasetId)) ?? null)));
  } catch (error) {
    return actionError(error);
  }
}

/** Re-runs an existing dataset through the full pipeline. */
export async function reanalyzeDataset(datasetId: string): Promise<ActionResponse<{ jobId: string }>> {
  try {
    const ctx = await requireOrgRole("analyst");
    await connectDB();

    const dataset = await Dataset.findOne({ _id: datasetId, orgId: ctx.orgId, deletedAt: null });
    if (!dataset) throw NotFoundError("Dataset not found.");

    const reserved = await reserveQuota(ctx.orgId, "jobs", ctx.periodKey, 1, ctx.limits.maxJobsPerMonth);
    if (!reserved) throw QuotaExceededError(`Monthly job limit reached (${ctx.limits.maxJobsPerMonth}).`);

    const job = await enqueueAnalysisJob({
      orgId: ctx.orgId,
      datasetId: String(dataset._id),
      createdByUserId: ctx.userId,
    });

    dataset.status = DatasetStatus.PROCESSING;
    dataset.latestJobId = job._id as never;
    await dataset.save();

    revalidatePath(`/dashboard/datasets/${datasetId}`);
    return actionSuccess({ jobId: String(job._id) }, "Re-analysis queued.");
  } catch (error) {
    return actionError(error);
  }
}

void updateProgress;
void JobStatus;
