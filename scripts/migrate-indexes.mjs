import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required.");

await mongoose.connect(uri);

try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection has no active database.");

  const migrations = [
    {
      collection: "analysisjobs",
      name: "idempotencyKey_1",
      key: { idempotencyKey: 1 },
      options: {
        unique: true,
        partialFilterExpression: { idempotencyKey: { $type: "string" } },
      },
    },
    {
      collection: "usageledgers",
      name: "orgId_1_idempotencyKey_1",
      key: { orgId: 1, idempotencyKey: 1 },
      options: {
        unique: true,
        partialFilterExpression: { idempotencyKey: { $type: "string" } },
      },
    },
  ];

  for (const migration of migrations) {
    const collection = db.collection(migration.collection);
    let indexes = [];
    try {
      indexes = await collection.indexes();
    } catch (error) {
      // Fresh databases may not have created the collection yet.
      if (error?.code !== 26) throw error;
    }
    const existing = indexes.find((index) => index.name === migration.name);
    const isCurrent =
      existing?.unique === true &&
      existing.partialFilterExpression?.idempotencyKey?.$type === "string";

    if (!isCurrent) {
      if (existing) await collection.dropIndex(migration.name);
      await collection.createIndex(migration.key, {
        name: migration.name,
        ...migration.options,
      });
    }

    console.log(`Index ready: ${migration.collection}.${migration.name}`);
  }
} finally {
  await mongoose.disconnect();
}
