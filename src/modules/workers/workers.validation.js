const { z } = require('zod');

const createWorkerBody = z.object({
  email: z.string().trim().email().max(190),
  password: z.string().min(8).max(128),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(32).optional(),
  specialtyCategoryCode: z.string().trim().min(1).max(32),
});

const updateWorkerBody = z
  .object({
    isAvailable: z.boolean().optional(),
    specialtyCategoryCode: z.string().trim().min(1).max(32)
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field must be provided' });

const updateMyAvailabilityBody = z.object({
  isAvailable: z.boolean(),
});

module.exports = { createWorkerBody, updateWorkerBody, updateMyAvailabilityBody };
