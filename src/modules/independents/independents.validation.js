const { z } = require('zod');

const updateMeBody = z
  .object({
    businessName: z.string().trim().min(1).max(255)
      .optional(),
    street: z.string().trim().min(1).max(190)
      .optional(),
    postalCode: z.string().trim().min(1).max(10)
      .optional(),
    city: z.string().trim().min(1).max(100)
      .optional(),
    taxNumber: z.string().trim().max(32).optional(),
    vatId: z.string().trim().max(20).optional(),
    accountHolder: z.string().trim().max(190).optional(),
    iban: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}[0-9A-Z]{13,32}$/, 'Not a valid IBAN')
      .optional(),
    bic: z
      .string()
      .trim()
      .regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'Not a valid BIC')
      .optional(),
    bankName: z.string().trim().max(190).optional(),
    hourlyRateFrom: z.number().positive().max(9999.99).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    vehicleType: z.string().trim().max(100).optional(),
    vehicleMaxVolumeM3: z.number().positive().max(999.99).optional(),
    crewSize: z.number().int().positive().max(50)
      .optional(),
    isInsured: z.boolean().optional(),
    longHaulCapable: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field must be provided' });

const updateCategoriesBody = z.object({
  categoryCodes: z.array(z.string().min(1).max(32)).min(1).max(20),
});

const documentBody = z.object({
  documentTypeCode: z.string().min(1).max(32),
  fileUrl: z.string().url().max(500),
});

const listQuery = z.object({
  categoryCode: z.string().max(32).optional(),
  city: z.string().max(100).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
}).refine((q) => (q.lat === undefined) === (q.lng === undefined), {
  message: 'lat and lng must be provided together',
  path: ['lng'],
});

const coordsQuery = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
}).refine((q) => (q.lat === undefined) === (q.lng === undefined), {
  message: 'lat and lng must be provided together',
  path: ['lng'],
});

module.exports = {
  updateMeBody, updateCategoriesBody, documentBody, listQuery, coordsQuery,
};
