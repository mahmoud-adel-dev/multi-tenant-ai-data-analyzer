# Backup & Restore

## MongoDB

- **What:** all SaaS metadata — users, orgs, datasets metadata, analysis runs,
  dashboards, reports, subscriptions, usage ledger/counters, audit log.
- **Backup:** Atlas continuous backups or `mongodump` on schedule (e.g. every
  6h + daily snapshot), retained ≥ 30 days.
- **Restore:** `mongorestore` into a clean replica set; the app is stateless
  besides this database and object storage.

## Object storage (S3/R2/MinIO)

- **What:** original uploads (the irreplaceable source data).
- **Controls:** enable versioning + a replication rule or lifecycle-managed
  cross-region backup. Keys are namespaced `orgs/{orgId}/datasets/{datasetId}/…`
  so selective restores are straightforward.

## Redis

Rate-limit buckets only — safe to lose. Enable AFS/everysec if you prefer
warm restarts; no durability requirement.

## Consistency note

`Dataset.originalStorageKey` ↔ storage objects: after any restore, run a
reconciliation pass that flags dataset rows whose storage key fails an
`exists()` check and marks them `failed` rather than serving dead references.
(A small admin script is a documented follow-up; none exists yet.)

## Disaster recovery targets (recommended)

| Scenario | RPO | RTO |
|---|---|---|
| Accidental dataset deletion | ≤ 6h dump lag | minutes (single-org restore) |
| Region loss | ≤ 24h (replication lag) | hours (new region deploy) |

**No restore drill has been executed yet** — schedule one before go-live;
until then treat backups as untested.
