/**
 * Edge-case suite: verifies payload hygiene of the completed 100k run and
 * pushes small adversarial datasets through the public API.
 *
 * Usage: node --env-file-if-exists=.env.local scripts/e2e-edge-cases.mjs <apiKey>
 */
import mongoose from "mongoose";
import { readFileSync } from "node:fs";

const apiKey = process.argv[2];
if (!apiKey) {
  console.error("Usage: node scripts/e2e-edge-cases.mjs <apiKey>");
  process.exit(1);
}
const BASE = "http://localhost:3001";

// ── 1. Payload hygiene on the completed stress run ────────────────────────
await mongoose.connect(process.env.MONGODB_URI);
const runs = mongoose.connection.db.collection("analysisruns");
const latest = await runs.find({}, { sort: { createdAt: -1 }, limit: 1 }).toArray();
if (!latest.length) {
  console.error("No analysis runs found.");
  process.exit(1);
}
const payload = latest[0].payload;
let nullLists = 0;
for (const col of payload.profile.columns) {
  if (!Array.isArray(col.topValues)) nullLists += 1;
  if (!Array.isArray(col.histogram)) nullLists += 1;
}
for (const t of payload.trends) {
  if (!Array.isArray(t.movingAverage7)) nullLists += 1;
  if (!Array.isArray(t.movingAverage30)) nullLists += 1;
}
console.log(`[hygiene] columns=${payload.profile.columns.length} rows=${payload.profile.rowCount} quality=${payload.profile.qualityScore}`);
console.log(`[hygiene] non-array list fields in persisted payload: ${nullLists} (expected 0)`);
const withTopValues = payload.profile.columns.filter((c) => c.topValues.length > 0);
console.log(`[hygiene] columns with populated topValues: ${withTopValues.map((c) => c.name).join(", ") || "none"}`);
await mongoose.disconnect();

// ── 2. Adversarial uploads ────────────────────────────────────────────────
async function analyze(name, content) {
  const form = new FormData();
  form.append("file", new Blob([content]), name);
  const res = await fetch(`${BASE}/api/v1/analyze`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const body = await res.json();
  if (!body.success) return { name, outcome: `rejected(${res.status})`, detail: body.error?.code ?? "" };
  for (let i = 0; i < 120; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const sres = await fetch(`${BASE}/api/v1/jobs/${body.data.jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const sbody = await sres.json();
    if (sbody.data.status === "completed") return { name, outcome: "completed", detail: `${sbody.data.progress}%` };
    if (sbody.data.status === "failed") return { name, outcome: "failed", detail: sbody.data.error?.message?.slice(0, 90) ?? "?" };
  }
  return { name, outcome: "timeout", detail: "" };
}

const cases = [
  ["edge-empty.json", JSON.stringify([])],
  ["edge-one-row.csv", "a,b,c\n1,x,true\n"],
  ["edge-all-null-col.json", JSON.stringify([{ a: 1, nothing: null }, { a: 2, nothing: null }, { a: 3, nothing: null }, { a: 4, nothing: null }])],
  ["edge-mixed-types.json", JSON.stringify([{ v: "text" }, { v: "42" }, { v: null }, { v: "3.14" }, { v: "-7" }, { v: "more text" }])],
  ["edge-high-cardinality.json", JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ id: `uniq-${i}`, val: i * 1.5 })))],
  ["edge-negative-zero.json", JSON.stringify([{ x: -0, y: -50000 }, { x: 0, y: 25000 }, { x: 0, y: -12500 }, { x: 0, y: 600000 }])],
  ["edge-bad-dates.csv", "d,v\n2025-13-45,1\nnot-a-date,2\n2024-02-30,3\n2025-01-15,4\n"],
  ["edge-malformed.json", '{"a": 1,, broken'],
  ["edge-nested-deep.json", JSON.stringify([{ meta: { deep: { deeper: [1, 2, 3] } }, ok: true }])],
];

console.log("\n[edge-cases]");
for (const [name, content] of cases) {
  const r = await analyze(name, content);
  console.log(`  ${r.name.padEnd(28)} → ${r.outcome.padEnd(16)} ${r.detail}`.trimEnd());
}
