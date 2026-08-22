/**
 * Public REST API — POST /api/v1/analyze
 *
 * Validates and stores an uploaded dataset, then enqueues asynchronous
 * analysis. Client-provided idempotency keys cover the complete upload, not
 * just job creation.
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { NextRequest } from "next/server";
import connectDB from "@/lib/db";
import {
  AnalysisJob,
  ApiKey,
  Dataset,
  User,
  UsageLedger,
  releaseQuota,
  reserveQuota,
  monthlyPeriodFor,
  writeAudit,
} from "@/models";
import type { IApiKey } from "@/models";
import { getStorage, datasetKey } from "@/lib/storage";
import { validateTabularUpload } from "@/lib/files/validation";
import { enqueueAnalysisJob } from "@/lib/jobs/queue";
import { apiErrorFromUnknown, preflightResponse } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DatasetStatus } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DUMMY_HASH = "$2a$10$C6UzMDM.H6dfI/f/IKcEeO7ZBpQqXQhLScPCLxrWlmS1fUoGXvN4a";

interface ApiAuthResult {
  apiKey: IApiKey;
  orgId: string;
}

function acceptedJobResponse(
  job: { id: string; datasetId: string; status: string },
  replayed = false
): Response {
  return Response.json(
    {
      success: true,
      data: {
        jobId: job.id,
        datasetId: job.datasetId,
        status: job.status,
        statusUrl: `/api/v1/jobs/${job.id}`,
        links: {
          analysis: `/api/v1/datasets/${job.datasetId}/analysis`,
        },
      },
    },
    {
      status: 202,
      headers: replayed ? { "Idempotency-Replayed": "true" } : undefined,
    }
  );
}

async function authenticateApiKey(request: NextRequest): Promise<ApiAuthResult | null> {
  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const submittedKey = header.slice(7).trim();
  if (submittedKey.length < 12) return null;

  await connectDB();
  const keyPrefix = submittedKey.slice(0, 8);

  const candidates = await ApiKey.find({
    keyPrefix,
    status: "active",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  })
    .select("+keyHash")
    .lean<IApiKey[]>();

  if (candidates.length === 0) {
    // Keep timing consistent for unknown keys.
    await bcrypt.compare(submittedKey, DUMMY_HASH);
    return null;
  }

  for (const candidate of candidates) {
    if (await bcrypt.compare(submittedKey, candidate.keyHash)) {
      return { apiKey: candidate, orgId: String(candidate.orgId) };
    }
  }
  return null;
}

export async function OPTIONS(): Promise<Response> {
  return preflightResponse();
}

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = crypto.randomUUID();

  try {
    const auth = await authenticateApiKey(request);
    if (!auth) {
      return apiErrorFromUnknown(new Error("Invalid or expired API key."));
    }

    const submittedIdempotencyKey =
      request.headers.get("Idempotency-Key")?.trim().slice(0, 128) || undefined;
    const idempotencyKey = submittedIdempotencyKey
      ? `${auth.orgId}:${submittedIdempotencyKey}`
      : undefined;

    // A prior request may have committed but lost its HTTP response. Return
    // the durable job before reading/storing the body or reserving quota again.
    if (idempotencyKey) {
      const existing = await AnalysisJob.findOne({
        orgId: auth.orgId,
        idempotencyKey,
      })
        .select("_id datasetId status")
        .lean<{ _id: unknown; datasetId: unknown; status: string } | null>();

      if (existing) {
        return acceptedJobResponse(
          {
            id: String(existing._id),
            datasetId: String(existing.datasetId),
            status: existing.status,
          },
          true
        );
      }
    }

    // Per-key rate limit.
    const rl = await enforceRateLimit(
      "api",
      String(auth.apiKey._id),
      auth.apiKey.rateLimitPerMinute || 30,
      60
    );
    if (!rl.allowed) {
      return Response.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Rate limit exceeded." } },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.retryAfterSec),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    // Parse multipart uploads or JSON bodies containing base64 data.
    let buffer: Buffer;
    let filename: string;

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return Response.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Multipart body must include a 'file' field.",
            },
          },
          { status: 400 }
        );
      }
      filename = file.name;
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      let body: { data?: string; filename?: string };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return Response.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Body must be JSON or multipart/form-data.",
            },
          },
          { status: 400 }
        );
      }
      if (!body.data) {
        return Response.json(
          {
            success: false,
            error: { code: "VALIDATION_ERROR", message: "Field 'data' is required." },
          },
          { status: 400 }
        );
      }
      try {
        buffer = Buffer.from(body.data, "base64");
      } catch {
        return Response.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "'data' must be base64-encoded.",
            },
          },
          { status: 400 }
        );
      }
      filename = (body.filename ?? "api-upload.csv").slice(0, 255);
    }

    // Resolve plan limits using the same catalog as the web application.
    const { Plan, Subscription, FREE_PLAN_LIMITS } = await import("@/models");
    const subscription = await Subscription.findOne({ orgId: auth.orgId }).lean<{
      planKey: string;
    } | null>();
    const plan = await Plan.findOne({ key: subscription?.planKey ?? "free" }).lean<{
      limits: {
        maxUploadBytes: number;
        maxJobsPerMonth: number;
        maxStorageBytes: number;
      };
    } | null>();
    const limits = plan?.limits ?? FREE_PLAN_LIMITS;

    let validated;
    try {
      validated = validateTabularUpload(
        { name: filename, size: buffer.length },
        buffer,
        { maxUploadBytes: limits.maxUploadBytes }
      );
    } catch (error) {
      return apiErrorFromUnknown(error, requestId);
    }

    const { periodKey } = monthlyPeriodFor();
    const datasetId = new Types.ObjectId();
    const datasetIdString = String(datasetId);
    const storageKey = datasetKey(
      auth.orgId,
      datasetIdString,
      "original",
      validated.sanitizedFilename
    );
    // Resolve provider configuration before reserving quota.
    const storage = getStorage();
    const ledgerId = new Types.ObjectId();

    let jobsReserved = false;
    let storageReserved = false;
    let datasetCreateAttempted = false;
    let storagePutAttempted = false;
    let ledgerCreateAttempted = false;
    let compensated = false;

    const compensateUpload = async (reason: string): Promise<void> => {
      if (compensated) return;
      compensated = true;

      const failures: Array<{ step: string; error: string }> = [];
      const attempt = async (step: string, operation: () => Promise<unknown>) => {
        try {
          await operation();
        } catch (error) {
          failures.push({ step, error: String(error) });
        }
      };

      // Pre-generated IDs make these compensations safe even if a service
      // committed a write but its acknowledgement was lost.
      if (ledgerCreateAttempted) {
        await attempt("usage_ledger", () =>
          UsageLedger.deleteOne({ _id: ledgerId, orgId: auth.orgId })
        );
      }
      if (storagePutAttempted) {
        await attempt("stored_file", () => storage.delete(storageKey));
      }
      if (datasetCreateAttempted) {
        await attempt("dataset", () =>
          Dataset.deleteOne({ _id: datasetId, orgId: auth.orgId })
        );
      }
      if (storageReserved) {
        await attempt("storage_quota", () =>
          releaseQuota(auth.orgId, "storage_bytes", "all", validated.sizeBytes)
        );
      }
      if (jobsReserved) {
        await attempt("jobs_quota", () =>
          releaseQuota(auth.orgId, "jobs", periodKey, 1)
        );
      }

      const context = {
        requestId,
        orgId: auth.orgId,
        datasetId: datasetIdString,
        reason,
        ...(failures.length > 0 ? { cleanupFailures: failures } : {}),
        service: "api",
      };
      if (failures.length > 0) {
        logger.error("API upload compensation was incomplete", context);
      } else {
        logger.info("API upload compensated", context);
      }
    };

    const jobsOk = await reserveQuota(
      auth.orgId,
      "jobs",
      periodKey,
      1,
      limits.maxJobsPerMonth
    );
    if (!jobsOk) {
      return Response.json(
        {
          success: false,
          error: { code: "QUOTA_EXCEEDED", message: "Monthly analysis quota exhausted." },
        },
        { status: 402 }
      );
    }
    jobsReserved = true;

    const storageOk = await reserveQuota(
      auth.orgId,
      "storage_bytes",
      "all",
      validated.sizeBytes,
      limits.maxStorageBytes
    );
    if (!storageOk) {
      await compensateUpload("storage_quota_exceeded");
      return Response.json(
        {
          success: false,
          error: { code: "QUOTA_EXCEEDED", message: "Storage quota exhausted." },
        },
        { status: 402 }
      );
    }
    storageReserved = true;

    let job;
    try {
      datasetCreateAttempted = true;
      await Dataset.create({
        _id: datasetId,
        orgId: auth.orgId,
        createdByUserId: null,
        name: validated.sanitizedFilename.slice(0, 200),
        originalFilename: validated.originalFilename.slice(0, 255),
        sanitizedFilename: validated.sanitizedFilename,
        pipelineType: "tabular_data",
        fileType: validated.fileType,
        sizeBytes: validated.sizeBytes,
        checksumSha256: crypto.createHash("sha256").update(validated.buffer).digest("hex"),
        originalStorageKey: storageKey,
        status: DatasetStatus.UPLOADING,
      });

      storagePutAttempted = true;
      await storage.put(storageKey, validated.buffer);
      await Dataset.updateOne(
        { _id: datasetId, orgId: auth.orgId },
        { $set: { status: DatasetStatus.READY } }
      );

      ledgerCreateAttempted = true;
      await UsageLedger.create({
        _id: ledgerId,
        orgId: auth.orgId,
        metric: "upload_bytes",
        periodKey,
        delta: validated.sizeBytes,
        source: { apiKeyId: String(auth.apiKey._id), reason: "api_upload" },
      });

      // An internal per-request key lets enqueueAnalysisJob resolve ambiguous
      // insert acknowledgements even when the client omitted its own key.
      const queueIdempotencyKey =
        idempotencyKey ?? `${auth.orgId}:request:${requestId}`;
      job = await enqueueAnalysisJob(
        {
          orgId: auth.orgId,
          datasetId: datasetIdString,
          createdByUserId: null,
          apiKeyId: String(auth.apiKey._id),
        },
        { idempotencyKey: queueIdempotencyKey }
      );
    } catch (error) {
      await compensateUpload("pre_enqueue_failure");
      throw error;
    }

    // Concurrent requests with the same client key can both reach storage
    // before the unique job index elects a winner. Remove the loser's complete
    // upload footprint and return the durable winner.
    if (String(job.datasetId) !== datasetIdString) {
      await compensateUpload("idempotency_race_lost");
      return acceptedJobResponse(
        {
          id: String(job._id),
          datasetId: String(job.datasetId),
          status: job.status,
        },
        true
      );
    }

    // The job is durable and may already be claimed by a worker. Bookkeeping
    // failures from this point must not turn a successful enqueue into a 500.
    try {
      await Dataset.updateOne(
        { _id: datasetId, orgId: auth.orgId },
        { $set: { latestJobId: job._id } }
      );
    } catch (error) {
      logger.error("Failed to link queued API job to dataset", {
        requestId,
        orgId: auth.orgId,
        datasetId: datasetIdString,
        jobId: String(job._id),
        error: String(error),
        service: "api",
      });
    }

    try {
      await ApiKey.updateOne(
        { _id: auth.apiKey._id },
        { $inc: { requestCount: 1 }, $set: { lastUsedAt: new Date() } }
      );
    } catch (error) {
      logger.warn("Failed to update API key usage bookkeeping", {
        requestId,
        orgId: auth.orgId,
        jobId: String(job._id),
        error: String(error),
        service: "api",
      });
    }

    try {
      await writeAudit({
        orgId: auth.orgId,
        actorUserId: null,
        actorType: "api_key",
        action: "dataset.uploaded",
        resourceType: "dataset",
        resourceId: datasetIdString,
        metadata: { jobId: String(job._id), sizeBytes: validated.sizeBytes },
      });
    } catch (error) {
      logger.warn("Failed to write API upload audit event", {
        requestId,
        orgId: auth.orgId,
        datasetId: datasetIdString,
        jobId: String(job._id),
        error: String(error),
        service: "api",
      });
    }

    logger.info("API analyze job created", {
      requestId,
      jobId: String(job._id),
      orgId: auth.orgId,
      service: "api",
    });

    return acceptedJobResponse({
      id: String(job._id),
      datasetId: datasetIdString,
      status: job.status,
    });
  } catch (error) {
    return apiErrorFromUnknown(error, requestId);
  }
}

void User;
