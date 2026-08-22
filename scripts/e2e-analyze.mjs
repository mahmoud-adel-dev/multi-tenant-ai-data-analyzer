/**
 * End-to-end driver: uploads a file to /api/v1/analyze and polls the job to a
 * terminal state, printing pipeline stage transitions with timings.
 *
 * Usage: node scripts/e2e-analyze.mjs <file> <apiKey> [baseUrl]
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const [file, apiKey] = process.argv.slice(2);
const baseUrl = (process.argv[4] ?? process.argv[3] ?? "http://localhost:3001").replace(/\/$/, "");
if (!file || !apiKey) {
  console.error("Usage: node scripts/e2e-analyze.mjs <file> <apiKey> [baseUrl]");
  process.exit(1);
}

const buffer = readFileSync(file);
console.log(`Uploading ${basename(file)} (${(buffer.length / 1024 / 1024).toFixed(1)} MB) to ${baseUrl}…`);
const uploadStarted = Date.now();

const form = new FormData();
form.append("file", new Blob([buffer]), basename(file));

const uploadRes = await fetch(`${baseUrl}/api/v1/analyze`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}` },
  body: form,
});
const uploadBody = await uploadRes.json();
if (!uploadRes.ok || !uploadBody.success) {
  console.error(`Upload failed HTTP ${uploadRes.status}:`, JSON.stringify(uploadBody));
  process.exit(1);
}
const { jobId, datasetId } = uploadBody.data;
console.log(`Accepted in ${((Date.now() - uploadStarted) / 1000).toFixed(1)}s — jobId=${jobId} datasetId=${datasetId}`);

let lastStage = "";
let lastPct = -1;
const pollStarted = Date.now();
const terminal = new Set(["completed", "failed", "cancelled"]);

for (;;) {
  await new Promise((r) => setTimeout(r, 2500));
  let body;
  try {
    const res = await fetch(`${baseUrl}/api/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    body = await res.json();
    if (!res.ok || !body.success) {
      console.error(`Status fetch failed HTTP ${res.status}:`, JSON.stringify(body));
      process.exit(1);
    }
  } catch (err) {
    if (Date.now() - pollStarted > 15 * 60_000) {
      console.error("Polling timed out:", String(err));
      process.exit(1);
    }
    continue;
  }

  const job = body.data;
  if (job.stage !== lastStage || job.progress !== lastPct) {
    const elapsed = ((Date.now() - pollStarted) / 1000).toFixed(0);
    lastStage = job.stage;
    lastPct = job.progress;
    console.log(`[+${elapsed}s] ${job.status} · ${job.stage} · ${job.progress}%`);
  }

  if (terminal.has(job.status)) {
    const totalSec = ((Date.now() - pollStarted) / 1000).toFixed(1);
    if (job.status === "completed") {
      console.log(`COMPLETED in ${totalSec}s — analysisRun=${job.resultRefs.analysisRunId} dashboard=${job.resultRefs.dashboardId} report=${job.resultRefs.reportId}`);
      process.exit(0);
    }
    console.error(`JOB ${job.status.toUpperCase()} after ${totalSec}s:`);
    console.error(JSON.stringify(job.error, null, 2));
    process.exit(2);
  }
}
