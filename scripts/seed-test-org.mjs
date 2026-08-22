/**
 * Seeds a test organization + API key for end-to-end API testing.
 * Prints the plaintext API key exactly once.
 *
 * Usage: node --env-file-if-exists=.env.local scripts/seed-test-org.mjs
 */
import mongoose from "mongoose";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI missing.");
  process.exit(1);
}

await mongoose.connect(uri);
console.log("Connected.");

const db = mongoose.connection.db;
const ORG_NAME = "E2E Test Org";

let org = await db.collection("organizations").findOne({ name: ORG_NAME });
if (!org) {
  const inserted = await db.collection("organizations").insertOne({
    name: ORG_NAME,
    ownerId: new mongoose.Types.ObjectId(),
    status: "active",
    membershipVersion: 0,
    maxMembers: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  org = { _id: inserted.insertedId };
  console.log("Created organization", String(org._id));
} else {
  console.log("Reusing organization", String(org._id));
}

const existing = await db.collection("apikeys").findOne({ orgId: org._id, name: "e2e-runner", status: "active" });
if (existing) {
  await db.collection("apikeys").deleteOne({ _id: existing._id });
}

// Plan quota headroom for the stress test: attach a generous plan if absent.
const plans = db.collection("plans");
if (!(await plans.findOne({ key: "e2e" }))) {
  await plans.insertOne({
    key: "e2e",
    name: "E2E Test Plan",
    monthlyPriceCents: 0,
    currency: "usd",
    limits: {
      maxUploadBytes: 250 * 1024 * 1024,
      maxRowsPerDataset: 5_000_000,
      maxJobsPerMonth: 1000,
      maxStorageBytes: 5 * 1024 * 1024 * 1024,
      maxApiKeys: 10,
      maxMembers: 10,
      aiNarrativeEnabled: false,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log('Created plan "e2e".');
}
await db.collection("subscriptions").updateOne(
  { orgId: org._id },
  { $set: { orgId: org._id, planKey: "e2e", status: "active", createdAt: new Date(), updatedAt: new Date() } },
  { upsert: true }
);

const rawKey = `aidl_${crypto.randomBytes(24).toString("hex")}`;
await db.collection("apikeys").insertOne({
  orgId: org._id,
  createdByUserId: null,
  name: "e2e-runner",
  keyPrefix: rawKey.slice(0, 8),
  keyHash: await bcrypt.hash(rawKey, 10),
  status: "active",
  rateLimitPerMinute: 120,
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  requestCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
});

console.log("ORG_ID=" + String(org._id));
console.log("API_KEY=" + rawKey);

await mongoose.disconnect();
