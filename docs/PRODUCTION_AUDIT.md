# Production Audit

> Forensic audit of the repository as found on 2026-08-21, before transformation.
> Severity: **P0** critical (blockers) · **P1** high · **P2** medium · **P3** improvement.

## Executive summary

The repository is an early MVP of a multi-tenant "AI data extraction" SaaS built on
Next.js 15 (App Router) + Mongoose/MongoDB + NextAuth v4. It has a working auth flow,
API-key management and an AI-model admin panel — but the core data pipeline is partly
fabricated, synchronous inside HTTP requests, and not production-safe.

Verified headline findings:

1. The dashboard upload page calls `uploadAndProcess()` which returns **hard-coded fake
   AI results** (`mockAIProcess` in `src/actions/upload.ts`).
2. OCR/PDF extraction is a **placeholder returning fabricated invoice text**
   (`src/lib/parsers/ocr-extractor.ts`) that is sent to the LLM as if it were real
   document content.
3. There is **no analytics engine at all** — no profiling, statistics, ML, dashboards or
   reports; everything is LLM free-form JSON.
4. The project does not typecheck (`npx tsc --noEmit` → 5 errors).
5. `npm audit` reports **7 vulnerabilities (2 critical, 4 high)** mostly in `xlsx@0.18.5`.

## Findings

### P0 — Critical

| # | Title | Affected files | Problem | Impact | Fix |
|---|-------|----------------|---------|--------|-----|
| P0-1 | Fake AI processing on main upload flow | `src/actions/upload.ts`, `src/app/(dashboard)/dashboard/upload/UploadClient.tsx` | `mockAIProcess()` sleeps 2s then returns hard-coded "insights" marked COMPLETED | Customers receive fabricated analysis | Deleted; replaced by real async analytics pipeline |
| P0-2 | Fabricated OCR / PDF text | `src/lib/parsers/ocr-extractor.ts`, `src/lib/pipeline.ts` | Returns invented invoice/contract text with `isPlaceholder: true` ignored by callers | LLM "extracts" data from text that never existed; untrustworthy output | PDF/OCR disabled until a real engine exists; image input only via genuine vision models |
| P0-3 | Fallback auth secret | `src/lib/auth/options.ts:77` | `process.env.NEXTAUTH_SECRET \|\| "your-super-secret-key-for-development"` | Forgeable session JWTs in misconfigured prod | Zod env validation, fail-fast startup |
| P0-4 | Provider API keys stored plaintext | `src/models/AiModelConfig.ts:77` | Comment admits "For MVP, we store it as-is" | DB leak exposes cloud provider credentials | AES-256-GCM encryption service + blind-write update semantics |
| P0-5 | Project does not compile | `src/actions/*`, `src/components/admin/AdminSidebar.tsx`, `src/lib/parsers/excel-parser.ts` | DTOs imported from wrong module; missing `SessionPayload`; invalid XLSX option; stray field in DTO mapper | No build/typecheck gate possible | Fixed imports/types; canonical DTO location |
| P0-6 | Critical dependency vulnerabilities | `package.json` (`xlsx@0.18.5`, others) | Prototype pollution + ReDoS in SheetJS (no fix on npm registry) | Untrusted Excel files can corrupt server memory / DoS parser | Upgrade to patched SheetJS distribution; add parse guards |
| P0-7 | Stale-role JWT authorization | `src/lib/auth/options.ts` (jwt callback), `src/middleware.ts` | Role embedded in JWT forever; deactivated users keep access until token expiry | Suspended accounts retain access up to 30d | Server-side refresh of role/status from DB on interval + on sensitive actions |

### P1 — High

| # | Title | Affected files | Problem | Impact |
|---|-------|----------------|---------|--------|
| P1-1 | Synchronous long work in HTTP/server action | `src/actions/data-extraction.ts`, `src/lib/pipeline.ts`, `src/app/api/v1/analyze/route.ts` | Full parse+LLM run inside request; 10MB cap only mitigation | Timeouts, memory blowups, no retry, poor UX |
| P1-2 | Non-atomic quota check-then-increment | `src/actions/data-extraction.ts`, `api/v1/analyze/route.ts` | read → compare → later `$inc` race | N concurrent requests all pass a quota of 1 |
| P1-3 | Single-user tenancy model | `src/models/Tenant.ts`, all queries use `session.userId` as tenantId | No organizations/teams/roles beyond 2 user roles | Not a real multi-tenant product; no RBAC |
| P1-4 | No object storage | uploads held fully in Node Buffers, raw text stored in Mongo | Large datasets OOM the server; Mongo used as blob store | StorageProvider abstraction required |
| P1-5 | No rate limiting anywhere | login, register, upload, `/api/v1/*` | Brute force / abuse possible | Redis-ready limiter added to hot paths |
| P1-6 | Inconsistent API error semantics | `api/v1/analyze` (plain string errors, `success:true` for failed pipelines) | Client cannot distinguish outcomes | Typed error envelope `{code,message}` |
| P1-7 | CORS `Access-Control-Allow-Origin: *` | `api/v1/analyze/route.ts` | Public API open to any origin with Bearer keys (acceptable for API but should be configurable) | Configurable origin allow-list |
| P1-8 | Broken navigation links | `DashboardSidebar.tsx` (`/dashboard/docs`), `AdminSidebar.tsx` (`/admin`, `/admin/tenants`, `/admin/logs`, `/admin/settings`) | Pages do not exist | Implement overview pages or remove links |
| P1-9 | `getActiveModels` selects non-existent field | `src/actions/models.ts` | `provider` not in schema → always undefined | Fixed to `providerType` |
| P1-10 | No tests at all | repo-wide | Nothing prevents regressions | Vitest + pytest suites |
| P1-11 | No audit trail | repo-wide | Security-sensitive actions untraceable | Append-only AuditLog |
| P1-12 | No health/readiness endpoints | repo-wide | Not deployable safely behind orchestrators | `/api/health`, `/api/ready` |
| P1-13 | File trust based on browser MIME type | `data-extraction.ts` MIME map | Spoofable; no magic-byte checks | Magic-byte sniffing + size/row/sheet limits |

### P2 — Medium

| # | Title | Notes |
|---|-------|-------|
| P2-1 | No background job system | Added Mongo-backed atomic-claim queue (Redis/BullMQ optional upgrade path documented) |
| P2-2 | No structured logging / request IDs | Added JSON logger with requestId/jobId/orgId fields |
| P2-3 | `console.log` emoji logging in db.ts | Replaced by logger |
| P2-4 | tsconfig includes stale machine-specific path (`C:\Users\dev\...`) | Removed |
| P2-5 | Unused deps (`jsonwebtoken`, `uuid` — verify) | Removed if unreferenced |
| P2-6 | `any` casts in DAL/session callbacks | Typed session payload |
| P2-7 | No Docker/CI/docs/deployment story | Added full delivery artifacts |
| P2-8 | Data deletion leaves nothing behind policy-wise | Deletion cascades to storage objects + audit events |

### P3 — Improvements

- Inline-style UI everywhere; acceptable but a token-based design system was formalized.
- `test-auth.mjs` ad-hoc script at repo root; superseded by real test suite.
- README describes features that did not exist; rewritten to match reality.

## Verification status after transformation

See `docs/PRODUCTION_TRANSFORMATION_REPORT.md` for per-item status (DONE / PARTIAL /
BLOCKED) and exact verification commands run.
