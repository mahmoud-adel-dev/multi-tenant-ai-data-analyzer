import { requireOrg } from "@/lib/auth/dal";

export const metadata = { title: "API Documentation" };

export default async function DocsPage() {
  await requireOrg();

  return (
    <div style={{ maxWidth: "860px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "6px" }}>REST API</h1>
      <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "26px" }}>
        Submit datasets for analysis and retrieve verified results programmatically.
        All requests use your API key via <code>Authorization: Bearer sk-…</code>.
      </p>

      <Endpoint
        method="POST"
        path="/api/v1/analyze"
        desc="Submit a dataset for full analysis. Returns 202 with job + dataset IDs."
      >
        <CodeBlock>{`# multipart upload
curl -X POST https://your-host/api/v1/analyze \\
  -H "Authorization: Bearer sk-YOUR_KEY" \\
  -F "file=@sales_q3.csv"

# or JSON with base64 data
curl -X POST https://your-host/api/v1/analyze \\
  -H "Authorization: Bearer sk-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: my-upload-001" \\
  -d '{"data":"'$(base64 -w0 sales_q3.csv)'","filename":"sales_q3.csv"}'

# → { "success": true, "data": { "jobId": "...", "datasetId": "...", "status": "queued", "statusUrl": "/api/v1/jobs/..." } }`}</CodeBlock>
      </Endpoint>

      <Endpoint method="GET" path="/api/v1/jobs/{jobId}" desc="Poll job progress until status is completed (or failed).">
        <CodeBlock>{`curl https://your-host/api/v1/jobs/JOB_ID \\
  -H "Authorization: Bearer sk-YOUR_KEY"

# → { "success": true, "data": { "status": "completed", "progress": 100, "resultRefs": { "analysisRunId": "...", ... } } }`}</CodeBlock>
      </Endpoint>

      <Endpoint method="GET" path="/api/v1/datasets/{datasetId}/analysis" desc="Fetch the complete verified analysis contract: profile, KPIs with provenance, trends, anomalies, correlations, forecasts, segments, dashboard plan, report plan.">
        <CodeBlock>{`curl https://your-host/api/v1/datasets/DATASET_ID/analysis \\
  -H "Authorization: Bearer sk-YOUR_KEY"

# → { "success": true, "data": { "analysisRunId": "...", "engineVersion": "...", "result": {
#       "profile": {...}, "metrics": [{ "metricId": "total_revenue", "value": ..., "provenance": {...} }],
#       "dashboardPlan": {...}, "reportPlan": {...}, ... } } }`}</CodeBlock>
      </Endpoint>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "14px", padding: "20px", marginTop: "8px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "10px" }}>Notes</h2>
        <ul style={{ paddingLeft: "18px", fontSize: "13.5px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "5px", lineHeight: 1.6 }}>
          <li>Supported formats: CSV, TSV, XLSX, XLS, JSON. Limits depend on your plan.</li>
          <li>Analysis runs asynchronously; poll the job endpoint. Retries with backoff are automatic.</li>
          <li>Send an <code>Idempotency-Key</code> header on retries to prevent duplicate jobs.</li>
          <li>All numbers in results are computed by our deterministic engine — provenance is attached to every metric.</li>
          <li>Error envelope: <code>{`{ "success": false, "error": { "code": "QUOTA_EXCEEDED", "message": "..." } }`}</code>.</li>
        </ul>
      </div>
    </div>
  );
}

function Endpoint({ method, path, desc, children }: { method: string; path: string; desc: string; children?: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", fontWeight: 800, padding: "4px 9px", borderRadius: "6px", background: "var(--accent-light)", color: "var(--accent-primary)", letterSpacing: "0.05em" }}>
          {method}
        </span>
        <code style={{ fontSize: "14px", fontWeight: 700 }}>{path}</code>
      </div>
      <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", margin: "8px 0 12px" }}>{desc}</p>
      {children}
    </section>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "10px",
        padding: "16px",
        overflowX: "auto",
        fontSize: "12px",
        lineHeight: 1.55,
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </pre>
  );
}
