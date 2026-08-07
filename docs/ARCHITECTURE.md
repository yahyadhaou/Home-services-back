# Architecture

This document is the "why" behind the structure in `src/` and `db/schema.sql`. Each section is a decision, the alternative it beat, and the reason.

## 1. One backend, one database, two apps

`home-services-app` (clients) and `home-services-company-app` (companies, workers, independents) were both built and shipped as fully client-side-mocked React Native apps before this backend existed. The natural-seeming option was to give each app "its own" backend, since they have different users and different screens. That would have been a mistake: a client's booking and a provider's job are **the same transaction**, viewed from two sides of one marketplace. Two backends means two representations of that one transaction, which means a sync problem the moment either side changes it — a cancelled booking has to somehow tell the other backend it was cancelled, a completed job has to propagate a status back. One backend, one `bookings` table, no sync problem, because there's only one row.

The cost of this decision is that the API now has to reason carefully about "who is allowed to see or touch this booking" across four different caller shapes (client, manager, worker, independent) instead of one. That logic lives entirely in `bookings.service.js`'s `findAccessibleBookingOrThrow` — one function, one place, rather than duplicated per endpoint.

## 2. Layered modules: validation → routes → controller → service

Every feature module (`src/modules/<name>/`) has the same four files:

- **`*.validation.js`** — Zod schemas for request bodies/queries/params. Nothing here touches a database or an Express request/response object.
- **`*.routes.js`** — wires `validate()`, `authenticate`, `requireRole()`, and the controller onto an Express `Router`. This file should be readable top-to-bottom as "here is every endpoint this module exposes and who's allowed to call it in principle."
- **`*.controller.js`** — translates an HTTP request into a service call and a service result into an HTTP response. No business logic; if a controller function is more than ~5 lines, that logic belongs in the service.
- **`*.service.js`** — the actual logic. The only layer that imports models. Every other layer is replaceable (a GraphQL layer, a CLI, a test) without touching this one.

The payoff of this split shows up in `rbac.middleware.js`'s own comment: route-level `requireRole()` only checks "is this role allowed to call this endpoint in principle" (coarse), while "does this specific booking belong to this specific caller" (fine) lives in the service, next to the query that already has to load the row. Trying to push fine-grained ownership checks into route middleware would mean either loading the row twice (once in middleware, once in the handler) or smuggling it through `req` — both worse than just doing the check once, in the one place that already has the data.

## 3. Identity: one `users` table, role-specific extension tables

A client, a company manager, a company worker, an independent provider, and an admin are all "a person who can log in" — same login flow, same JWT shape, same password hashing. They are *not* the same in what data they carry beyond that (a worker has a specialty and an availability flag; a company has a Handelsregister number and a payout account; a client has neither). The schema reflects this with one `users` table for identity/auth, and a 1:1 extension table per role that actually needs one (`client_profiles`, `companies`, `independent_providers`, `workers`). `client_profiles` is nearly empty today — it exists anyway, on purpose, so a client-only field never has to be bolted onto `users` (where every other role would carry a meaningless null) the day one is needed.

## 4. RBAC: JWT carries only an ID, not trust

The access token's payload is `{ sub: userId, role: roleCode }`, but `authenticate` middleware re-fetches the user (and their current role) from the database on every request rather than trusting the JWT's `role` claim for anything beyond a quick sanity check. A role change or an account deactivation takes effect on the very next request, not only once a (short-lived, 15-minute) access token happens to expire. The cost is one extra `SELECT` per request; the alternative — trusting a 15-minute-old claim — is a real vector for "I deactivated that account 3 minutes ago and it can still act."

## 5. Refresh tokens: rotated, hashed, revocable

Access tokens are short-lived and stateless (never checked against the database). Refresh tokens are the opposite on purpose: long-lived, and therefore *must* be revocable, which means they can't be purely stateless. Each refresh token is hashed (SHA-256) before being stored in `refresh_tokens` — the raw token exists only in the client's httpOnly cookie and in-flight over TLS, never at rest in this database. Every use of a refresh token **rotates** it: `auth.service.js`'s `refresh()` issues a new pair and immediately revokes the old row. If an attacker ever replays a stolen refresh token after the legitimate user has already rotated past it, the replay fails outright — which is itself the signal that a token was compromised (a real system would alert on this, not just 401 silently).

## 6. Payments: PSP-first, this platform never touches money or card numbers

`payments.service.js`'s `createPayment` is explicitly a stand-in for a real Stripe Connect (or Adyen-style) integration: create a PaymentIntent, return a client secret, let the PSP's mobile SDK collect card details directly, and only ever learn the *result* via a signed webhook. That architecture is a legal decision as much as a technical one — a platform that itself holds and moves client funds needs a BaFin ZAG payment-institution license in Germany; a platform that routes every payment through a licensed PSP, taking its cut via that PSP's split-payment feature, does not. `payment_methods` only ever stores a PSP token (`psp_payment_method_id`) plus display-safe metadata (last4, brand, expiry) — the actual card number is never in scope for this database, which is also why this build carries essentially no PCI compliance burden.

## 7. Notifications: one recipient per row, resolved at write time

The original mock data (`mockNotifications.js`) had an `audience: 'manager'` concept — visible to *any* manager, as opposed to a specific worker. Since every company in the current product has exactly one manager, `notifications.userId` is modeled as a single, specific recipient, and "notify the manager" is resolved to `companies.ownerUserId` by the calling service (`bookings.service.js`, `reviews.service.js`) at the moment the notification is created. This is simpler than a broadcast model and correct for today's product. If multi-manager companies are ever supported, that's the point to add a `companyId`-scoped broadcast mode — deliberately not built now, because building it today would mean guessing at requirements for a feature that doesn't exist yet.

## 8. What's explicitly deferred

- **Real-time messaging.** `conversations`/`messages` are polled over REST today. The schema doesn't need to change to add Socket.IO + Redis pub/sub later — `messages.sentAt`/`readAt` and `conversations.lastMessageAt` are exactly what a real-time layer would also need; only the transport changes.
- **Multi-manager companies / per-company roles beyond "manager".** See point 7.
- **Provider vehicles.** The original client-app mock data attached `vehicle`, `maxVolume`, `crew`, `insured`, `longHaulCapable` to Umzug (relocation) providers. None of that is in `companies` today — it's specific to one category, not a general provider property, and belongs in its own `provider_vehicles` table the day relocation-specific matching becomes a real feature (see `docs/DATABASE.md`).
- **Admin tooling.** The `admin` role and `application_statuses`/document-verification columns exist in the schema (`companies.applicationStatusId`, `*_documents.verifiedByUserId`) so an admin review queue can be built directly on top of them — no admin UI or endpoints exist yet because none were part of the two apps this backend serves.
