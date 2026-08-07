/**
 * Wraps a zod schema into an Express middleware that validates
 * body/query/params before the handler ever runs.
 *
 * Why validate at the edge instead of trusting controllers to check their
 * own inputs: every handler downstream can assume `req.body` already
 * matches the shape it expects — no defensive `if (!req.body.email)`
 * scattered through business logic, and one consistent 400 response shape
 * for every bad request across the whole API.
 *
 * Usage: `router.post('/', validate({ body: createBookingSchema }), handler)`
 */
const ApiError = require('../utils/ApiError');

const validate = (schemas) => (req, res, next) => {
  try {
    if (schemas.params) req.params = schemas.params.parse(req.params);
    if (schemas.query) req.query = schemas.query.parse(req.query);
    if (schemas.body) req.body = schemas.body.parse(req.body);
    return next();
  } catch (err) {
    if (err.name === 'ZodError') {
      return next(ApiError.badRequest('Validation failed', err.flatten().fieldErrors));
    }
    return next(err);
  }
};

module.exports = { validate };
