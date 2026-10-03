# Security

A checklist of what's protected, how, and — just as important — what's explicitly out of scope for this build. Every claim below points at the file that actually implements it; if the file changes, this doc is wrong until it's updated too.

## Authentication & session management

- **Passwords are hashed with argon2id** (`src/utils/password.js`), OWASP's current first-choice algorithm, with pinned cost parameters (19 MiB memory, 2 iterations, 1 thread) so a library upgrade can't silently weaken or strengthen the hash without it being a visible code change.
- **Two separate JWT secrets**, one for access tokens and one for refresh tokens (`src/utils/jwt.js`). A leaked access-token secret cannot be used to forge a refresh token, and vice versa.
- **Access tokens are short-lived (15 min default) and stateless** — never checked against the database, never revocable individually. If one leaks, the exposure window is small by design.
- **Refresh tokens are long-lived (30 days default), hashed at rest (SHA-256), and rotated on every use** (`auth.service.js`). The raw token exists only in the client's httpOnly, `Secure` (in production), `SameSite=strict` cookie, scoped to `/api/v1/auth` — never in a JS-readable location, never logged.
- **`authenticate` middleware re-fetches the user from the database on every request**, rather than trusting the JWT's role claim — a deactivated account or a role change takes effect immediately, not after a 15-minute token expiry (`src/middleware/auth.middleware.js`).
- **Login returns the same error for "no such account" and "wrong password"** (`auth.service.js`) — a distinct message for either would let an attacker enumerate registered emails one guess at a time.

## Authorization

- **Coarse-grained role gating at the route** (`requireRole()`, `src/middleware/rbac.middleware.js`) — "is this role allowed to call this endpoint at all."
- **Fine-grained ownership checks in the service layer**, next to the query that already loads the row (e.g. `bookings.service.js`'s `findAccessibleBookingOrThrow`, `workers.service.js`'s `findOwnedWorkerOrThrow`). A manager can only ever act on their own company's bookings/workers; company/independent IDs are always resolved server-side from the authenticated caller, never trusted from a request body.
- **404, not 403, on an ownership mismatch.** Every "this isn't yours" check returns "not found" rather than "forbidden," so a client can't distinguish "doesn't exist" from "exists but isn't yours" by probing UUIDs.

## Data protection at rest

- **IBAN is field-level encrypted (AES-256-GCM)** before it ever reaches a `companies`/`independent_providers` row (`src/utils/encryption.js`, exposed as a transparent `iban` virtual getter/setter on the `Company`/`IndependentProvider` models). Authenticated encryption, not just obfuscation — tampering with the ciphertext is detectable, not just unreadable. The encryption key (`FIELD_ENCRYPTION_KEY`) lives only in the environment, never in code or the database, and there is deliberately no "if no key, store plaintext" fallback — a missing key fails loudly at the point of use rather than silently storing an unencrypted bank account number.
- **Payout details are need-to-know, and admins are not on the list.** The owner reads their own IBAN/BIC/bank name via `/companies/me/profile` (or `/independents/me/profile`); every other role gets none of it. The admin API (`/api/v1/admin`) deliberately omits all four banking fields — even the masked IBAN — and returns only `payoutOnFile` and `payoutConsentAt`, so nothing sensitive crosses the wire to the dashboard in the first place (hiding it in the UI alone would still leave it in the network tab).
- **Card data never touches this database at all.** `payment_methods` stores only a PSP token (`pspPaymentMethodId`) and display-safe metadata (brand, last4, expiry) — see `docs/ARCHITECTURE.md` §6. This is also why the application carries essentially no PCI-DSS scope: the real card number lives only inside the PSP's compliant vault.
- **`users.passwordHash` is excluded from every query by default** (`User` model's `defaultScope`), not just by convention in controllers — a stray `res.json(user)` anywhere in the codebase cannot leak it. The one place that needs it (`auth.service.js`'s login) opts back in explicitly via `User.scope('withPassword')`.

## Input handling

- **Every request body/query/params is validated against a Zod schema** before a handler runs (`validate.middleware.js`) — handlers can assume `req.body` already matches its expected shape; no scattered defensive `if (!req.body.x)` checks through business logic.
- **All database access goes through Sequelize's parameterized queries.** No raw SQL string concatenation with user input anywhere in the application code (`db/schema.sql` and `db/seed.sql` are static, developer-authored files, not built from request data).

## Transport & HTTP hardening

- **Helmet** sets standard security headers on every response (`src/app.js`).
- **CORS is allow-listed**, not wildcarded — `CORS_ORIGINS` in `.env` names exactly the two apps' dev/prod origins, with `credentials: true` (required for the refresh-token cookie).
- **`trust proxy` is only enabled in production**, behind a load balancer/reverse proxy, so `req.ip` and the `Secure` cookie flag reflect the real client rather than the proxy.

## Abuse prevention

- **Two-tier rate limiting** (`rateLimiter.middleware.js`): a generous global limiter as a backstop against misbehaving clients, and a much stricter one on `/auth/register`, `/auth/login`, `/auth/refresh` that only counts *failed* attempts (`skipSuccessfulRequests: true`) — the actual defense against password brute-forcing.

## Error handling & logging

- **A single, central error handler** (`errorHandler.middleware.js`) distinguishes deliberately-thrown `ApiError`s (safe, user-facing messages) from unexpected errors (logged in full server-side, reported to the client as a generic 500). Internal error text — table names, query fragments, file paths, stack traces — is never sent to a client in production.
- **Winston structured logging** (JSON in production, human-readable in development), with HTTP access logs (`morgan`) piped through the same transport.
- **`audit_logs` is append-only** by convention — no code path in this application updates or deletes a row in it.

## Least privilege

- `.env.example` documents separate `DB_USER`/`DB_PASSWORD` (the runtime app user — DML only) and `DB_MIGRATE_USER`/`DB_MIGRATE_PASSWORD` (schema changes — DDL). Provisioning the runtime user without `CREATE`/`ALTER`/`DROP` grants means a SQL-injection-class bug (however unlikely given parameterized queries) or a compromised app process cannot rewrite the schema.

## Explicitly out of scope for this build

Being direct about these matters more than pretending they're handled:

- **Email verification is not enforced.** `users.emailVerifiedAt` exists and is set on registration in this build for convenience; a production deployment should require verification before allowing certain actions (accepting bookings, payouts) and should not pre-set it.
- **No admin review UI or endpoints** exist yet, despite the schema supporting one (`application_statuses`, `*_documents.verifiedByUserId`). Provider approval in the seed data is pre-set to `approved` rather than exercised through a real review flow.
- **No automated dependency/vulnerability scanning is wired into this repo** (e.g., `npm audit` in CI, Dependabot). That's an infrastructure/CI concern, not an application-code one, and should be set up at the repository/organization level.
- **No WAF, DDoS protection, or network-level rate limiting** — the in-app rate limiter protects against application-level abuse from a single IP, not a distributed attack; that's an infrastructure concern (Cloudflare, AWS Shield, etc.), not something an Express app can meaningfully provide on its own.
- **Refresh token theft detection is passive, not active.** Rotation means a replayed, already-superseded refresh token fails — but there is no automated "revoke every session for this user" response when that happens. A production system would want to alert on repeated reuse-of-a-rotated-token events, not just 401 them.
