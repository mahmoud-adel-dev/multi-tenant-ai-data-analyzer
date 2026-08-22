# Docker and Deployment Containers

## Images

| Image | Dockerfile | Intended role |
|---|---|---|
| Web | `Dockerfile` | Next.js standalone runtime, non-root UID, `/api/health` check |
| Worker | `Dockerfile.worker` | Bundled queue consumer, non-root runtime |
| Analytics | `analytics-service/Dockerfile` | Python 3.12 FastAPI compute service |

Secrets must be injected at runtime; they must never be copied into an image or
committed to the repository.

## Verification status

The verified local workflow is `npm run dev:all` after configuring
`.env.local`, MongoDB, and the Python virtual environment.

The Dockerfiles and Compose definitions currently document the intended
topology, but are **reference artifacts**, not a verified one-command local
path. Before advertising `docker compose up --build`, complete and test:

1. align the web Dockerfile copy paths with Next.js's current `.next`
   standalone output;
2. pass `ANALYTICS_SERVICE_URL=http://analytics:8000` to the web container;
3. add an idempotent MinIO bucket initializer for `aidl-dev`;
4. define one documented environment-file workflow for Compose interpolation;
5. execute health, upload, worker, and result smoke tests against the built
   containers.

## Secret generation

```bash
openssl rand -base64 32   # NEXTAUTH_SECRET
openssl rand -hex 32      # APP_ENCRYPTION_KEY
```

Development MinIO credentials in `docker-compose.yml` are local defaults only;
do not reuse them outside an isolated development machine.

## Production reference

`docker-compose.production.yml` describes the logical topology: web, one or
more workers, an internal analytics service, and managed MongoDB, object
storage, and optional Redis.

Mongo job claims prevent two workers from holding the same active lease at the
same moment, but delivery remains **at-least-once**. Stalled locks are reclaimed
and work may replay after a crash. Do not scale worker replicas aggressively
until result persistence, usage, audit, and notification side effects are fully
idempotent; see [Future Architecture](FUTURE_ARCHITECTURE.md).

## Deployment checklist

1. Provision MongoDB, an S3-compatible bucket, and optional Redis.
2. Generate runtime secrets from `.env.example`; production requires
   `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and `APP_ENCRYPTION_KEY`.
3. Point `ANALYTICS_SERVICE_URL` at the private analytics endpoint and configure
   `ANALYTICS_API_TOKEN` for service-to-service authentication.
4. Use unique storage credentials and create the bucket before readiness
   checks run.
5. Terminate TLS at the ingress or reverse proxy.
6. Build the images in CI and scan them before promotion.
7. Verify `/api/health`, `/api/ready`, `/healthz`, upload, job processing, and
   result retrieval in the target environment.
8. Record rollback steps and a tested backup/restore procedure.

Until the verification items above are green, use `npm run build && npm run
start` for the web release path and run the worker and analytics service with
their documented runtime commands.
