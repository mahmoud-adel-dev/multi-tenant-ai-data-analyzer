# Multi-Tenancy

## Model

| Entity | Purpose |
|---|---|
| `User` | Authentication identity + platform role (`user`/`platform_admin`) |
| `Organization` | The tenant boundary; owner, status (active/suspended), membershipVersion |
| `OrganizationMember` | Unique `{orgId, userId}` with role: `owner > admin > analyst > member > viewer` |
| `Invitation` | One-time token (SHA-256 hashed at rest, raw shown once), 7-day expiry |

Platform administrators are a separate axis from org roles.

## Role capabilities

| Capability | Minimum role |
|---|---|
| View datasets/dashboards/reports | viewer |
| Upload / re-analyze / delete datasets | analyst |
| Manage API keys, billing view/change, invite members | admin |
| Change roles, remove members | owner |
| Platform administration | platform_admin (server-enforced) |

## Enforcement pattern

All tenant-scoped server actions go through:

```ts
const ctx = await requireOrg();          // auth + active org membership
await requireOrgRole("analyst");         // role gate when needed
// every query then includes ctx.orgId
Dataset.findOne({ _id, orgId: ctx.orgId })
```

- Authorization is resolved **fresh from the DB on every call** — user status,
  membership and role are never trusted from the JWT.
- The active organization is an httpOnly cookie validated against a membership
  row per request; invalid values fall back to the first membership.
- IDOR is structurally prevented: wrong-org IDs resolve to "not found"
  (verified by `tests/tenant-isolation.test.ts`, which runs in CI against MongoDB).

## Lifecycle

- Registration auto-provisions a personal organization (owner) + free
  subscription so the product works immediately.
- Invites: admin generates → shares one-time link → invitee must be signed in
  **with the invited email** → membership created, token invalidated, audited.
- Role changes bump `membershipVersion` (invalidation hook for future caching).
- Owner role cannot be changed/removed via the app (documented support path).

## Data deletion

Deleting a dataset tombstones it (`deletedAt`), deletes stored objects from
object storage, releases storage quota, and writes audit events. Reports and
analyses remain queryable per retention policy until their dataset's cascade
removes access (org-scoped reads require a live dataset for context).
