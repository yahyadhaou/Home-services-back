const { z } = require('zod');

const createPaymentBody = z.object({
  bookingId: z.string().uuid(),
  paymentMethodId: z.string().uuid().optional(),
});

const createPaymentMethodBody = z.object({
  type: z.enum(['card', 'apple_pay']),
  pspPaymentMethodId: z.string().min(1).max(255).optional(),
  brand: z.string().max(32).optional(),
  last4: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  expMonth: z.number().int().min(1).max(12)
    .optional(),
  expYear: z.number().int().min(new Date().getFullYear()).max(new Date().getFullYear() + 20)
    .optional(),
  isDefault: z.boolean().optional(),
});

module.exports = { createPaymentBody, createPaymentMethodBody };
