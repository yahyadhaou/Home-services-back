const { z } = require('zod');

/**
 * Every field optional — this is a partial update (`PATCH`), not a
 * replace. `.refine` guards against a body that parses fine but changes
 * nothing, which would otherwise silently succeed and confuse a client
 * that expects a 400 for an empty payload.
 */
const updateMeBody = z
  .object({
    firstName: z.string().trim().min(1).max(100)
      .optional(),
    lastName: z.string().trim().min(1).max(100)
      .optional(),
    phone: z.string().trim().max(32).optional(),
    email: z.string().trim().email().max(190)
      .optional(),
    locale: z.enum(['de', 'en']).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field must be provided' });

const pushTokenBody = z.object({
  token: z.string().trim().min(1).max(255),
  platform: z.enum(['ios', 'android']).optional(),
});

const deletePushTokenBody = z.object({
  token: z.string().trim().min(1).max(255),
});

module.exports = { updateMeBody, pushTokenBody, deletePushTokenBody };
