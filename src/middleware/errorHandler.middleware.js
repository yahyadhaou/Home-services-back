/**
 * Single, final error handler for the whole app (registered last in
 * app.js). Every thrown error — from a route, a service, a Sequelize query,
 * an unhandled rejection caught by express-async-errors — ends up here.
 *
 * The rule that matters most for security: only `ApiError` instances (ones
 * we deliberately threw, with a message written for an end user) get their
 * message sent to the client. Anything else — a raw DB error, a null
 * pointer, a third-party library throwing something unexpected — is logged
 * in full server-side and reported to the client as a generic 500. Leaking
 * internal error text (table names, query fragments, file paths) is a real
 * information-disclosure risk, not just a cosmetic concern.
 */
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');

const isSequelizeValidationError = (err) => err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError';

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let apiError = err;

  if (isSequelizeValidationError(err)) {
    const fieldErrors = err.errors?.map((e) => ({ field: e.path, message: e.message }));
    apiError = ApiError.badRequest('Validation failed', fieldErrors);
  } else if (!(err instanceof ApiError)) {
    logger.error('Unhandled error', { message: err.message, stack: err.stack, path: req.originalUrl });
    apiError = ApiError.internal();
  }

  if (apiError.statusCode >= 500) {
    logger.error(apiError.message, { path: req.originalUrl, stack: err.stack });
  } else if (env.LOG_LEVEL === 'debug') {
    logger.debug(`${apiError.statusCode} ${apiError.message}`, { path: req.originalUrl });
  }

  res.status(apiError.statusCode || 500).json({
    success: false,
    error: {
      message: apiError.message,
      details: apiError.details,
      // Stack traces are a development-only convenience, never sent in prod.
      stack: env.isProduction ? undefined : err.stack,
    },
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, error: { message: `Route not found: ${req.method} ${req.originalUrl}` } });
};

module.exports = { errorHandler, notFoundHandler };
