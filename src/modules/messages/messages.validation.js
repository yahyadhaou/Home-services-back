const { z } = require('zod');

const startConversationBody = z
  .object({
    providerType: z.enum(['company', 'independent']),
    companyId: z.string().uuid().optional(),
    independentProviderId: z.string().uuid().optional(),
    bookingId: z.string().uuid().optional(),
  })
  .refine((b) => b.providerType !== 'company' || !!b.companyId, { message: 'companyId is required', path: ['companyId'] })
  .refine((b) => b.providerType !== 'independent' || !!b.independentProviderId, {
    message: 'independentProviderId is required',
    path: ['independentProviderId'],
  });

const sendMessageBody = z.object({
  body: z.string().trim().min(1).max(4000),
});

const listQuery = z.object({
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

module.exports = { startConversationBody, sendMessageBody, listQuery };
