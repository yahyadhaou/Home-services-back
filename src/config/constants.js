/**
 * App-wide enum-like constants, mirrored 1:1 with the `code` columns of the
 * lookup tables in schema.sql (roles, categories, booking_statuses, …).
 *
 * Why constants AND lookup tables instead of just one or the other:
 *   - The DB needs real rows (with FK integrity, i18n labels, sort order,
 *     the ability to add a new status without a code deploy).
 *   - The app code needs to reference these values without magic strings
 *     scattered across every controller ("upcoming" typo'd as "upcomming"
 *     is a bug that only shows up at runtime).
 * Keeping this file as the single JS-side source of truth, and seeding the
 * lookup tables from these exact same values (see db/seed.sql), keeps both
 * in sync by construction.
 */

const ROLES = Object.freeze({
  CLIENT: 'client',
  COMPANY_MANAGER: 'company_manager',
  COMPANY_WORKER: 'company_worker',
  INDEPENDENT_PROVIDER: 'independent_provider',
  ADMIN: 'admin',
});

const PROVIDER_TYPES = Object.freeze({
  COMPANY: 'company',
  INDEPENDENT: 'independent',
});

const BOOKING_STATUS = Object.freeze({
  PENDING: 'pending',
  UPCOMING: 'upcoming',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

const APPLICATION_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const DOCUMENT_TYPES = Object.freeze({
  GEWERBEANMELDUNG: 'gewerbeanmeldung',
  HANDELSREGISTERAUSZUG: 'handelsregisterauszug',
  AUSWEIS: 'ausweis',
});

const NOTIFICATION_TYPES = Object.freeze({
  JOB_ASSIGNED: 'job_assigned',
  REPORT_REMINDER: 'report_reminder',
  PAYOUT: 'payout',
  JOB_UPCOMING_REMINDER: 'job_upcoming_reminder',
  REPORT_SUBMITTED: 'report_submitted',
  NEW_JOB: 'new_job',
  WORKER_UNAVAILABLE: 'worker_unavailable',
  BOOKING_CANCELLED: 'booking_cancelled',
  BOOKING_CONFIRMED: 'booking_confirmed',
  REVIEW_RECEIVED: 'review_received',
});

const NOTIFICATION_AUDIENCE = Object.freeze({
  MANAGER: 'manager',
  WORKER: 'worker',
  CLIENT: 'client',
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

const PAYMENT_METHOD_TYPE = Object.freeze({
  CARD: 'card',
  APPLE_PAY: 'apple_pay',
  GOOGLE_PAY: 'google_pay',
  // Not a stored payment method (never appears in payment_methods) — a
  // one-off choice recorded directly on the payment itself. See
  // payments.service.js's createPayment.
  CASH: 'cash',
});

// The platform's cut of every booking, shown to both sides as an explicit
// line item (never folded silently into a price) — see pricing.js in the
// client app for the product-level rationale.
const PLATFORM_FEE_RATE = 0.12;
const VAT_RATE = 0.19;

module.exports = {
  ROLES,
  PROVIDER_TYPES,
  BOOKING_STATUS,
  APPLICATION_STATUS,
  DOCUMENT_TYPES,
  NOTIFICATION_TYPES,
  NOTIFICATION_AUDIENCE,
  PAYMENT_STATUS,
  PAYMENT_METHOD_TYPE,
  PLATFORM_FEE_RATE,
  VAT_RATE,
};
