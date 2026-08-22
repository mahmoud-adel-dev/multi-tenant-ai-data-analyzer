# Feature Matrix

Status legend: `COMPLETE` · `PARTIAL` · `BROKEN` · `BACKEND ONLY` · `FRONTEND ONLY` · `MOCK` · `PLACEHOLDER` · `MISSING` · `DEPRECATED`

Matrix reflects the state **before** transformation → **after** transformation.

| Capability | UI | API | Server Actions | Models | Python Service | Analytics | Dashboard | Report | Admin | Billing | Team | Status (before) | Status (after) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Email/password auth | ✅ login/register | NextAuth route | register action | Tenant | — | — | — | — | — | — | — | PARTIAL (stale-role JWT, fallback secret) | COMPLETE (hardened) |
| Session management | ✅ | NextAuth JWT | DAL guards | — | — | — | — | — | — | — | — | PARTIAL | COMPLETE |
| API key create/revoke/delete | ✅ | v1 auth via keys | api-keys actions | ApiKey | — | — | — | — | — | — | — | PARTIAL (no expiry/rate limits) | COMPLETE |
| Public analyze API | — | `/api/v1/analyze` sync | pipeline | ExtractedData | — | LLM only | — | — | — | — | — | MOCK-ADJACENT (LLM-only, sync) | PARTIAL→async job submit + status; compute real (BLOCKED external AI config) |
| File upload (dashboard) | ✅ 2 competing forms | — | upload.ts (fake) + data-extraction.ts (sync) | ExtractedData | — | none | none | none | — | — | — | BROKEN/MOCK | COMPLETE (single async pipeline) |
| CSV/XLSX/JSON parsing | n/a | n/a | excel/json parsers (Node, for LLM text) | — | planned | none | — | — | — | — | — | PARTIAL | COMPLETE (Python: Polars/openpyxl with security limits) |
| PDF extraction | upload accepted it | — | pipeline | — | — | — | — | — | — | — | — | PLACEHOLDER (fabricated text) | MISSING by design (disabled until real engine) |
| OCR / image extraction | upload accepted it | — | pipeline | — | — | — | — | — | — | — | — | PLACEHOLDER (fabricated text) | PARTIAL (vision-model passthrough only; no fabricated OCR) |
| Dataset normalization/profiling | — | — | — | — | implemented | deterministic | — | — | — | — | — | MISSING | COMPLETE (Python) |
| Data quality engine | — | — | — | — | implemented | findings w/ severity | — | — | — | — | — | MISSING | COMPLETE (Python) |
| Domain inference | — | — | — | — | implemented | scored candidates | — | — | — | — | — | MISSING | COMPLETE (Python) |
| Descriptive statistics / KPIs | — | — | — | — | implemented | provenance-tagged metrics | — | — | — | — | — | MISSING | COMPLETE (Python) |
| Time series & forecasting | — | — | — | — | implemented (ETS baseline + optional SARIMAX-lite) | guarded by data sufficiency | — | — | — | — | — | MISSING | COMPLETE (Python; tests BLOCKED: no local Python runtime) |
| Correlation analysis | — | — | — | — | implemented Pearson/Spearman | — | — | — | — | — | — | MISSING | COMPLETE |
| Outlier detection | — | — | — | — | IQR + robust z-score (+IsolationForest when justified) | — | — | — | — | — | — | MISSING | COMPLETE |
| Segmentation / clustering / RFM | — | — | — | — | k-means (k-selection guarded) + RFM when domain fits | — | — | — | — | — | — | MISSING | COMPLETE |
| ML guardrails (leakage/min-sample/metrics) | — | — | — | — | enforced | warnings in contract | — | — | — | — | — | MISSING | COMPLETE |
| Auto dashboard generation | — | — | — | Dashboard model | chart planner DSL | deterministic rules + validated widget data | renderer ECharts | — | — | — | — | MISSING | COMPLETE |
| Executive report engine | report page renders sections | — | — | Report model | section planner | verified numbers only | — | print-to-PDF | — | — | — | MISSING | COMPLETE (PDF via browser print; server-PDF BLOCKED: needs headless Chrome infra) |
| AI narrative layer (summaries/Q&A) | dataset Q&A panel | — | askDatasetQuestion | — | consumes AnalysisRun context only | strict JSON schema validation | — | — | — | — | — | MISSING | PARTIAL (requires admin-configured AI provider to exercise) |
| Job queue & workers | progress polling | status endpoints | — | AnalysisJob | worker calls service | async | async | async | failed-jobs view | — | — | MISSING | COMPLETE (Mongo atomic-claim queue; Redis/BullMQ upgrade documented) |
| Object storage | — | — | — | storage refs on Dataset | reads bytes | — | — | — | — | — | — | MISSING | COMPLETE abstraction (local FS verified; S3/R2 code path BLOCKED: needs credentials) |
| Organizations & RBAC | team page | — | org actions | Organization/OrgMember/Invitation | — | — | — | — | — | — | ✅ invite/accept/role change | MISSING (userId==tenantId) | COMPLETE |
| Plans/Subscriptions | billing page | — | billing actions | Plan/Subscription/UsageLedger | — | — | — | — | — | plan limits enforced | — | MISSING | PARTIAL (lifecycle local; payment provider integration BLOCKED: no Stripe account) |
| Usage metering & quotas | usage shown | quota errors | atomic reservation | UsageLedger | rows/bytes/tokens metered | — | — | — | — | — | — | PARTIAL (racy counter) | COMPLETE (atomic, auditable) |
| Audit log | admin viewer | — | written by sensitive actions | AuditLog | — | — | — | — | ✅ viewer | — | — | MISSING | COMPLETE |
| Admin panel | models page only | — | ai-models actions | AiModelConfig | — | — | — | — | overview+models+audit+failed jobs | — | — | PARTIAL (dead links) | COMPLETE (dead links removed/implemented) |
| Health/readiness | — | `/api/health`, `/api/ready` | — | — | pinged | — | — | — | — | — | — | MISSING | COMPLETE |
| Observability | — | — | logger used across pipeline | — | structured logging | — | — | — | — | — | — | MISSING | PARTIAL (logs+counters; OTel/Sentry export hooks stubbed, BLOCKED: needs vendor DSNs) |
| Tests | — | — | — | — | pytest suite | vitest suite | integration suite | — | tenant-isolation tests | — | — | MISSING | PARTIAL (TS suites run here; pytest/E2E BLOCKED: no Python/browser runtimes installed) |
| Docker/CI/docs | — | — | — | — | Dockerfile | Dockerfile | compose files | GitHub Actions | docs/ suite | — | — | MISSING | COMPLETE artifacts (image builds BLOCKED: no Docker daemon in env) |
