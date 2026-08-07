/**
 * Two rate limiters:
 *   - `apiLimiter`: generous, applied globally, mostly a backstop against
 *     abusive scripts and misbehaving clients.
 *   - `authLimiter`: much stricter, applied only to login/register/refresh —
 *     this is the one that actually matters for security, since brute-forcing
 *     a password is the realistic attack an unprotected auth endpoint invites.
 * Both key on IP address; behind a load balancer/reverse proxy, make sure
 * `app.set('trust proxy', 1)` is configured (see app.js) so `req.ip` reflects
 * the real client, not the proxy's address for every request.
 */
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const handler = (req, res, next) => next(ApiError.tooManyRequests());

const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed attempts count toward the limit
  handler,
});

module.exports = { apiLimiter, authLimiter };
