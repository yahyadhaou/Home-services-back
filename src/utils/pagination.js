/**
 * Shared pagination parsing + response shaping, so every list endpoint
 * (bookings, notifications, reviews, workers…) paginates the same way
 * instead of each module inventing its own `page`/`limit` conventions.
 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  return { page, limit, offset: (page - 1) * limit };
};

const buildPaginatedResponse = (rows, count, { page, limit }) => ({
  data: rows,
  pagination: {
    page,
    limit,
    totalItems: count,
    totalPages: Math.ceil(count / limit) || 1,
  },
});

module.exports = { parsePagination, buildPaginatedResponse };
