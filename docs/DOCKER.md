# Docker & Deployment

## Images

| Image | Dockerfile | Notes |
|---|---|---|
| Web | `Dockerfile` | Multi-stage, Next.js standalone output, non-root UID 10001, healthcheck on `/api/health` |
| Worker | `Dockerfile.worker` | esbuild-bundled queue consumer, non-root, scales horizontally |
| Analytics | `analytics-service/Dockerfile` | python:3.12-slim, non-root, healthcheck |

No secrets are baked into images; all configuration is runtime env.

## Local development

```bash
cp .env.example .env.local          # set NEXTAUTH_SECRET + APP_ENCRYPTION_KEY
docker compose up --build           # mongo+redis+minio+analytics+web+worker
# web: http://localhost:3000 · minio console: :9001 (minioadmin/minioadmin)
```

Generate secrets:

```bash
openssl rand -base64 32   # NEXTAUTH_SECRET
openssl rand -hex 32      # APP_ENCRYPTION_KEY
```

## Production reference

`docker-compose.production.yml` documents the topology: web + N workers +
internal analytics service against **managed** MongoDB/S3/Redis. Prefer
MongoDB Atlas, S3/R2 and a managed Redis in real deployments.

Worker scaling is safe by construction — atomic job claims guarantee each job
runs on exactly one worker; stalled locks are reclaimed after 10 minutes.

## Deployment checklist

1. Provision MongoDB (replica set), S3-compatible bucket, Redis (optional).
2. Set env per `.env.example` — `APP_ENCRYPTION_KEY` and `NEXTAUTH_SECRET`
   are mandatory; the app refuses to boot otherwise.
3. Point `ANALYTICS_SERVICE_URL` at the analytics service; set
   `ANALYTICS_API_TOKEN` for service-to-service auth.
4. Terminate TLS at your proxy (HSTS enabled when NODE_ENV=production).
5. Run `npm run build && npm run start` or the compose stack.
6. Verify `/api/ready` returns `ready` before routing traffic.

## Verification status

Docker builds/compose runs require a Docker daemon and were not executed in
the authoring environment — treat image recipes as reviewed-but-unbuilt until
CI's docker job has run green on your infra.
