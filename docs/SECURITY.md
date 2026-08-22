# Security

## Authentication

- Credentials auth (bcrypt cost 12) with timing-equalized failure paths.
- JWT session cookies: `__Secure-` prefix + `secure` in production, HttpOnly,
  SameSite=Lax, 7-day absolute age.
- **Stale-role immunity:** the JWT carries identity only. Every server action
  re-validates account status + org role from MongoDB (`lib/auth/dal.ts`), so
  deactivation or role changes take effect immediately.
- Login failures and registrations are rate-limited per IP and audited.

## Secrets

- `.env` validated by Zod at boot; **production fails fast** on missing/weak
  `MONGODB_URI`, `NEXTAUTH_SECRET`, `APP_ENCRYPTION_KEY`, `NEXTAUTH_URL`.
- AI provider API keys are encrypted at rest with AES-256-GCM
  (`lib/crypto/encryption.ts`, versioned payload format). They decrypt only
  inside the AI client; they never appear in DTOs, logs or error responses.
  Editing a model config without typing a key preserves the stored one.
- Invitation tokens and API keys: only hashes stored; raw values shown once.

## Authorization & isolation

See `docs/MULTI_TENANCY.md` and `docs/AUTHORIZATION.md`. Tenant isolation is
server-enforced on every query and proven by tests.

## File handling (untrusted input)

- Extensions/MIME never trusted — content sniffed via magic bytes
  (ZIP for XLSX, %PDF, image signatures, text heuristics).
- Mislabeled files rejected (e.g., CSV containing a ZIP payload).
- Hard ceilings: absolute upload cap + plan cap; row/column/cell/sheet limits
  in the Python parser (XLSX zip-bomb guard).
- Filenames sanitized (path traversal, control chars, length caps).
- PDF/image extraction is disabled until a real engine exists — the platform
  never fabricates extracted content.
- Malware scanning integration point: `validateTabularUpload()` is the single
  choke point where a ClamAV/scan-service hook belongs (documented TODO for
  deployment-specific integration).

## Prompt-injection defense

- Uploaded content reaches LLMs only as fenced, labeled **data** blocks with
  explicit ignore-instructions framing (`guardUntrustedContent`).
- All model outputs pass strict Zod schemas; extra fields are stripped, so
  injected "fields" cannot influence application state.
- The Q&A endpoint answers exclusively from verified analytical results and is
  instructed to refuse non-derivable questions.

## API hardening

- Consistent envelopes: `{success, data}` / `{success:false, error:{code,message}}`.
- Typed error taxonomy mapped to correct HTTP codes; stack traces never leak.
- Per-key distributed-capable rate limiting (Redis when configured); 429 +
  Retry-After.
- Idempotency-Key support prevents duplicate jobs/billing on retries.
- CORS origin allow-list via `ALLOWED_ORIGINS`.

## Transport & headers

HSTS (prod), CSP (self-default, documented inline-script allowance),
X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy,
Permissions-Policy.

## Audit log

Append-only `AuditLog` records logins/failures, org/member changes, API key
lifecycle, dataset upload/delete, analysis outcomes, subscription and admin
model changes — with actor, scope, resource, IP/UA metadata (never secrets).

## Dependencies

SheetJS upgraded to the patched CDN distribution (npm registry version had
critical CVEs); unused packages removed; CI runs `npm audit --omit=dev
--audit-level=high` and pip-audit.
