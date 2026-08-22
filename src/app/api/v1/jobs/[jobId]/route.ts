/**
 * Public REST API — GET /api/v1/jobs/{jobId}
 * Org-scoped job status for API clients polling analysis progress.
 */
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import { AnalysisJob, ApiKey, Dataset } from "@/models";
import type { IApiKey } from "@/models";
import { apiSuccess, apiErrorFromUnknown, preflightResponse } from "@/lib/http";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";

async function authenticate(request: NextRequest): Promise<string | null> {
  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const submittedKey = header.slice(7).trim();
  const keyPrefix = submittedKey.slice(0, 8);
  await connectDB();

  const candidates = await ApiKey.find({ keyPrefix, status: "active" })
    .select("+keyHash")
    .lean<IApiKey[]>();
  for (const candidate of candidates) {
    if (await bcrypt.compare(submittedKey, candidate.keyHash)) {
      return String(candidate.orgId);
    }
  }
  return null;
}

export async function OPTIONS(): Promise<Response> {
  return preflightResponse();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  try {
    const { jobId } = await params;
    const orgId = await authenticate(_request);
    if (!orgId) throw new AppError("UNAUTHENTICATED", "Invalid or expired API key.");

    await connectDB();
    const job = await AnalysisJob.findOne({ _id: jobId, orgId })
      .populate<{ datasetId: { name?: string } | unknown }>("datasetId")
      .lean<{
        _id: unknown; datasetId: unknown; status: string; stage: string; progress: number;
        attempts: number; maxAttempts: number; error: { code: string; message: string } | null;
        resultRefs: { analysisRunId: unknown; dashboardId: unknown; reportId: unknown };
        timings: { startedAt: Date | null; completedAt: Date | null; durationMs: number | null };
        createdAt: Date;
      } | null>();
    if (!job) throw new AppError("NOT_FOUND", "Job not found.");

    let datasetName: string | null = null;
    const ds = await Dataset.findById(job.datasetId).lean<{ name: string } | null>();
    datasetName = ds?.name ?? null;

    return apiSuccess({
      jobId: String(job._id),
      datasetId: String(job.datasetId),
      datasetName,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      error: job.error,
      resultRefs: {
        analysisRunId: job.resultRefs?.analysisRunId ? String(job.resultRefs.analysisRunId) : null,
        dashboardId: job.resultRefs?.dashboardId ? String(job.resultRefs.dashboardId) : null,
        reportId: job.resultRefs?.reportId ? String(job.resultRefs.reportId) : null,
      },
      timings: {
        startedAt: job.timings?.startedAt ? new Date(job.timings.startedAt).toISOString() : null,
        completedAt: job.timings?.completedAt ? new Date(job.timings.completedAt).toISOString() : null,
        durationMs: job.timings?.durationMs ?? null,
      },
      createdAt: job.createdAt.toISOString(),
    });
  } catch (error) {
    return apiErrorFromUnknown(error);
  }
}
