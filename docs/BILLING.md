# Billing & Usage Metering

## Entities

| Entity | Purpose |
|---|---|
| `Plan` | Code-defined catalog (Free, Pro) lazily synced to MongoDB — no seed step |
| `Subscription` | Per-org: planKey, status, period bounds, cancelAtPeriodEnd, provider (`manual`\|`stripe`) |
| `UsageLedger` | Append-only event log (org, metric, period, delta, source, idempotency key) |
| `UsageCounter` | Per `{orgId, metric, periodKey}` atomic counters used for enforcement |

## Metrics metered

- `jobs` — analyses per calendar month
- `upload_bytes` / `storage_bytes` — ingestion and stored volume
- `rows_analyzed` — compute consumption
- `ai_tokens_out` — narrative tokens
- `reports_generated` — reserved for scheduled reporting

## Concurrency-safe quotas

Enforcement never does read-then-write. Reservation is a single atomic op:

```js
UsageCounter.findOneAndUpdate(
  { orgId, metric, periodKey, used: { $lte: limit - amount } },
  { $inc: { used: amount } },
  { upsert: true }
)
```

If the guard fails to match, the limit is reached — no partial state exists.
Failures compensate via `releaseQuota` (negative increment). 20 concurrent
uploads against one remaining slot yield exactly one success; this exact
scenario is covered by `tests/tenant-isolation.test.ts` (runs in CI with
MongoDB).

Monthly periods are UTC calendar months keyed `"YYYY-MM"`; storage is keyed
`"all"` as a gauge. No reset cron needed.

## Payment provider

The billing domain is provider-abstracted. Without Stripe credentials:

- plan changes are recorded with `provider: "manual"` and an explicit audit
  note that **no payment was processed**,
- nothing simulates payment success anywhere in the codebase.

Integrating Stripe = webhook endpoints + checkout sessions writing the same
`Subscription`/`UsageLedger` records; ledger has unique idempotency indexes so
webhook retries cannot double-charge.
