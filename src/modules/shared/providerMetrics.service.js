/**
 * Cross-cutting, read-only metrics attached to a provider's public
 * listing — distance from the caller (only when they share their own
 * coordinates) and average first-response time. Both companies.service.js
 * and independents.service.js call through here so the underlying SQL
 * exists exactly once instead of twice, slowly drifting apart.
 *
 * Neither of these is a stored, pre-computed column: distance depends on
 * who's asking, and response time is derived from real message history.
 * At real-world scale, response time in particular would want to become a
 * materialized/cached value refreshed on a schedule rather than
 * recomputed on every listing request — the query is written as one
 * batch covering every provider of a type at once specifically so that
 * migration, if it ever happens, only has to change where the number
 * comes from, not the shape callers already depend on.
 */
const { literal, QueryTypes } = require('sequelize');
const sequelize = require('../../config/database');

/**
 * A Sequelize literal computing great-circle (haversine) distance in km
 * from (lat, lng) to each row's own latitude/longitude columns. lat/lng
 * are only ever numbers here (validated via zod's z.coerce.number()
 * upstream, never raw request strings), so interpolating them directly
 * into the SQL text is safe — a JS number literal cannot carry a SQL
 * injection payload. LEAST/GREATEST clamp the ACOS argument to [-1, 1] to
 * guard against it landing just outside that domain from floating-point
 * rounding, which would otherwise make ACOS return NULL for an otherwise
 * valid coordinate pair.
 */
const distanceKmLiteral = (lat, lng) => literal(
  `(6371 * ACOS(LEAST(1, GREATEST(-1,
    COS(RADIANS(${lat})) * COS(RADIANS(latitude)) * COS(RADIANS(longitude) - RADIANS(${lng}))
    + SIN(RADIANS(${lat})) * SIN(RADIANS(latitude))
  ))))`,
);

/**
 * One query covering every provider of the given type — avoids an N+1 of
 * "this provider's average response time" per row on a list endpoint.
 * Response time is defined as: for each conversation, the gap between the
 * client's first message and the provider's first reply *after* that
 * (never a provider message that happens to predate the client ever
 * saying anything). Returns a Map keyed by the provider's internal id
 * (companies.id / independent_providers.id); a provider with no qualifying
 * conversation yet simply has no entry — callers should treat that as
 * "no data" (null), never as "instant response".
 */
const getAvgResponseMinutesByProvider = async (providerType) => {
  const providerColumn = providerType === 'company' ? 'c.company_id' : 'c.independent_provider_id';

  const rows = await sequelize.query(
    `
    SELECT ${providerColumn} AS providerId,
           AVG(TIMESTAMPDIFF(MINUTE, cf.first_client_at, pf.first_provider_reply_at)) AS avgResponseMinutes
    FROM conversations c
    JOIN (
      SELECT m.conversation_id, MIN(m.sent_at) AS first_client_at
      FROM messages m
      JOIN conversations cc ON cc.id = m.conversation_id
      WHERE m.sender_user_id = cc.client_id
      GROUP BY m.conversation_id
    ) cf ON cf.conversation_id = c.id
    JOIN (
      SELECT m.conversation_id, MIN(m.sent_at) AS first_provider_reply_at
      FROM messages m
      JOIN conversations cc ON cc.id = m.conversation_id
      WHERE m.sender_user_id <> cc.client_id
      GROUP BY m.conversation_id
    ) pf ON pf.conversation_id = c.id AND pf.first_provider_reply_at > cf.first_client_at
    WHERE ${providerColumn} IS NOT NULL
    GROUP BY ${providerColumn}
    `,
    { type: QueryTypes.SELECT },
  );

  return new Map(rows.map((row) => [
    row.providerId,
    row.avgResponseMinutes === null ? null : Math.round(Number(row.avgResponseMinutes)),
  ]));
};

/**
 * One query covering every provider of the given type — average star
 * rating and review count, straight off `reviews` (which already carries
 * `company_id`/`independent_provider_id` directly, no join through
 * bookings needed). A provider with zero reviews simply has no entry.
 */
const getRatingSummaryByProvider = async (providerType) => {
  const providerColumn = providerType === 'company' ? 'company_id' : 'independent_provider_id';

  const rows = await sequelize.query(
    `
    SELECT ${providerColumn} AS providerId,
           AVG(rating) AS avgRating,
           COUNT(*) AS reviewCount
    FROM reviews
    WHERE ${providerColumn} IS NOT NULL
    GROUP BY ${providerColumn}
    `,
    { type: QueryTypes.SELECT },
  );

  return new Map(rows.map((row) => [
    row.providerId,
    { avgRating: Number(Number(row.avgRating).toFixed(2)), reviewCount: Number(row.reviewCount) },
  ]));
};

/**
 * One query covering every provider of the given type — count of bookings
 * that have actually reached the `completed` status. A provider with zero
 * completed bookings simply has no entry (callers should treat that as 0,
 * not as missing data — unlike response time/rating, "no jobs yet" is a
 * meaningful, real answer here).
 */
const getCompletedJobsCountByProvider = async (providerType) => {
  const providerColumn = providerType === 'company' ? 'company_id' : 'independent_provider_id';

  const rows = await sequelize.query(
    `
    SELECT b.${providerColumn} AS providerId,
           COUNT(*) AS completedJobs
    FROM bookings b
    JOIN booking_statuses bs ON bs.id = b.status_id
    WHERE b.${providerColumn} IS NOT NULL AND bs.code = 'completed'
    GROUP BY b.${providerColumn}
    `,
    { type: QueryTypes.SELECT },
  );

  return new Map(rows.map((row) => [row.providerId, Number(row.completedJobs)]));
};

module.exports = {
  distanceKmLiteral, getAvgResponseMinutesByProvider, getRatingSummaryByProvider, getCompletedJobsCountByProvider,
};
