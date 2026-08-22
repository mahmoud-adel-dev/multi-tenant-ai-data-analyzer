import mongoose from "mongoose";
import { rm } from "node:fs/promises";
import path from "node:path";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required.");

await mongoose.connect(uri);

try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection has no active database.");

  const datasets = await db
    .collection("datasets")
    .find({})
    .project({ originalStorageKey: 1, parquetStorageKey: 1 })
    .toArray();
  let deletedLocalFiles = 0;
  if ((process.env.STORAGE_DRIVER ?? "local") === "local") {
    const root = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_PATH ?? "./storage-data");
    for (const dataset of datasets) {
      for (const key of [dataset.originalStorageKey, dataset.parquetStorageKey]) {
        if (typeof key !== "string" || !key) continue;
        const target = path.resolve(root, key);
        if (!target.startsWith(`${root}${path.sep}`)) {
          throw new Error(`Unsafe storage key outside configured root: ${key}`);
        }
        await rm(target, { force: true });
        deletedLocalFiles += 1;
      }
    }
  }

  const collections = [
    "analysisjobs",
    "analysisruns",
    "dashboards",
    "reports",
    "datasets",
    "usageledgers",
    "usagecounters",
  ];
  const deleted = {};

  for (const name of collections) {
    deleted[name] = (await db.collection(name).deleteMany({})).deletedCount;
  }

  deleted.auditlogs = (
    await db.collection("auditlogs").deleteMany({
      $or: [
        {
          resourceType: {
            $in: ["dataset", "analysis_job", "analysis_run", "dashboard", "report"],
          },
        },
        { action: { $regex: "^(dataset|analysis|report|dashboard)\\." } },
      ],
    })
  ).deletedCount;
  deleted.notifications = (
    await db.collection("notifications").deleteMany({
      link: { $regex: "^/dashboard/datasets/" },
    })
  ).deletedCount;

  console.log(
    JSON.stringify({ database: db.databaseName, deleted, deletedLocalFiles }, null, 2)
  );
} finally {
  await mongoose.disconnect();
}
