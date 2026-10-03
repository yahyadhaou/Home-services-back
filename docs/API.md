# API Reference

Base URL: `/api/v1`. Every response is JSON, shaped `{ success: true, data: {...} }` (or `{ success: true, data: [...], pagination: {...} }` for list endpoints) on success, and `{ success: false, error: { message, details? } }` on failure — see `src/middleware/errorHandler.middleware.js`.

**Auth header:** `Authorization: Bearer <accessToken>` on every endpoint marked "Authenticated" below. The refresh token travels as an httpOnly cookie, set automatically by `/auth/login`, `/auth/register`, and `/auth/refresh`.

**Pagination:** list endpoints accept `?page=1&limit=20` (max `limit` is 100) and return a `pagination: { page, limit, totalItems, totalPages }` block alongside `data`.

**Ownership:** where a route is marked "Authenticated (owner-checked)," the caller's role alone doesn't determine access — the service layer verifies the specific resource belongs to the caller (their own booking, their own company's worker, etc.) and returns 404 rather than 403 on a mismatch. See `docs/SECURITY.md`.

---

## Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Liveness check. Not under `/api/v1`. |

## Auth — `/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | None (rate-limited) | Register as `client`, `company_manager`, or `independent_provider`. Provider roles include their business details in the same payload. |
| POST | `/login` | None (rate-limited) | Email + password. Returns an access token; sets the refresh-token cookie. |
| POST | `/refresh` | None (rate-limited) | Rotates the refresh token (from the cookie, or `refreshToken` in the body as a fallback) and issues a new access token. |
| POST | `/logout` | None | Revokes the current refresh token. |
| GET | `/me` | Authenticated | The caller's own identity + role. |

## Users — `/users`

| Method | Path | Auth | Description |
|---|---|---|---|
| PATCH | `/me` | Authenticated | Update `firstName`/`lastName`/`phone`/`email`/`locale`. Any role. |
| POST | `/me/push-token` | Authenticated | Register this device's Expo push token (`{ token, platform? }`). Idempotent per user+token. |
| DELETE | `/me/push-token` | Authenticated | Remove a token (`{ token }`) — called best-effort on logout. |

## Companies — `/companies`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | None | Public marketplace listing. `?categoryCode=&city=`. Only `approved` companies. |
| GET | `/:uuid` | None | Public company detail. |
| GET | `/me/profile` | `company_manager` | Own company profile, incl. decrypted IBAN. |
| PATCH | `/me/profile` | `company_manager` | Update company/legal/payout details. Touching any payout field stamps `payoutConsentAt`. |
| PUT | `/me/categories` | `company_manager` | Replace the full set of categories the company serves (`{ categoryCodes: [...] }`). |
| POST | `/me/documents` | `company_manager` | Upsert a verification document (`{ documentTypeCode, fileUrl }`). |

## Independent providers — `/independents`

Mirrors `/companies` exactly, for solo providers.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | None | Public marketplace listing. |
| GET | `/:uuid` | None | Public detail. |
| GET | `/me/profile` | `independent_provider` | Own profile, incl. decrypted IBAN. |
| PATCH | `/me/profile` | `independent_provider` | Update business/payout details. |
| PUT | `/me/categories` | `independent_provider` | Replace served categories. |
| POST | `/me/documents` | `independent_provider` | Upsert a verification document. |

## Workers — `/workers`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me` | `company_worker` | Own worker profile. |
| PATCH | `/me/availability` | `company_worker` | Self-toggle availability (`{ isAvailable }`). |
| GET | `/` | `company_manager` | List the caller's own company's team. |
| POST | `/` | `company_manager` | "Add coworker" — creates the login and the worker record together. |
| PATCH | `/:uuid` | `company_manager` (owner-checked) | Toggle availability and/or reassign specialty. |
| DELETE | `/:uuid` | `company_manager` (owner-checked) | Remove from team (soft delete — historical jobs keep the worker's name). |

## Bookings — `/bookings`

Every route requires authentication; who can see or act on a *specific* booking depends on that booking's client/company/worker/independent, not the caller's role in the abstract — see `findAccessibleBookingOrThrow` in `bookings.service.js`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Authenticated | List bookings scoped to the caller (client's own, a manager's company, a worker's assignments, an independent's own). `?status=&unassignedOnly=true` (manager only). |
| POST | `/` | Authenticated (`client` or `company_manager`) | Create a booking. `priceGross` is the only money figure accepted from the client; the platform fee split is always computed server-side. |
| GET | `/:uuid` | Authenticated (owner-checked) | Full detail, including the completion report if one exists. |
| PATCH | `/:uuid/assign` | `company_manager` (owner-checked) | Assign or unassign a worker (`{ workerId: uuid \| null }`). |
| PATCH | `/:uuid/reschedule` | `company_manager` / `independent_provider` (owner-checked) | Change date/time of an `upcoming` booking. |
| POST | `/:uuid/cancel` | Authenticated (owner-checked) | Cancel an `upcoming` booking (`{ reason? }`). |
| PATCH | `/:uuid/status` | `company_worker` / `company_manager` / `independent_provider` (owner-checked) | Move `upcoming → in_progress`. (`completed` is only reached via the report endpoint below.) |
| POST | `/:uuid/report` | `company_worker` / `company_manager` / `independent_provider` (owner-checked) | Submit (first time → marks the booking `completed`) or edit the completion report. |
| POST | `/:uuid/report/photos` | Same as above | Attach a photo to the report (creates an empty report first if none exists yet). |
| DELETE | `/:uuid/report/photos/:photoId` | Same as above | Remove a report photo. |

## Notifications — `/notifications`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Authenticated | The caller's own notifications. `?unreadOnly=true`. |
| GET | `/unread-count` | Authenticated | Just the count, for a badge. |
| PATCH | `/read-all` | Authenticated | Mark every notification read. |
| PATCH | `/:uuid/read` | Authenticated (owner-checked) | Mark one notification read. |

## Reviews — `/reviews`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/booking/:bookingUuid` | None | The review for a specific booking, if any. |
| GET | `/companies/:companyUuid` | None | A company's reviews, paginated, with `summary: { averageRating, totalReviews }`. |
| GET | `/independents/:providerUuid` | None | Same, for an independent. |
| POST | `/` | `client` | Leave a review on one of the caller's own **completed** bookings (`{ bookingId, rating, comment? }`). One per booking. |
| POST | `/:uuid/response` | `company_manager` / `independent_provider` (owner-checked) | Publicly respond to a review left about the caller's own provider profile. |

## Conversations — `/conversations`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Authenticated (`client`, `company_manager`, `independent_provider`) | The caller's own conversation inbox. |
| POST | `/` | `client` | Start (or resume) a conversation with a provider, optionally tied to a booking. |
| GET | `/:uuid/messages` | Authenticated (owner-checked) | Paginated message history. |
| POST | `/:uuid/messages` | Authenticated (owner-checked) | Send a message. |
| PATCH | `/:uuid/read` | Authenticated (owner-checked) | Mark every message not sent by the caller as read. |

## Payments — `/payments`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | `client` | Pay for a booking: `{ bookingId, paymentMethodId? , method? }` — at least one of `paymentMethodId` or `method` (`card` | `apple_pay` | `google_pay` | `cash`). Card/wallet payments are simulated as succeeded today; `cash` is recorded as `pending` (settled with the provider). See `docs/ARCHITECTURE.md` §6. |
| GET | `/booking/:bookingUuid` | Authenticated (owner-checked) | Payment attempts for a booking. |
| GET | `/methods` | Authenticated | The caller's own saved payment methods. |
| POST | `/methods` | Authenticated | Add a tokenized payment method (never a raw card number). |
| DELETE | `/methods/:uuid` | Authenticated (owner-checked) | Remove a saved payment method. |

## Admin — `/admin`

Platform staff only: every route requires the `admin` role (`authenticate` + `requireRole`), and a non-admin token gets `403`. This is the one module that reads across every company/independent/client instead of being scoped to "my own". Lists are paginated and sorted newest-first.

| Method | Path | Description |
|---|---|---|
| GET | `/overview` | Platform counts (clients, companies/independents by application status, workers, bookings by status), revenue (collected, completed gross/net, platform earnings) and the 8 most recent bookings. |
| GET | `/companies` | List. Filters: `status` (`draft|pending|approved|rejected`), `search` (name/city). Includes owner, worker and booking counts. |
| GET | `/companies/:uuid` | Full profile: business and registration data, owner account, documents, team (including removed workers), lifetime stats. |
| PATCH | `/companies/:uuid/status` | `{ status: 'approved' | 'rejected', rejectedReason? }` — `rejectedReason` is required when rejecting. |
| GET | `/independents` · `/independents/:uuid` | Same shape as companies, without a team. |
| PATCH | `/independents/:uuid/status` | Same body as for companies. |
| GET | `/workers` · `/workers/:uuid` | Cross-company workers (`companyId`, `search` filters); detail adds recent jobs. |
| GET | `/clients` · `/clients/:uuid` | Clients (`search`); detail adds recent bookings and reviews written. |
| PATCH | `/users/:uuid/active` | `{ isActive }` — suspend/reactivate any non-admin account. Takes effect on the next request (the auth middleware re-reads `users.isActive`). Admin accounts cannot be changed. |
| GET | `/bookings` · `/bookings/:uuid` | All bookings (`status`, `providerType`, `search`); detail adds payments and the review. |
| GET | `/payments` | All payment attempts (`status`). |
| GET | `/reviews` | All reviews (`providerType`). |
| DELETE | `/reviews/:uuid` | Remove a review (moderation). `204`. |

**Privacy:** company/independent responses never contain IBAN, BIC, bank name or account holder — only `payoutOnFile` (boolean) and `payoutConsentAt`.
