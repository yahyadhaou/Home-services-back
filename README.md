# HomeService Backend

One shared REST API (Node.js / Express / MySQL) for every HomeService client. Part of the [HomeService monorepo](../README.md), which has the system overview and end-to-end setup.

- **home-services-app** — the customer marketplace app
- **home-services-company-app** — companies, their workers, and independent solo providers
- **homeservice-admin** — the platform staff web dashboard, served by the `/api/v1/admin` module

A client's "booking" and a provider's "job" are the same real-world event — this backend models them as one row (see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)) rather than running two apps against two disconnected data models.

## Stack

- Node.js 18+ / Express 4
- MySQL 8 / Sequelize 6 (+ a hand-written `schema.sql` as the canonical DDL)
- argon2id password hashing, JWT access + refresh tokens, AES-256-GCM field encryption for bank details
- Zod request validation, Winston logging, express-rate-limit, Helmet
- `expo-server-sdk` for push delivery (best-effort, never blocks a request)
- Jest + Supertest integration tests against a dedicated, auto-rebuilt MySQL database

## Prerequisites

- Node.js 18 or later
- A running MySQL 8 server
- Two MySQL users (see `.env.example`): a low-privilege runtime user and a higher-privilege migration user. For local development you can point both at the same user if you don't want to set up two — just don't do that in production.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- `DB_*` — your MySQL connection details
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — generate with `openssl rand -base64 64`
- `FIELD_ENCRYPTION_KEY` — a 32-byte base64 key, generate with `openssl rand -base64 32`
- `CORS_ORIGINS` — the dev/prod origins of both React Native apps

Create the database and load the schema + seed data:

```bash
npm run db:create   # creates the database if it doesn't exist
npm run db:schema   # runs db/schema.sql
npm run db:seed     # runs db/seed.sql — see below
# or, all three in one go after the first `db:create`:
npm run db:reset    # schema + seed
```

Start the API:

```bash
npm run dev     # nodemon, auto-restarts on change
npm start       # plain node, for production
```

Check it's alive:

```bash
curl http://localhost:4000/health
```

## Seed data

`db/seed.sql` converts the mock data that was already on screen in both React Native apps — `MOCK_PROVIDERS`, `mockWorkers.js`, `mockJobs.js`, `mockNotifications.js` — into real rows: 24 providers around Essen/NRW, a full company team (Rüttenscheider Sanitärtechnik GmbH), an independent provider, 22 bookings across every lifecycle status, their completion reports and photos, notifications, a couple of reviews, a sample chat thread, and simulated payments.

Every seeded account shares one password for convenience: **`Passw0rd!`**. Some accounts worth logging in as:

| Email | Role |
|---|---|
| `anna.schmidt@example.com` | Client — 4 bookings across upcoming/completed/pending |
| `klaus.weber@ruettenscheider-sanitaer.de` | Company manager — full team, jobs, an unassigned-adjacent workload |
| `sercan.yildiz@ruettenscheider-sanitaer.de` | Company worker — marked unavailable, has pending/completed jobs |
| `max@musterfirma.de` | Independent provider — own client base |
| `admin@homeservices-business.de` | Admin |

See `db/seed.sql`'s header for exactly what was and wasn't carried over (bank details and uploaded documents are deliberately not seeded — see [`docs/SECURITY.md`](docs/SECURITY.md)).

## Project structure

```
db/
  schema.sql              canonical DDL — read this to understand the data model
  seed.sql                 mock data, converted to real rows
  migrations/              additive SQL for bringing an existing dev DB up to date
  scripts/                 db:create / db:schema / db:seed runners
src/
  app.js                   Express app: middleware pipeline + route mounting
  server.js                process entry point — connects the DB, then listens
  config/                  env validation, Sequelize instance, shared constants
  middleware/               auth, RBAC, validation, rate limiting, error handling
  models/                   one Sequelize model per table, index.js wires associations
  modules/
    auth/                   register, login, refresh, logout
    users/                  self-service profile edits (any role)
    companies/               company profile, categories, documents, public browsing
    workers/                 manager-side team management + worker self-service
    independents/            independent provider profile, categories, documents
    bookings/                 the core lifecycle: create, assign, reschedule, cancel, report
    notifications/            per-user activity feed
    reviews/                  ratings + provider responses
    messages/                 conversations + messages
    payments/                 simulated PSP charge + payment methods (card, wallets, cash)
    categories/               public service-category list
    admin/                    platform-staff API: overview, applications, accounts, moderation
  utils/                    password hashing, JWT, field encryption, pagination, logger
tests/                      Jest + Supertest suites, helpers, mocks
docs/                       architecture, database, security, API, Postman, ngrok
postman/                    importable collection and environment
```

Each module follows the same shape: `*.validation.js` (Zod schemas) → `*.routes.js` (wiring) → `*.controller.js` (thin HTTP layer) → `*.service.js` (the actual logic, the only thing that touches models).

## Environment variables

Validated with Zod at startup (`src/config/env.js`): a missing or malformed value stops the process with a clear message instead of failing later. `NODE_ENV=test` loads `.env.test` instead of `.env`.

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | no | `development` (default), `test` or `production` |
| `PORT` | no | Listen port (default `4000`) |
| `CORS_ORIGINS` | yes | Comma-separated browser origins allowed to call the API (Expo web, the admin dashboard) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | yes | Runtime MySQL connection |
| `DB_MIGRATE_USER`, `DB_MIGRATE_PASSWORD` | no | Higher-privilege user for the `db:*` scripts; falls back to the runtime user |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | yes | At least 32 characters each |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | no | Defaults `15m` and `30d` |
| `FIELD_ENCRYPTION_KEY` | yes | Base64 32-byte key for IBAN/BIC encryption. Losing it makes stored bank details unreadable |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | no | Global limiter (defaults 15 min, 100 requests) |
| `AUTH_RATE_LIMIT_MAX` | no | Failed-auth attempts per window per IP (default 10) |
| `LOG_LEVEL` | no | `error`, `warn`, `info` (default), `http`, `debug` |

## Testing

```bash
npm test
```

`npm test` first runs `pretest` (`npm run db:test:setup`), which **drops and recreates `homeservice_test`** from `schema.sql` and `seed.sql`, then runs Jest serially. Starting from a clean database each run is what keeps the suite deterministic; without it, data from earlier runs eventually pushes new rows off the first page of list endpoints. The drop step refuses to run unless `NODE_ENV=test` and the database name ends in `_test`, so it cannot touch your development data.

34 integration tests in 7 suites (auth, bookings lifecycle, authorization, messages, payments, notifications, health) exercise the real Express app and a real MySQL database through Supertest. Only the outbound Expo push client is stubbed (`tests/mocks/expoServerSdk.js`), because its ESM entry point is not transformable by default Jest. The user in `.env.test` needs permission to create and drop databases.

Not covered yet: the admin module, refresh-token rotation/replay assertions, and rate limiting.

## Further reading

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the reasoning behind every major structural decision
- [`docs/DATABASE.md`](docs/DATABASE.md) — schema reference and data-modeling conventions
- [`docs/SECURITY.md`](docs/SECURITY.md) — what's protected, how, and what's explicitly out of scope
- [`docs/API.md`](docs/API.md) — full endpoint reference
- [`docs/POSTMAN.md`](docs/POSTMAN.md) — import `postman/HomeService.postman_collection.json` for a ready-to-run collection of every endpoint with example bodies and auto-chaining auth
- [`docs/NGROK.md`](docs/NGROK.md) — expose this backend to a phone/emulator running the Expo apps via a tunnel

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API with nodemon |
| `npm start` | Start the API (production) |
| `npm run db:create` | Create the database if missing |
| `npm run db:schema` | Load `db/schema.sql` |
| `npm run db:seed` | Load `db/seed.sql` |
| `npm run db:reset` | Schema + seed in one step |
| `npm run db:test:setup` | Drop and rebuild the isolated `homeservice_test` database |
| `npm run tunnel` | `ngrok http 4000`, to reach the API from a physical phone |
| `npm run lint` | ESLint over `src/` |
| `npm run format` | Prettier over `src/` |
| `npm test` | Rebuild the test database, then run Jest |
