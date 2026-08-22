/**
 * Tenant isolation tests — prove that org-scoped queries cannot leak data
 * across tenants. These exercise the query patterns used by the DAL and all
 * server actions against a real MongoDB.
 *
 * Runs automatically when a MongoDB is reachable at TEST_MONGODB_URI
 * (default localhost:27017); otherwise it skips itself quickly.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const MONGO_URI = process.env.TEST_MONGODB_URI ?? "mongodb://localhost:27017/aidl-isolation-test";

/** Fast probe so CI/dev machines without MongoDB skip cleanly. */
async function probeMongo(): Promise<boolean> {
  try {
    const mongoose = (await import("mongoose")).default;
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 1500,
      connectTimeoutMS: 1500,
    });
    return true;
  } catch {
    return false;
  }
}

const canRun = await probeMongo();

beforeAll(async () => {
  if (!canRun) return;
  process.env.MONGODB_URI = MONGO_URI;
  process.env.NEXTAUTH_SECRET = "0123456789abcdef0123456789abcdef";
}, 20_000);

afterAll(async () => {
  if (!canRun) return;
  const mongoose = (await import("mongoose")).default;
  try {
    await mongoose.connection.dropDatabase();
  } finally {
    await mongoose.disconnect();
  }
}, 20_000);

describe.skipIf(!canRun)("tenant isolation", () => {
  it("org A cannot read org B's datasets, jobs, dashboards, reports or analyses", async () => {
    const { Dataset, AnalysisJob, AnalysisRun, Dashboard, Report } = await import("@/models");
    const { Types } = await import("mongoose");

    const orgA = new Types.ObjectId();
    const orgB = new Types.ObjectId();

    const datasetB = await Dataset.create({
      orgId: orgB,
      name: "B-private",
      originalFilename: "b.csv",
      sanitizedFilename: "b.csv",
      pipelineType: "tabular_data",
      fileType: "csv",
      sizeBytes: 100,
      checksumSha256: "x",
      originalStorageKey: "orgs/B/datasets/x/original/b.csv",
      status: "ready",
    });

    const run = await AnalysisRun.create({
      orgId: orgB,
      datasetId: datasetB._id,
      jobId: new Types.ObjectId(),
      engineVersion: "t",
      payload: {},
    });
    const dash = await Dashboard.create({
      orgId: orgB,
      datasetId: datasetB._id,
      analysisRunId: run._id,
      title: "T",
      plan: { title: "T", pages: [] },
      engineVersion: "t",
    });
    const rep = await Report.create({
      orgId: orgB,
      datasetId: datasetB._id,
      analysisRunId: run._id,
      title: "T",
      plan: { title: "T", sections: [] },
      engineVersion: "t",
    });
    const job = await AnalysisJob.create({ orgId: orgB, datasetId: datasetB._id, status: "queued" });

    // ── Queries exactly as the server actions issue them, scoped to orgA ──
    expect(await Dataset.findOne({ _id: datasetB._id, orgId: orgA })).toBeNull();
    expect(await AnalysisJob.findOne({ _id: job._id, orgId: orgA })).toBeNull();
    expect(await AnalysisRun.findOne({ _id: run._id, orgId: orgA })).toBeNull();
    expect(await Dashboard.findOne({ _id: dash._id, orgId: orgA })).toBeNull();
    expect(await Report.findOne({ _id: rep._id, orgId: orgA })).toBeNull();

    // List queries are equally scoped.
    expect(await Dataset.find({ orgId: orgA }).countDocuments()).toBe(0);
    expect(await AnalysisJob.find({ orgId: orgA }).countDocuments()).toBe(0);

    // The owning tenant CAN see its own data.
    expect(await Dataset.findOne({ _id: datasetB._id, orgId: orgB })).not.toBeNull();
  });

  it("API key auth cannot authenticate another org's key prefix collisions", async () => {
    const bcrypt = await import("bcryptjs");
    const { ApiKey } = await import("@/models");
    const { Types } = await import("mongoose");

    const orgA = new Types.ObjectId();
    const orgB = new Types.ObjectId();

    const keyB = "sk-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    await ApiKey.create({
      orgId: orgB,
      name: "b-key",
      keyPrefix: keyB.slice(0, 8),
      keyHash: await bcrypt.hash(keyB, 4),
      status: "active",
    });

    // Prefix lookup + bcrypt compare — as implemented in the v1 route.
    const candidates = await ApiKey.find({ keyPrefix: "sk-BBBBB" }).select("+keyHash").lean<
      Array<{ orgId: unknown; keyHash: string }>
    >();
    let matchedOrg: string | null = null;
    for (const c of candidates) {
      if (await bcrypt.compare(keyB, c.keyHash)) matchedOrg = String(c.orgId);
    }
    expect(matchedOrg).toBe(String(orgB));
    expect(matchedOrg).not.toBe(String(orgA));

    // A wrong key sharing the prefix must NOT match.
    let wrongMatch = false;
    for (const c of candidates) {
      if (await bcrypt.compare("sk-WRONGKEYWRONGKEYWRONGKEYWRONGKEY12", c.keyHash)) wrongMatch = true;
    }
    expect(wrongMatch).toBe(false);
  });

  it("quota reservation is atomic under concurrency", async () => {
    const { reserveQuota, getUsage } = await import("@/models");
    const { Types } = await import("mongoose");

    const org = new Types.ObjectId();
    const periodKey = "2099-01";
    const limit = 5;

    // 20 concurrent reservations against a limit of 5 → exactly 5 succeed.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => reserveQuota(String(org), "jobs", periodKey, 1, limit))
    );
    const granted = results.filter(Boolean).length;
    expect(granted).toBe(5);
    expect(await getUsage(String(org), "jobs", periodKey)).toBe(5);

    // Release compensates correctly.
    const { releaseQuota } = await import("@/models");
    await releaseQuota(String(org), "jobs", periodKey, 2);
    expect(await getUsage(String(org), "jobs", periodKey)).toBe(3);

    // One more reservation now succeeds.
    expect(await reserveQuota(String(org), "jobs", periodKey, 1, limit)).toBe(true);
  });
});
