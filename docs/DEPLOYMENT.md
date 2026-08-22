# Deployment Guide

## Environments

- **Local:** use `npm run dev:all` for the verified web/worker/analytics
  workflow, with MongoDB configured separately. The Compose topology is a
  reference pending the validation items in `docs/DOCKER.md`.
- **Staging:** compose production file or your orchestrator, managed MongoDB,
  real S3 bucket, Stripe test mode when integrated.
- **Production:** same topology; see docs/PRODUCTION_RUNBOOK.md.

## First deploy

1. Provision MongoDB Atlas (M10+), S3/R2 bucket, Redis (optional).
2. Create DNS + TLS.
3. Set environment variables from `.env.example`; generate:
   ```bash
   openssl rand -base64 32   # NEXTAUTH_SECRET
   openssl rand -hex 32      # APP_ENCRYPTION_KEY
   ```
4. Build & push images via CI (web, worker, analytics).
5. Deploy analytics first → verify `/healthz`, then workers, then web.
6. Register the first account; it becomes an organization owner. Grant a
   platform admin by flipping `role` on the user document
   (`platform_admin`) — there is intentionally no self-serve path.
7. Configure an AI model in Admin → Models (Test connection → Activate).
8. Smoke test: upload CSV → watch job complete → open dashboard/report.

## CI/CD

GitHub Actions runs on every PR: web lint/typecheck/test/build, python
lint/test, integration suite against MongoDB, dependency audits, and Docker
image builds. Deployment itself is manual/promoted — no auto-deploy is
configured by default.

## Post-deploy verification

- `/api/ready` returns `ready`
- Upload→analyze round-trip completes end-to-end
- Audit log records events (Admin → Audit)
- Failed-job alerting wired to your monitoring
