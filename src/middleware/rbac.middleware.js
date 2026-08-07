/**
 * Role-based access control — must run after `authenticate` (needs
 * `req.userRole`). Usage: `router.post('/', authenticate, requireRole(ROLES.COMPANY_MANAGER), handler)`.
 *
 * This only checks "is this role allowed to call this endpoint at all" —
 * it's coarse-grained by design. Finer-grained checks ("is this booking
 * actually assigned to this worker", "does this company own this booking")
 * live in the service layer, next to the query that already has to load the
 * row anyway (see modules/bookings/bookings.service.js). Splitting it this
 * way keeps the route definitions readable as a list of "who's allowed
 * here in principle" while the real ownership checks sit where the data is.
 */
const ApiError = require('../utils/ApiError');

const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.userRole) {
    return next(ApiError.unauthorized());
  }
  if (!allowedRoles.includes(req.userRole)) {
    return next(ApiError.forbidden(`This action requires one of: ${allowedRoles.join(', ')}`));
  }
  return next();
};

module.exports = { requireRole };
