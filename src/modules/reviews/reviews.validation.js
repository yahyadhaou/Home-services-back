const { z } = require('zod');

const createReviewBody = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});

const respondBody = z.object({
  response: z.string().trim().min(1).max(2000),
});

const listQuery = z.object({
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

module.exports = { createReviewBody, respondBody, listQuery };
