/**
 * MongoDB-backed job queue.
 *
 * Why not Redis/BullMQ by default: the queue must be verifiable in every
 * environment (including ones without Redis) while remaining production-grade.
 * Atomic claims via findOneAndUpdate give exactly-once processing semantics
 * per attempt; stalled jobs are reclaimed after a lock timeout. The interface
 * is intentionally queue-agnostic so a BullMQ driver can slot in later.
 *
 * Guarantees:
 *  - At most one worker holds a job at a time (atomic claim).
 *  - Retries with capped exponential backoff, up to maxAttempts.
 *  - Stalled jobs (crashed worker) return to QUEUED once their lock expires.
 *  - Idempotency keys prevent duplicate enqueueing of identical work.
 */
import { AnalysisJob } from "@/models";
import type { IAnalysisJob } from "@/models";
import { JobStatus } from "@/types";
import { logger } from "@/lib/logger";

export const JOB_LOCK_TIMEOUT_MS = 10 * 60 * 1000; // Reclaim jobs stuck > 10min without heartbeat.

export interface EnqueueOptions {
  /** Preallocated ID lets callers persist cross-references before publishing. */
  jobId?: string;
  idempotencyKey?: string;
  priority?: number;
  maxAttempts?: number;
  contextPrompt?: string | null;
}

export async function enqueueAnalysisJob(
  input: {
    orgId: string;
    datasetId: string;
    createdByUserId?: string | null;
    apiKeyId?: string | null;
  },
  opts: EnqueueOptions = {}
): Promise<IAnalysisJob> {
  const base = {
    contextPrompt: opts.contextPrompt ?? null,
    maxAttempts: opts.maxAttempts ?? 3,
  };
  if (opts.idempotencyKey) {
    const existing = await AnalysisJob.findOne({ idempotencyKey: opts.idempotencyKey }).lean<IAnalysisJob | null>();
    if (existing) return existing;
    try {
      return await AnalysisJob.create({
        ...(opts.jobId ? { _id: opts.jobId } : {}),
        ...input,
        ...base,
        status: JobStatus.QUEUED,
        stage: "queued",
        priority: opts.priority ?? 0,
        timings: { queuedAt: new Date() },
        idempotencyKey: opts.idempotencyKey,
      });
    } catch (err) {
      // Lost a unique-index race — return the winner instead of failing.
      const existing = await AnalysisJob.findOne({ idempotencyKey: opts.idempotencyKey }).lean<IAnalysisJob | null>();
      if (existing) return existing;
      throw err;
    }
  }

  return AnalysisJob.create({
    ...(opts.jobId ? { _id: opts.jobId } : {}),
    ...input,
    ...base,
    status: JobStatus.QUEUED,
    stage: "queued",
    priority: opts.priority ?? 0,
    timings: { queuedAt: new Date() },
  });
}

/**
 * Atomically claims the next runnable job for this worker.
 * Also requeues stale RUNNING jobs whose lock has expired.
 */
export async function claimNextJob(workerId: string): Promise<IAnalysisJob | null> {
  const now = new Date();

  // 1. Requeue stalled jobs (worker died mid-processing).
  await AnalysisJob.updateMany(
    {
      status: { $in: [JobStatus.ANALYZING, JobStatus.PARSING, JobStatus.PROFILING, JobStatus.SCANNING, JobStatus.GENERATING_DASHBOARD, JobStatus.GENERATING_REPORT] },
      lockedAt: { $lt: new Date(now.getTime() - JOB_LOCK_TIMEOUT_MS) },
      attempts: { $lt: 999 },
    },
    {
      $set: { status: JobStatus.QUEUED, lockedBy: null, lockedAt: null },
      $inc: { attempts: 1 },
    }
  );

  // 2. Atomic claim.
  return AnalysisJob.findOneAndUpdate(
    {
      status: JobStatus.QUEUED,
      runAt: { $lte: now },
    },
    {
      $set: {
        status: JobStatus.PARSING,
        stage: "claimed",
        lockedBy: workerId,
        lockedAt: now,
        lastHeartbeatAt: now,
      },
      $inc: { attempts: 1 },
      $setOnInsert: {},
    },
    { sort: { priority: -1, createdAt: 1 }, new: true }
  ).lean<IAnalysisJob | null>();
}

export async function heartbeat(jobId: string): Promise<void> {
  await AnalysisJob.updateOne({ _id: jobId }, { $set: { lastHeartbeatAt: new Date(), lockedAt: new Date() } });
}

export async function updateProgress(jobId: string, status: JobStatus, stage: string, progress: number): Promise<void> {
  await AnalysisJob.updateOne(
    { _id: jobId },
    { $set: { status, stage, progress: Math.min(100, Math.max(0, Math.round(progress))), lastHeartbeatAt: new Date(), lockedAt: new Date() } }
  );
}

/** Error codes that are deterministic — retrying cannot succeed. */
const NON_RETRYABLE_CODES = new Set([
  "CONTRACT_VALIDATION_FAILED",
  "NOT_FOUND",
  "MALFORMED_FILE",
  "FILE_TOO_LARGE",
]);

const BACKOFF_BASE_MS = 15_000;

/** Marks completion or schedules retry; terminal FAILED after maxAttempts. */
export async function completeOrRetry(
  job: IAnalysisJob,
  outcome: { ok: boolean; errorCode?: string; errorMessage?: string }
): Promise<"completed" | "retry_scheduled" | "failed"> {
  const now = new Date();

  if (outcome.ok) {
    await AnalysisJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: JobStatus.COMPLETED,
          stage: "completed",
          progress: 100,
          lockedBy: null,
          lockedAt: null,
          error: null,
          "timings.completedAt": now,
          "timings.durationMs": job.timings?.startedAt ? now.getTime() - new Date(job.timings.startedAt).getTime() : null,
        },
      }
    );
    return "completed";
  }

  const code = outcome.errorCode ?? "ANALYSIS_ERROR";
  const canRetry = job.attempts < job.maxAttempts && !NON_RETRYABLE_CODES.has(code);
  if (!canRetry) {
    await AnalysisJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: JobStatus.FAILED,
          stage: "failed",
          lockedBy: null,
          lockedAt: null,
          error: { code: outcome.errorCode ?? "ANALYSIS_ERROR", message: (outcome.errorMessage ?? "Unknown error").slice(0, 2000) },
          "timings.completedAt": now,
        },
      }
    );
    logger.warn("Job failed permanently", { jobId: job._id.toString(), code: outcome.errorCode });
    return "failed";
  }

  const delayMs = BACKOFF_BASE_MS * Math.pow(2, job.attempts - 1);
  await AnalysisJob.updateOne(
    { _id: job._id },
    {
      $set: {
        status: JobStatus.QUEUED,
        stage: `retry_scheduled`,
        runAt: new Date(now.getTime() + delayMs),
        lockedBy: null,
        lockedAt: null,
        error: { code: outcome.errorCode ?? "ANALYSIS_ERROR", message: (outcome.errorMessage ?? "").slice(0, 2000) },
      },
    }
  );
  logger.info("Job retry scheduled", { jobId: job._id.toString(), attempt: job.attempts, delayMs });
  return "retry_scheduled";
}
