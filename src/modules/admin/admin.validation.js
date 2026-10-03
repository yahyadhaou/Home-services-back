const { z } = require('zod');

const uuidParam = z.object({ uuid: z.string().uuid() });

const paginationShape = {
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
};

const companiesListQuery = z.object({
  ...paginationShape,
  status: z.enum(['draft', 'pending', 'approved', 'rejected']).optional(),
  search: z.string().trim().max(190).optional(),
});

const independentsListQuery = z.object({
  ...paginationShape,
  status: z.enum(['draft', 'pending', 'approved', 'rejected']).optional(),
  search: z.string().trim().max(190).optional(),
});

const workersListQuery = z.object({
  ...paginationShape,
  companyId: z.string().uuid().optional(),
  search: z.string().trim().max(190).optional(),
});

const clientsListQuery = z.object({
  ...paginationShape,
  search: z.string().trim().max(190).optional(),
});

const bookingsListQuery = z.object({
  ...paginationShape,
  status: z.enum(['pending', 'upcoming', 'in_progress', 'completed', 'cancelled']).optional(),
  providerType: z.enum(['company', 'independent']).optional(),
  search: z.string().trim().max(190).optional(),
});

const paymentsListQuery = z.object({
  ...paginationShape,
  status: z.enum(['pending', 'succeeded', 'failed', 'refunded']).optional(),
});

const reviewsListQuery = z.object({
  ...paginationShape,
  providerType: z.enum(['company', 'independent']).optional(),
});

const applicationStatusBody = z
  .object({
    status: z.enum(['approved', 'rejected']),
    rejectedReason: z.string().trim().min(1).max(255).optional(),
  })
  .refine((body) => body.status !== 'rejected' || !!body.rejectedReason, {
    message: 'rejectedReason is required when rejecting',
    path: ['rejectedReason'],
  });

const activeBody = z.object({
  isActive: z.boolean(),
});

module.exports = {
  uuidParam,
  companiesListQuery,
  independentsListQuery,
  workersListQuery,
  clientsListQuery,
  bookingsListQuery,
  paymentsListQuery,
  reviewsListQuery,
  applicationStatusBody,
  activeBody,
};
