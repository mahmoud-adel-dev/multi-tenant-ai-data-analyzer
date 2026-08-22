# Data Pipeline

```
 Upload (dashboard action / REST API)
   │  auth → org role gate
   │  file validation: magic bytes · size caps · sanitization · checksum
   │  atomic quota reservation (jobs, storage bytes)
   ▼
 Object storage put (originals)  +  Dataset row (status=uploading→ready)
   │
   ▼
 AnalysisJob(QUEUED) ── idempotency key guards duplicates
   │
   ▼ worker claim (atomic findOneAndUpdate; stall reclaim after 10 min)
 PARSING      load original from storage; size verification
 ANALYZING    POST bytes → Python service (guarded parse → normalize → profile)
              type inference · quality findings · domain inference
              KPIs w/ provenance · trends · correlations · outliers
              RFM/k-means segments · holdout-validated forecasts
 GENERATING_  Zod contract validation of engine payload
   DASHBOARD  persist AnalysisRun · Dashboard(plan) · Report(plan)
   REPORT     dataset snapshot update (columns/quality/domain/counts)
              usage ledger: rows_analyzed (+ ai tokens if narrated)
              optional AI narrative over verified results only
 COMPLETED    notification · audit events · job timings recorded
   │
   ├── FAILED (after maxAttempts w/ exponential backoff): dataset marked failed,
   │         user notified, audit trail written
   └── CANCELLED (reserved for UI cancellation)
```

## Normalization guarantees

- Column names slugified + deduplicated; transformations recorded in the
  column snapshot (original name ↔ normalized name ↔ inferred type/role).
- User data is **never destructively modified** — cleaning is reported via
  quality findings with suggested remediation instead of silent mutation.

## Provenance

Every metric embeds `{aggregation, sourceColumns[], datasetVersion}` and every
run stores `engineVersion`, execution stats and warnings — "where did this
number come from" is answerable in one click (report appendix).
