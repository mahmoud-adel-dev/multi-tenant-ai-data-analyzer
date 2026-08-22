# Authorization

## Layers

1. **Middleware** (`src/middleware.ts`) — coarse UX gate: `/dashboard/*` and
   `/admin/*` require a session token; authed users skip /login and /register.
   It grants **no data access** by itself.

2. **Data Access Layer** (`src/lib/auth/dal.ts`) — the real enforcement point
   used by every server action and admin/page load:
   - `requireAuth()` → valid session + live, active `User` row (DB read).
   - `requireOrg()` → + active organization with a verified membership row,
     suspended-org rejection, plan limits resolution.
   - `requireOrgRole(min)` → role rank check (`viewer<member<analyst<admin<owner`).
   - `requirePlatformAdmin()` → platform role check for `/admin`.

3. **Query scoping** — every org-scoped query includes the verified `orgId`.
   There is no code path that trusts a client-supplied tenant/org ID.

## Why stale sessions can't escalate

The session JWT contains only identity claims. Roles/status/membership are
re-read from MongoDB inside each request's DAL call, so:

- deactivated users lose access on their next request,
- role changes apply immediately (no 30-day JWT limbo),
- membership removal in one org never affects another org incorrectly.

## Public REST API

API-key auth is separate from sessions: bcrypt-hashed keys with prefix-indexed
lookup, optional expiry, per-minute rate limits, org-bound authorization.
Job/dataset/analysis reads are always scoped to the key's org.
