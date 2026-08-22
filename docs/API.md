# REST API (v1)

Base URL: `https://<host>/api/v1` — Bearer auth with org API keys
(`Authorization: Bearer sk-…`). Create keys in Dashboard → API Keys.

## Envelopes

```json
{ "success": true, "data": { } }
```
```json
{ "success": false, "error": { "code": "QUOTA_EXCEEDED", "message": "..." } }
```

Error codes map to proper HTTP status (401/402/403/404/409/413/415/429/5xx).

## Endpoints

### POST /analyze — submit a dataset

Multipart (`file=@data.csv`) or JSON `{ "data": "<base64>", "filename": "..." }`.
Optional `Idempotency-Key` header makes retries safe.

`202 Accepted`:
```json
{ "success": true, "data": {
  "jobId": "...", "datasetId": "...", "status": "queued",
  "statusUrl": "/api/v1/jobs/...", "links": { "analysis": "/api/v1/datasets/.../analysis" }
}}
```

Errors: 401 invalid key · 413 too large · 415 unsupported type · 402 quota ·
429 rate limited (with `Retry-After`).

### GET /jobs/{jobId}

Progress + state machine:
`created → queued → parsing → profiling → analyzing → generating_dashboard →
generating_report → completed | failed | cancelled`.

Terminal `completed` payloads include `resultRefs.{analysisRunId,dashboardId,reportId}`.

### GET /datasets/{datasetId}/analysis

The full **Analysis Result Contract**: profile (per-column stats + quality
score), domain inference, provenance-tagged metrics, trends, anomalies,
correlations, forecasts, segments, dashboard plan, report plan, warnings,
execution stats. This payload is the machine-readable source of truth — every
metric embeds its aggregation and source columns.

## Rate limits & quotas

- Per-key requests-per-minute limit (default 30) — 429 + Retry-After.
- Plan quotas: monthly jobs, storage bytes, upload size — 402 when exceeded.
- Idempotency keys prevent duplicate jobs on network retries.
