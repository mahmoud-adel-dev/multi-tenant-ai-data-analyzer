# AIDL Platform — Multi-Tenant AI Data Analytics SaaS

Upload your business data and receive a **trustworthy, professional dashboard
and executive report** — without SQL, Python, Power BI, or a data analyst.

> **Python computes. AI explains.**
> Every number is produced by a deterministic analytics engine (Polars · SciPy ·
> scikit-learn) with full provenance. The LLM only narrates over verified
> results — and its output is schema-validated and clearly labeled.

## Product capabilities

- **Organizations & RBAC** — owner / admin / analyst / member / viewer, one-time invitations
- **Secure ingestion** — CSV · TSV · XLSX · JSON; magic-byte validation, plan-based size caps, zip-bomb guards
- **Async pipeline** — atomic-claim job queue with retries/backoff and live progress UI
- **Deterministic analysis** — profiling + quality scoring, domain inference (sales/ecommerce/finance/HR/CRM…), provenance-tagged KPIs, trends with seasonality, Pearson/Spearman correlations, IQR/robust-z/Isolation-Forest outliers, RFM & guarded k-means segmentation, holdout-validated forecasting (withheld when data doesn't justify it)
- **Auto dashboard** — deterministic chart-selection rules rendered with ECharts; every widget explains why it was chosen
- **Executive report** — 14 section types from verified numbers; print-to-PDF export; optional AI narrative clearly labeled
- **Ask-AI Q&A** — grounded strictly in the dataset's verified results
- **SaaS platform** — plans/subscriptions, concurrency-safe usage quotas, hashed API keys w/ expiry + rate limits, append-only audit log
- **Public REST API** — async analyze + polling + full result contract, idempotency keys

## Quick start (local)

```bash
cp .env.example .env.local          # then set NEXTAUTH_SECRET & APP_ENCRYPTION_KEY:
#   openssl rand -base64 32         # NEXTAUTH_SECRET
#   openssl rand -hex 32            # APP_ENCRYPTION_KEY

docker compose up --build           # full stack: web :3000, analytics :8000, mongo/redis/minio

# or bare-metal dev:
npm install && npm run dev          # web on :3000
cd analytics-service && pip install -e ".[dev]" && uvicorn app.main:app --port 8000
npm run build:worker && npm run worker   # background processor (separate terminal)

# or manage all three development processes with PM2:
# Python 3.12+ and analytics-service/.venv must be prepared once.
npm run dev:all                     # web :3001 + worker + analytics :8000
npm run dev:all:logs                # combined logs
npm run dev:all:stop                # stop all AIDL processes
```

Register at `/register` — you get a personal organization instantly.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run typecheck` | strict TS check |
| `npm run lint` | ESLint |
| `npm test` | Vitest suites (DB-gated isolation suite auto-runs when Mongo present) |
| `npm run build:worker` / `worker` | build/run the queue worker |
| `npm run dev:all` | build and run web + worker + analytics under PM2 |
| `npm run dev:all:status` / `dev:all:logs` / `dev:all:stop` | manage the PM2 development stack |
| `pytest` (in `analytics-service`) | Python engine tests |

## Architecture

```
Next.js (control plane) ──► Mongo-backed job queue ──► Worker orchestrator
                                                        │
                                        Python analytics service (compute plane)
                                                        │
                              Verified contract → Dashboard + Report → optional AI narrative
```

Full details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY.md) ·
[Multi-tenancy](docs/MULTI_TENANCY.md) · [Authorization](docs/AUTHORIZATION.md) ·
[Billing](docs/BILLING.md) · [API](docs/API.md) ·
[Data pipeline](docs/DATA_PIPELINE.md) · [Python engine](docs/PYTHON_ANALYTICS_ENGINE.md) ·
[Dashboard engine](docs/DASHBOARD_ENGINE.md) · [Report engine](docs/REPORT_ENGINE.md) ·
[Testing](docs/TESTING.md) · [Docker](docs/DOCKER.md) · [Deployment](docs/DEPLOYMENT.md) ·
[Backup/Restore](docs/BACKUP_RESTORE.md) · [Runbook](docs/PRODUCTION_RUNBOOK.md) ·
[Audit](docs/PRODUCTION_AUDIT.md) · [Feature matrix](docs/FEATURE_MATRIX.md)

## Honest status

See [`docs/PRODUCTION_TRANSFORMATION_REPORT.md`](docs/PRODUCTION_TRANSFORMATION_REPORT.md)
for the verified checklist. Notably: PDF/OCR extraction is **disabled** until a
real engine exists (no fabricated content), Stripe checkout requires provider
credentials, and Docker image builds require a Docker-enabled CI run.
