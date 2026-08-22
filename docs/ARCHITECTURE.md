# Architecture

## Overview

The platform is split into a **control plane** (Next.js web/API + worker
orchestrator) and a **compute plane** (Python analytics service). The core
invariant:

> **Python computes. AI explains.**

No LLM ever produces or alters an analytical number. The LLM only narrates over
verified, provenance-tagged results — and its output is schema-validated and
clearly labeled as narrative.

```
                    ┌─────────────────────────────┐
                    │      Next.js (web/API)      │
                    │  UI · SaaS API · Auth/RBAC  │
                    └──────────────┬──────────────┘
                                   │
                     server actions / REST /v1 (202)
                                   ▼
                       ┌───────────────────────┐
                       │  AnalysisJob queue    │   MongoDB atomic-claim queue
                       │  (claim/retry/stall)  │   (direct Mongo lease queue)
                       └──────────┬────────────┘
                                  │ claims
                                  ▼
                    ┌─────────────────────────────┐
                    │   Worker (node dist-worker) │
                    │ orchestrates + validates    │
                    └──────────────┬──────────────┘
                                   │ multipart POST
                                   ▼
                    ┌─────────────────────────────┐
                    │  Python analytics service   │
                    │ FastAPI·Polars·SciPy·sklearn│
                    └──────────────┬──────────────┘
                                   │ Analysis Result Contract
                                   ▼
                 validate (Zod) → persist AnalysisRun/Dashboard/Report
                                   │
                    optional AI narrative over verified results
                                   │
                                   ▼
                      notify user · audit log · meter usage

Storage:   S3/R2/MinIO (originals) via StorageProvider abstraction
Metadata:  MongoDB (datasets, runs, dashboards, reports, billing, audit)
Redis:     optional distributed rate limiting
```

## Request flows

### Upload → analysis (dashboard)

1. `uploadDataset` action: auth (`requireOrgRole("analyst")`) → file validation
   (magic bytes/limits/sanitization) → **atomic quota reservation** → object
   storage put → `Dataset` + `AnalysisJob(QUEUED)` rows → returns job ID.
2. Worker claims the job (atomic `findOneAndUpdate`, stalled-lock reclaim),
   loads the original from storage and sends it to the Python service. The
   current path materializes the file in memory; bounded streaming is planned.
3. Python parses (guarded), profiles, computes KPIs/trends/correlations/
   outliers/segments/forecasts and plans dashboard + report deterministically.
4. Worker Zod-validates the contract, persists results, meters usage,
   optionally generates the AI narrative (validated; failure tolerated),
   notifies the uploader, writes audit events.

### Public API

`POST /api/v1/analyze` is async by design: it stores the file, enqueues the job
(idempotency-key aware) and returns **202** with polling URLs. Results are read
via `/api/v1/jobs/{id}` and `/api/v1/datasets/{id}/analysis`.

## Key modules

| Path | Responsibility |
|---|---|
| `src/lib/env.ts` | Fail-fast environment validation (Zod) |
| `src/lib/auth/dal.ts` | The ONLY tenant data gate: fresh DB-verified user + org membership + role per request |
| `src/lib/files/validation.ts` | Magic-byte sniffing, sanitization, size ceilings |
| `src/lib/storage/*` | StorageProvider (local FS + S3/R2/MinIO) |
| `src/lib/jobs/queue.ts` | Atomic-claim queue, retries with backoff, stall reclaim |
| `src/lib/analytics/client.ts` | Control→compute HTTP client |
| `src/lib/ai/client.ts` | Provider-agnostic LLM client w/ retries + injection guards |
| `src/lib/ai/narrative.ts` | Narrative generation over verified results only |
| `src/lib/ai/analytics-schema.ts` | Zod contract gate for engine output |
| `analytics-service/app/*` | Deterministic compute plane (see docs/PYTHON_ANALYTICS_ENGINE.md) |

## Multi-tenancy

`Organization` is the tenant boundary. Every org-scoped query includes `orgId`
resolved through a DB-verified membership — see `docs/MULTI_TENANCY.md`.

## Decisions & tradeoffs

- **Mongo-backed queue** instead of Redis/BullMQ by default: it provides atomic
  claims, retries, and stall detection with at-least-once delivery. A formal
  queue port and any broker migration are future work documented in
  `docs/FUTURE_ARCHITECTURE.md`.
- **JWT sessions** carry identity only; authorization always re-reads the DB,
  eliminating stale-role risk without a session revocation infrastructure.
- **Print-to-PDF** reports instead of bundling headless Chrome; server-side PDF
  rendering is a documented upgrade path.
