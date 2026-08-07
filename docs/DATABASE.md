# Database

`db/schema.sql` is the canonical, executable source of truth for the data model — this document is the narrative that goes with it. If the two ever disagree, trust the SQL file; update this doc.

Sequelize is the app's data-access layer (`src/models/`), but the DDL is hand-written rather than generated from Sequelize migrations. This is a deliberate dual-artifact choice: `schema.sql` is something a DBA can read, review, and run without Node ever being involved, and it's what makes the "here's a copy of the schema" deliverable actually portable. Sequelize's `underscored: true` / `paranoid: true` config (see `src/config/database.js`) is what keeps the two in sync — every model maps onto exactly the columns `schema.sql` already defines.

## Conventions

**Dual ID pattern.** Every table has a `BIGINT UNSIGNED AUTO_INCREMENT` surrogate key (`id`) for fast joins and indexing, plus a `CHAR(36)` `uuid` for anything that appears in an API URL or response body. `id` never leaves the database — a sequential integer in a public URL lets anyone enumerate every booking, user, or company by incrementing a number; a UUID doesn't.

**Lookup tables, not `ENUM`, for anything that plausibly grows.** `booking_statuses`, `application_statuses`, `legal_forms`, `document_types`, `notification_types`, and `categories` are all real tables with `code`/`name_de`/`name_en` rows, seeded from the exact same values `src/config/constants.js` uses in application code. Adding a new booking status (say, `disputed`) should be an `INSERT`, not a schema migration and a code deploy. The one place a real MySQL `ENUM` is used is `bookings.providerType` (`'company' | 'independent'`) — a genuinely fixed, binary distinction that will never need a third option without a much bigger schema change anyway.

**Snapshotting on `bookings`.** `clientName`, `clientPhone`, `addressStreet/PostalCode/City`, and `platformFeeRate` are all copied onto the booking at creation time rather than joined live from `users`/`addresses`/a config value. If a client edits their saved address next month, every booking made before that edit should still show the address that was actually used — a live join would silently rewrite history. The same reasoning applies to `platformFeeRate`: if the platform's cut changes from 12% to 13% next quarter, last year's bookings must keep showing 12%, because that's what was actually charged.

**Soft deletes everywhere a user can "remove" something.** `deleted_at` (Sequelize `paranoid: true`) is used on `users`, `addresses`, `payment_methods`, `companies`, `independent_providers`, `workers`, and `bookings`. The clearest example is `workers`: "remove from team" in the company app never hard-deletes a worker row, because `bookings.assignedWorkerId` still points at it for every job that worker ever completed — a hard delete would either cascade-null every historical job's worker reference or fail on the foreign key. Soft delete keeps the historical record intact; the app's "assign to" pickers simply filter `deletedAt IS NULL`.

**Audit trail as its own table, not a status column.** `booking_status_history` records every transition (`fromStatusId → toStatusId`, who changed it, when, an optional note). `bookings.statusId` is never updated without an accompanying `INSERT` into this table (enforced by convention in `bookings.service.js`, not by a database trigger — see "what this schema does not do" below).

**Money is `DECIMAL(10,2)`, never `FLOAT`/`DOUBLE`.** Binary floating point cannot represent currency exactly; `0.1 + 0.2` not equaling `0.3` is not an acceptable property of a payments table.

**`utf8mb4` throughout, `VARCHAR(190)` on indexed text columns.** `utf8mb4` handles German umlauts, Turkish İ/ı, and emoji correctly — MySQL's plain `utf8` is a 3-byte-only alias that silently mangles anything outside the Basic Multilingual Plane. `190` rather than `255` on columns that carry a `UNIQUE` index (like `users.email`) is defensive: `190 × 4 bytes = 760`, safely under the 767-byte max key-part length on InnoDB configurations without large-prefix support. It costs nothing on a modern MySQL 8 install and avoids a real migration headache on anything less than pristine.

## Table reference

### Lookups
`roles`, `categories`, `legal_forms`, `booking_statuses`, `application_statuses`, `document_types`, `notification_types` — no timestamps, no soft delete, seeded once and rarely written to again.

### Identity & access
- **`users`** — every account, any role, distinguished by `role_id`.
- **`refresh_tokens`** — one row per issued refresh token (= per logged-in device). Stores a SHA-256 hash, never the raw token.
- **`password_reset_tokens`** — same hashing approach, for the forgot-password flow.
- **`audit_logs`** — append-only security/compliance trail (`action`, `entityType`/`entityId`, JSON `metadata`, IP, user agent).

### Client domain
- **`addresses`** — a client's saved addresses (bookings snapshot the text, see above, rather than referencing these live).
- **`client_profiles`** — thin 1:1 extension of `users`; mostly a growth point today.
- **`payment_methods`** — tokenized PSP references only (see `docs/ARCHITECTURE.md` §6). Never a real card number.

### Provider domain
- **`companies`** / **`company_documents`** — a registered company partner and its onboarding documents.
- **`independent_providers`** / **`independent_provider_documents`** — a solo provider; mirrors `companies` closely (see schema.sql's comment on why it's a separate table rather than nullable columns bolted onto `companies`).
- **`workers`** — 1:1 extension of `users` for an employee of exactly one company.
- **`provider_categories`** — which categories a company or independent serves. Polymorphic (`provider_type` + exactly one of `company_id`/`independent_provider_id`, enforced by a `CHECK` constraint), with a generated `provider_key` column making the uniqueness constraint actually work — MySQL treats every `NULL` as distinct for uniqueness purposes, so a plain composite unique index over two nullable FK columns would not stop duplicates.

### Bookings — the core
- **`bookings`** — the unified booking/job record (see `docs/ARCHITECTURE.md` §1).
- **`booking_status_history`** — the append-only audit trail of every status change.
- **`booking_reports`** / **`booking_report_photos`** — the completion report a worker or independent files. `materialsUsed` is `JSON`, shaped as an array of `{ "name": string, "qty": number, "unit": string }`. Photos are a normalized child table (not a JSON array on the report) because photos are the one part of a report likely to need their own metadata later (moderation status, EXIF, storage tier).
- **`reviews`** — one per booking (`UNIQUE` on `bookingId`), with an optional provider response.

### Communication
- **`conversations`** / **`messages`** — a chat thread between a client and a provider, optionally tied to a booking.
- **`notifications`** — per-user activity feed entries (see `docs/ARCHITECTURE.md` §7 on why there's no broadcast concept).

### Payments
- **`payments`** — one row per payment attempt, tracking PSP references and status; the PSP itself is the system of record for the actual money movement.

## Future extensions (deliberately not built)

- **`provider_vehicles`** — the original client-app mock data attached moving-specific fields (`vehicle`, `maxVolume`, `crew`, `insured`, `longHaulCapable`) to Umzug (relocation) providers. These describe a fleet, not a generic provider property, and don't belong on `companies`/`independent_providers` — a future `provider_vehicles` table, FK'd the same polymorphic way as `provider_categories`, is the natural home if relocation-specific matching becomes a real feature.
- **Multi-manager companies** — see `docs/ARCHITECTURE.md` §7; would need a `company_id`-scoped notification broadcast mode and a role dimension beyond a single "the owner".
- **Rating aggregates as a materialized column.** `reviews.averageRating` for a provider is computed on read (`Review.aggregate('rating', 'avg', ...)` in `reviews.service.js`), not stored. Fine at today's scale; a high-traffic provider profile page would eventually want a cached/materialized `companies.averageRating` column updated on each new review instead of aggregating on every page view.

## What this schema deliberately does *not* do

There is no database trigger enforcing that `booking_status_history` gets a row every time `bookings.statusId` changes — that invariant is enforced by convention, in one place (`bookings.service.js`), not by the database. A trigger would make the invariant unconditionally true even against a rogue direct `UPDATE`, at the cost of moving business logic into the database layer where it's harder to test, version, and reason about alongside the rest of the booking lifecycle. For a single application that owns this schema exclusively, keeping that logic in the service layer was judged the better trade-off; a schema shared by multiple independent write paths would need to reconsider this.
