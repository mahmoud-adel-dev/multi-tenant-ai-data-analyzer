/**
 * Public REST API — GET /api/v1/datasets/{datasetId}/analysis
 * Returns the verified analysis contract for a dataset (org-scoped).
 */
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import { AnalysisRun, ApiKey, Dataset } from "@/models";
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
  { params }: { params: Promise<{ datasetId: string }> }
): Promise<Response> {
  try {
    const { datasetId } = await params;
    const orgId = await authenticate(_request);
    if (!orgId) throw new AppError("UNAUTHENTICATED", "Invalid or expired API key.");

    await connectDB();
    const dataset = await Dataset.findOne({ _id: datasetId, orgId, deletedAt: null }).lean<{
      _id: unknown; latestAnalysisRunId: unknown;
    } | null>();
    if (!dataset) throw new AppError("NOT_FOUND", "Dataset not found.");
    if (!dataset.latestAnalysisRunId) {
      throw new AppError("NOT_FOUND", "No completed analysis yet. Poll the job status endpoint first.");
    }

    const run = await AnalysisRun.findOne({ _id: String(dataset.latestAnalysisRunId), orgId }).lean<{
      _id: unknown; engineVersion: string; payload: Record<string, unknown>; createdAt: Date;
    } | null>();
    if (!run) throw new AppError("NOT_FOUND", "Analysis run not found.");

    return apiSuccess({
      analysisRunId: String(run._id),
      engineVersion: run.engineVersion,
      createdAt: run.createdAt.toISOString(),
      result: run.payload,
    });
  } catch (error) {
    return apiErrorFromUnknown(error);
  }
}
