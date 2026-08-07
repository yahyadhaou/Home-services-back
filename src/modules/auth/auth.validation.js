/**
 * Registration is a single POST, not a step-by-step mirror of the mobile
 * app's multi-screen wizard — the wizard collects fields locally across
 * screens and submits once at the end, which is exactly what a REST API
 * should want. Bank/payout details are deliberately NOT part of this
 * payload: they're collected later via an authenticated PATCH once the
 * account exists (see modules/companies and modules/independents) — a
 * newly-created account has no reason to ask for an IBAN before the user
 * has even verified their email.
 */
const { z } = require('zod');
const { ROLES } = require('../../config/constants');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');

const baseFields = {
  email: z.string().trim().email().max(190),
  password,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(32).optional(),
  locale: z.enum(['de', 'en']).optional(),
};

const companyDetailsSchema = z.object({
  legalName: z.string().trim().min(1).max(255),
  legalFormCode: z.string().trim().min(1).max(16),
  street: z.string().trim().min(1).max(190),
  postalCode: z.string().trim().min(1).max(10),
  city: z.string().trim().min(1).max(100),
  representativeName: z.string().trim().min(1).max(190),
  representativeEmail: z.string().trim().email().max(190),
  representativePhone: z.string().trim().max(32).optional(),
  taxNumber: z.string().trim().max(32).optional(),
  vatId: z.string().trim().max(20).optional(),
});

const independentDetailsSchema = z.object({
  businessName: z.string().trim().min(1).max(255),
  legalFormCode: z.string().trim().min(1).max(16),
  street: z.string().trim().min(1).max(190),
  postalCode: z.string().trim().min(1).max(10),
  city: z.string().trim().min(1).max(100),
  taxNumber: z.string().trim().max(32).optional(),
  vatId: z.string().trim().max(20).optional(),
  primaryCategoryCode: z.string().trim().max(32).optional(),
});

const registerBody = z.discriminatedUnion('role', [
  z.object({ role: z.literal(ROLES.CLIENT), ...baseFields }),
  z.object({ role: z.literal(ROLES.COMPANY_MANAGER), ...baseFields, company: companyDetailsSchema }),
  z.object({ role: z.literal(ROLES.INDEPENDENT_PROVIDER), ...baseFields, independent: independentDetailsSchema }),
]);

const loginBody = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const refreshBody = z.object({
  // Primary path is the httpOnly cookie (see auth.controller.js); this
  // field only exists for non-browser clients that can't rely on cookies.
  refreshToken: z.string().min(1).optional(),
});

module.exports = { registerBody, loginBody, refreshBody };
