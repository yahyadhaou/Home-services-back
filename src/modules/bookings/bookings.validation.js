const { z } = require('zod');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Both a client and a company manager can create a booking (a client
 * books a marketplace provider; a manager logs a job for a client they
 * already have a relationship with) — `providerType` plus the caller's own
 * role decides which fields are required. `priceGross` is the only money
 * figure ever accepted from the client; the platform fee and the
 * provider's net earning are always computed server-side from it (see
 * bookings.service.js) — never trust a client to report its own cut.
 */
const createBookingBody = z
  .object({
    categoryCode: z.string().min(1).max(32),
    serviceLabel: z.string().trim().min(1).max(190),
    providerType: z.enum(['company', 'independent']),
    companyId: z.string().uuid().optional(),
    independentProviderId: z.string().uuid().optional(),
    assignedWorkerId: z.string().uuid().nullable().optional(),
    // Only meaningful (and required) when a company_manager creates the
    // booking on behalf of a client they already have a relationship with
    // — see bookings.service.js's createBooking for why a manager can't
    // just type a client's name/phone the way the old mock UI did: every
    // booking.clientId must reference a real, existing platform account.
    clientEmail: z.string().trim().email().max(190)
      .optional(),
    clientName: z.string().trim().min(1).max(190)
      .optional(),
    clientPhone: z.string().trim().min(1).max(32)
      .optional(),
    addressStreet: z.string().trim().min(1).max(190),
    addressPostalCode: z.string().trim().min(1).max(10),
    addressCity: z.string().trim().min(1).max(100),
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
    scheduledTime: z.string().regex(timeRegex, 'Expected HH:MM'),
    priceGross: z.number().positive().max(999999.99),
    isRecurring: z.boolean().optional(),
    recurrenceFrequency: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
    isEmergency: z.boolean().optional(),
  })
  // companyId is only required on the client-booking path — a manager
  // creating a job for their own company (signaled by clientEmail, the
  // field only that path ever sends) never provides one; the service
  // derives their company from the caller's own account instead (see
  // bookings.service.js's createBooking, COMPANY_MANAGER branch).
  .refine((body) => body.providerType !== 'company' || !!body.companyId || !!body.clientEmail, {
    message: 'companyId is required when providerType is "company"',
    path: ['companyId'],
  })
  .refine((body) => body.providerType !== 'independent' || !!body.independentProviderId, {
    message: 'independentProviderId is required when providerType is "independent"',
    path: ['independentProviderId'],
  });

const listQuery = z.object({
  status: z.string().max(20).optional(),
  unassignedOnly: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const assignBody = z.object({
  workerId: z.string().uuid().nullable(),
});

const rescheduleBody = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  scheduledTime: z.string().regex(timeRegex, 'Expected HH:MM'),
});

const cancelBody = z.object({
  reason: z.string().trim().max(255).optional(),
});

// "completed" is deliberately not a valid target here — a job is only ever
// marked completed as a side effect of submitting its completion report
// (see bookings.service.js's submitReport), so the two can never disagree
// about whether a report exists for a "completed" booking.
const transitionStatusBody = z.object({
  statusCode: z.literal('in_progress'),
});

const materialSchema = z.object({
  name: z.string().trim().min(1).max(190),
  qty: z.number().positive(),
  unit: z.string().trim().min(1).max(32),
});

const submitReportBody = z.object({
  materialsUsed: z.array(materialSchema).max(50).optional(),
  remarks: z.string().trim().max(4000).optional(),
  additionalInfo: z.string().trim().max(4000).optional(),
});

const addPhotoBody = z.object({
  photoUrl: z.string().url().max(500),
  caption: z.string().trim().max(190).optional(),
});

module.exports = {
  createBookingBody,
  listQuery,
  assignBody,
  rescheduleBody,
  cancelBody,
  transitionStatusBody,
  submitReportBody,
  addPhotoBody,
};
