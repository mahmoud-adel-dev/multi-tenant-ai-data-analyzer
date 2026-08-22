# Testing

## TypeScript — Vitest (`npm test`)

| Suite | Coverage |
|---|---|
| `tests/env.test.ts` | Fail-fast env validation incl. production requirements |
| `tests/encryption.test.ts` | AES-256-GCM round-trip, random IVs, tamper detection |
| `tests/file-validation.test.ts` | Magic-byte sniffing, traversal sanitization, mislabeled-file rejection, plan limits |
| `tests/analytics-schema.test.ts` | Contract gate: metrics/provenance, dashboard DSL, injection-field stripping on AI output |
| `tests/security.test.ts` | Rate limiter behavior, API-key entropy + bcrypt verification |
| `tests/tenant-isolation.test.ts` | Cross-tenant read denial across all models, key-prefix auth, **atomic quota reservation under 20-way concurrency** |

The DB-backed isolation suite probes for MongoDB (default
`localhost:27017`, override with `TEST_MONGODB_URI`) and skips itself quickly
when absent. CI provisions MongoDB and runs it.

## Python — pytest (`analytics-service`)

Deterministic-fixture suites covering loaders (CSV/TSV/JSON/XLSX + caps),
profiling/type inference, domain inference, KPI math verified against manual
computation, correlations, outliers, RFM/k-means guards (planted clusters;
tiny-data refusal), forecasting refusal on unstable series, full-pipeline
determinism, malformed inputs, and API contract/auth via TestClient.

## CI

`.github/workflows/ci.yml`: lint+typecheck+test+build (web), ruff+pytest
(python), MongoDB-gated integration job, `npm audit --omit=dev --audit-level=high`
+ pip-audit, and Docker builds of all three images.

## E2E (Playwright) — setup provided, execution pending

Critical flows to cover once a staging environment exists: register → org
auto-provisioning → upload CSV → progress → dashboard/report render → Q&A →
API key create/revoke → invite/accept → tenant-A-cannot-access-tenant-B.
Not yet authored in-repo; do not assume coverage.
