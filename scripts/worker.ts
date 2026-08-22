/**
 * Analytics worker entrypoint.
 *
 * Claims jobs from the queue and drives the compute pipeline:
 *   download file → Python analytics engine → validate contract → persist
 *   AnalysisRun + Dashboard + Report → AI narrative (optional) → notify.
 *
 * Run with: npm run worker
 */
import mongoose from "mongoose";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import connectDB from "@/lib/db";
import {
  AnalysisJob,
  AnalysisRun,
  Dashboard,
  Dataset,
  Notification,
  Report,
  UsageLedger,
  writeAudit,
  monthlyPeriodFor,
} from "@/models";
import { JobStatus, DatasetStatus } from "@/types";
import { claimNextJob, completeOrRetry, updateProgress, heartbeat } from "@/lib/jobs/queue";
import { getStorage } from "@/lib/storage";
import { callAnalyticsService } from "@/lib/analytics/client";
import { AnalysisRunPayloadSchema } from "@/lib/ai/analytics-schema";
import { generateNarrative } from "@/lib/ai/narrative";
import { AiModelConfig } from "@/models";
import crypto from "crypto";

const WORKER_ID = `worker-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
const POLL_INTERVAL_MS = 2000;
/** Heartbeats must outlive the analytics call, or the queue reclaims a
 * "stalled" job while the engine is still computing (duplicate work). */
const HEARTBEAT_INTERVAL_MS = 30_000;

let stopping = false;

/** Keeps the job lock alive during long synchronous engine calls. */
function startHeartbeat(jobId: string): () => void {
  const timer = setInterval(() => {
    heartbeat(jobId).catch(() => undefined);
  }, HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}

function rssMB(): number {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

async function processJob(jobId: string): Promise<void> {
  await connectDB();
  const job = await AnalysisJob.findById(jobId).lean<import("@/models").IAnalysisJob | null>();
  if (!job) return;

  const dataset = await Dataset.findById(job.datasetId);
  if (!dataset) {
    await completeOrRetry(job, { ok: false, errorCode: "NOT_FOUND", errorMessage: "Dataset record missing." });
    return;
  }

  const log = (msg: string, extra: Record<string, unknown> = {}) =>
    logger.info(msg, { jobId: String(job._id), datasetId: String(dataset._id), service: "worker", ...extra });

  const jobStartedAt = Date.now();
  try {
    log("ANALYSIS_STARTED", { stage: "start", rows: null, columns: null });

    // ── 1. Load original file from object storage ───────────────────────
    await updateProgress(jobId, JobStatus.PARSING, "Loading dataset", 10);
    const storage = getStorage();
    const buffer = await storage.get(dataset.originalStorageKey);

    if (buffer.length !== dataset.sizeBytes) {
      throw new Error(`Stored file size mismatch (expected ${dataset.sizeBytes}, got ${buffer.length}).`);
    }
    log("PARSING_COMPLETED", { stage: "parse", bytes: buffer.length, memoryMB: rssMB() });

    // ── 2. Python engine: parse + profile + analyze + plan dashboard/report ──
    // One opaque compute call — progress stays anchored here and the UI
    // surfaces elapsed time instead of fabricated percentages.
    await updateProgress(jobId, JobStatus.ANALYZING, "Running deterministic analysis", 30);
    const stopHeartbeat = startHeartbeat(jobId);
    const engineStartedAt = Date.now();
    let payload;
    try {
      payload = await callAnalyticsService(
        { buffer, filename: dataset.sanitizedFilename, fileType: dataset.fileType },
        { maxRows: 5_000_000 }
      );
    } finally {
      stopHeartbeat();
    }
    const engineDurationMs = Date.now() - engineStartedAt;
    log("ANALYZING_COMPLETED", {
      stage: "analyze",
      durationMs: engineDurationMs,
      rowCount: payload?.profile?.rowCount ?? null,
      columnCount: payload?.profile?.columnCount ?? null,
      memoryMB: rssMB(),
    });

    // ── 3. Validate the contract — never persist malformed engine output ────
    const parsed = AnalysisRunPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const issues = parsed.error.errors
        .slice(0, 5)
        .map((e) => `${e.path.join(".")} ${e.message}`)
        .join("; ");
      log("CONTRACT_VALIDATION_FAILED", {
        stage: "validate",
        issueCount: parsed.error.errors.length,
        firstIssues: issues,
        durationMs: Date.now() - jobStartedAt,
      });
      throw new Error(
        `Analytics payload failed contract validation (${parsed.error.errors.length} issue(s)): ${issues}`
      );
    }
    const verified = parsed.data as import("@/types/analytics").AnalysisRunPayload;
    log("CONTRACT_VALIDATED", { stage: "validate", warnings: verified.warnings.length });

    await updateProgress(jobId, JobStatus.GENERATING_DASHBOARD, "Generating dashboard", 65);

    // ── 4. Persist AnalysisRun ──────────────────────────────────────────
    await updateProgress(jobId, JobStatus.GENERATING_DASHBOARD, "Persisting analysis results", 65);
    const analysisRun = await AnalysisRun.create({
      orgId: job.orgId,
      datasetId: dataset._id,
      datasetVersion: dataset.version,
      jobId: job._id,
      status: "completed",
      engineVersion: verified.engineVersion,
      payload: verified,
      aiNarrative: null,
    });

    // ── 5. Persist Dashboard ────────────────────────────────────────────
    const dashboard = await Dashboard.create({
      orgId: job.orgId,
      datasetId: dataset._id,
      analysisRunId: analysisRun._id,
      title: verified.dashboardPlan.title,
      plan: verified.dashboardPlan,
      engineVersion: verified.engineVersion,
    });

    // ── 6. Persist Report ───────────────────────────────────────────────
    await updateProgress(jobId, JobStatus.GENERATING_REPORT, "Generating report", 80);
    const report = await Report.create({
      orgId: job.orgId,
      datasetId: dataset._id,
      analysisRunId: analysisRun._id,
      title: verified.reportPlan.title,
      plan: verified.reportPlan,
      engineVersion: verified.engineVersion,
    });

    // ── 7. Update dataset with profile snapshot ─────────────────────────
    dataset.status = DatasetStatus.READY;
    dataset.columnSnapshot = verified.profile.columns.map((c) => ({
      name: c.name,
      normalizedName: c.normalizedName,
      inferredType: c.inferredType,
      role: c.role,
    }));
    dataset.rowCount = verified.profile.rowCount;
    dataset.qualityScore = verified.profile.qualityScore;
    dataset.domain = { domain: verified.domain.domain, confidence: verified.domain.confidence };
    dataset.profileSummary = {
      rowCount: verified.profile.rowCount,
      columnCount: verified.profile.columnCount,
      duplicateRowCount: verified.profile.duplicateRowCount,
      missingCellPercentage: verified.profile.missingCellPercentage,
    };
    dataset.qualityFindings = verified.qualityFindings as never;
    dataset.latestAnalysisRunId = analysisRun._id;
    dataset.latestJobId = job._id;
    dataset.errorMessage = null;
    await dataset.save();

    // ── 8. Meter usage (rows analyzed) ──────────────────────────────────
    const { periodKey } = monthlyPeriodFor();
    await UsageLedger.create({
      orgId: job.orgId,
      metric: "rows_analyzed",
      periodKey,
      delta: verified.executionStats.rowsAnalyzed,
      source: { jobId: String(job._id), reason: "analysis_completed" },
    });

    // ── 9. Link results to the job ──────────────────────────────────────
    await AnalysisJob.updateOne(
      { _id: job._id },
      {
        $set: {
          "resultRefs.analysisRunId": analysisRun._id,
          "resultRefs.dashboardId": dashboard._id,
          "resultRefs.reportId": report._id,
        },
      }
    );

    // ── 10. Optional AI narrative over VERIFIED results only ────────────
    await updateProgress(jobId, JobStatus.GENERATING_REPORT, "Writing narrative", 90);
    const activeModel = await AiModelConfig.findOne({ isActive: true }).lean();
    let aiNarrative = null;
    if (activeModel) {
      aiNarrative = await generateNarrative(verified);
      if (aiNarrative) {
        await AnalysisRun.updateOne({ _id: analysisRun._id }, { $set: { aiNarrative } });
        if (aiNarrative.tokensUsed) {
          await UsageLedger.create({
            orgId: job.orgId,
            metric: "ai_tokens_out",
            periodKey,
            delta: aiNarrative.tokensUsed,
            source: { jobId: String(job._id), reason: "narrative" },
          });
        }
        // Enrich the report's executive summary with the validated narrative.
        const execSummary = report.plan.sections.find((s: { key: string }) => s.key === "executive_summary");
        if (execSummary && aiNarrative.executiveSummary) {
          execSummary.blocks.unshift({
            kind: "paragraph",
            text: `${aiNarrative.executiveSummary}\n\n(AI-generated narrative over verified analytical results.)`,
          } as never);
          await Report.updateOne({ _id: report._id }, { $set: { "plan.sections": report.plan.sections } });
        }
      }
    }

    // ── 11. Notify the uploader ─────────────────────────────────────────
    if (job.createdByUserId) {
      await Notification.create({
        userId: job.createdByUserId,
        orgId: job.orgId,
        title: "Analysis ready",
        message: `"${dataset.name}" finished processing. Dashboard and report are available.`,
        link: `/dashboard/datasets/${String(dataset._id)}`,
        type: "success",
      });
    }

    log("ANALYSIS_COMPLETED", {
      stage: "completed",
      durationMs: Date.now() - jobStartedAt,
      engineDurationMs,
      rowCount: verified.profile.rowCount,
      columnCount: verified.profile.columnCount,
      anomalyCount: verified.anomalies.length,
      trendCount: verified.trends.length,
      qualityScore: verified.profile.qualityScore,
      memoryMB: rssMB(),
    });

    await writeAudit({
      orgId: String(job.orgId),
      actorUserId: job.createdByUserId ? String(job.createdByUserId) : null,
      actorType: "system",
      action: "analysis.completed",
      resourceType: "dataset",
      resourceId: String(dataset._id),
      metadata: { jobId: String(job._id), rowsAnalyzed: verified.executionStats.rowsAnalyzed },
    });

    await completeOrRetry(job, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("ANALYSIS_FAILED", {
      jobId: String(job._id),
      datasetId: String(dataset._id),
      service: "worker",
      error: message,
      durationMs: Date.now() - jobStartedAt,
      memoryMB: rssMB(),
    });
    const outcome = await completeOrRetry(job, {
      ok: false,
      errorCode: message.startsWith("Analytics payload failed contract validation")
        ? "CONTRACT_VALIDATION_FAILED"
        : "ANALYSIS_ERROR",
      errorMessage: message.slice(0, 1000),
    });

    dataset.status = DatasetStatus.FAILED;
    dataset.errorMessage = message.slice(0, 500);
    if (outcome === "failed") await dataset.save();

    if (job.createdByUserId && outcome === "failed") {
      await Notification.create({
        userId: job.createdByUserId,
        orgId: job.orgId,
        title: "Analysis failed",
        message: `Processing of "${dataset.name}" failed after multiple attempts.`,
        link: `/dashboard/datasets/${String(dataset._id)}`,
        type: "error",
      });
    }
    await writeAudit({
      orgId: String(job.orgId),
      action: "analysis.failed",
      actorType: "system",
      resourceType: "dataset",
      resourceId: String(dataset._id),
      metadata: { jobId: String(job._id), error: message.slice(0, 300), outcome },
    });
    logger.error("Job errored", { jobId: String(job._id), error: message, service: "worker" });
  }
}

async function main(): Promise<void> {
  logger.info("Worker starting", { service: "worker", workerId: WORKER_ID });
  await connectDB();
  logger.info("Worker connected to DB; polling for jobs", { service: "worker", workerId: WORKER_ID });

  while (!stopping) {
    try {
      const job = await claimNextJob(WORKER_ID);
      if (!job) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      logger.info("Job claimed", { jobId: String(job._id), attempt: job.attempts, service: "worker" });
      // Process sequentially — one heavy analytics job per worker process.
      await processJob(String(job._id));
    } catch (err) {
      logger.error("Worker loop error", { error: String(err), service: "worker" });
      await sleep(5000);
    }
  }

  logger.info("Worker shutting down", { service: "worker", workerId: WORKER_ID });
  await mongoose.disconnect().catch(() => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

main().catch((err) => {
  logger.error("Fatal worker error", { error: String(err), service: "worker" });
  process.exit(1);
});

// Re-export env to guarantee fail-fast on boot.
void getEnv();
