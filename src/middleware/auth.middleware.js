/**
 * Verifies the access token on protected routes and attaches the caller's
 * identity to `req.user`. Deliberately re-reads the user from the DB rather
 * than trusting the JWT payload for anything beyond `id` — a role change or
 * an account deactivation should take effect on the next request, not only
 * once the (short-lived) access token happens to expire.
 */
const { verifyAccessToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const { User, Role } = require('../models');

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Missing or malformed Authorization header');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token');
    }

    const user = await User.findByPk(payload.sub, {
      include: [{ model: Role, as: 'role' }],
    });

    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Account not found or deactivated');
    }

    req.user = user;
    req.userRole = user.role.code;
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = { authenticate };
