# Postman Collection

`postman/HomeService.postman_collection.json` + `postman/HomeService.postman_environment.json` — a ready-to-import Postman collection covering all 58 requests across every module, with realistic example bodies matching the seeded data in `db/seed.sql`.

## Import

1. Postman → **Import** → select both files in `postman/`.
2. Select the **HomeService — Local** environment in the top-right environment picker.
3. Make sure the API is running (`npm run dev`) and the schema + seed data are loaded (see the main [README](../README.md)).

## Auth is automatic

The collection's default auth is `Bearer {{accessToken}}`. Run **Auth → Login** once (the seeded body logs in as `anna.schmidt@example.com`, password `Passw0rd!`) — its test script writes the returned access token into `{{accessToken}}` automatically, so every other request just works without you copying anything.

To test as a different role, just change the email in the Login request body before sending it and re-run it — every seeded account shares the same password:

| Email | Role |
|---|---|
| `anna.schmidt@example.com` | Client |
| `klaus.weber@ruettenscheider-sanitaer.de` | Company manager |
| `sercan.yildiz@ruettenscheider-sanitaer.de` | Company worker |
| `max@musterfirma.de` | Independent provider |
| `admin@homeservices-business.de` | Admin |

## Requests chain automatically

A handful of requests capture an ID from their response into a collection variable, so later requests in that folder don't need manual copy-pasting:

- **List public companies** → `{{companyId}}`
- **List public independents** → `{{independentId}}`
- **Create booking** → `{{bookingId}}`
- **Add a coworker** → `{{workerId}}`
- **Add a report photo** → `{{photoId}}`
- **List my notifications** → `{{notificationId}}`
- **Leave a review** → `{{reviewId}}`
- **Start a conversation** → `{{conversationId}}`
- **Add a payment method** → `{{paymentMethodId}}`

## A realistic end-to-end flow to try

1. **Auth → Login** as `anna.schmidt@example.com`.
2. **Companies → List public companies** (populates `{{companyId}}` with Rüttenscheider Sanitärtechnik GmbH).
3. **Bookings → Create booking — as client**.
4. **Auth → Login** again, this time as `klaus.weber@ruettenscheider-sanitaer.de` (switches `{{accessToken}}` to the manager).
5. **Workers → List my team**, then **Bookings → Assign a worker** using one of their UUIDs.
6. **Auth → Login** as `sercan.yildiz@ruettenscheider-sanitaer.de` (the worker).
7. **Bookings → Start job**, then **Submit / edit completion report**.
8. **Auth → Login** back as `anna.schmidt@example.com`.
9. **Reviews → Leave a review** on the now-completed booking.

Public endpoints (marketplace browsing, published reviews) are marked `noauth` in the collection and work with no login at all.
