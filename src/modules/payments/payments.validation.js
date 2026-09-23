const { z } = require('zod');

// Either an existing saved method (paymentMethodId) or a one-off choice
// (method, including 'cash' — which is never a saved method at all) —
// see payments.service.js's createPayment.
const createPaymentBody = z
  .object({
    bookingId: z.string().uuid(),
    paymentMethodId: z.string().uuid().optional(),
    method: z.enum(['card', 'apple_pay', 'google_pay', 'cash']).optional(),
  })
  .refine((body) => !!body.paymentMethodId || !!body.method, {
    message: 'Either paymentMethodId or method is required',
    path: ['method'],
  });

const createPaymentMethodBody = z.object({
  type: z.enum(['card', 'apple_pay', 'google_pay']),
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
