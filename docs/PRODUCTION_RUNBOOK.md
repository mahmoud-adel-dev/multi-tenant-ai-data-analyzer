# Production Runbook

## Service map

| Component | Runs | Critical env |
|---|---|---|
| Web (Next.js) | 1+ replicas behind TLS proxy | MONGODB_URI, NEXTAUTH_SECRET, NEXTAUTH_URL, APP_ENCRYPTION_KEY, STORAGE_* |
| Worker | N replicas (horizontally scalable) | + ANALYTICS_SERVICE_URL, ANALYTICS_API_TOKEN |
| Analytics (Python) | 1+ internal replicas | ANALYTICS_API_TOKEN |
| MongoDB | managed | — |
| Object storage | S3/R2/MinIO | S3_* |

## Health & monitoring

- `GET /api/health` — liveness (always cheap).
- `GET /api/ready` — DB ping + storage check (+ analytics reachability info).
- Structured JSON logs (`ts, level, service, msg, requestId/jobId/orgId`) —
  ship stdout to your log pipeline. `LOG_LEVEL=info` default.
- Key metrics to alert on: job queue depth (`AnalysisJob.countDocuments({
  status:"queued" })`), jobs failed/hour, analytics service healthz failures,
  `/api/ready` non-200s, AI provider error rate.

## Common operations

### A job is stuck "analyzing"

1. Check worker logs for the jobId.
2. Stalled locks auto-requeue after 10 min without heartbeat; verify worker
   liveness if nothing moves.
3. Manual requeue:
   `db.analysisjobs.updateOne({_id: ObjectId("…")},{$set:{status:"queued",lockedBy:null,lockedAt:null}})`

### Analysis service unreachable

Workers keep retrying with capped backoff; jobs return to QUEUED and wait.
Fix the service, workers resume automatically.

### AI provider failing

Analyses still complete; only narratives are skipped (logged as warnings).
Fix/reconfigure in Admin → Models; use "Test connection" before activating.

### Quota complaints

Usage counters: `db.usagecounters.find({orgId:…})`. Ledger history:
`usagelogger` entries by org. Adjust plan via Billing page (manual mode).

### Rotate APP_ENCRYPTION_KEY

1. Deploy with new key + old key present (dual-read support is a follow-up;
   today: re-save provider API keys via Admin → Models after rotation).
2. Re-enter provider keys, then retire the old key.

## Data deletion requests

Dataset delete (UI or action) tombstones + removes stored objects + releases
quota + audits. For full-org erasure: delete datasets first, then members,
then the organization document set (scripted follow-up recommended).

## Escalation

- DB down → pages fail closed with typed 5xx; restore per BACKUP_RESTORE.md.
- Storage driver failure → uploads fail fast; existing analyses unaffected
  unless originals were pruned (reconciliation script pending).
