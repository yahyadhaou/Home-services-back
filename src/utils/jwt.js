/**
 * JWT issuing/verification for the access + refresh token pair.
 *
 * Two tokens, two secrets, two lifetimes, on purpose:
 *   - Access token: short-lived (15 min default), sent as
 *     `Authorization: Bearer <token>` on every request, never persisted
 *     server-side. If one leaks, the damage window is small.
 *   - Refresh token: long-lived (30 days default), stored ONLY as a hash in
 *     the `refresh_tokens` table (see models/RefreshToken.js) and sent to
 *     the client as an httpOnly, Secure, SameSite cookie — never accessible
 *     to JS in the browser, and revocable server-side (logout, "log out all
 *     devices", or a detected compromise all just delete/flag DB rows).
 * Using two different secrets means a leaked access-token secret can't be
 * used to forge a refresh token, and vice versa.
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const signAccessToken = (payload) => jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });

const signRefreshToken = (payload) => jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN });

const verifyAccessToken = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET);

const verifyRefreshToken = (token) => jwt.verify(token, env.JWT_REFRESH_SECRET);

/**
 * Decodes a token's payload without verifying its signature — used only to
 * read the `exp` claim off a token this process just signed itself (see
 * auth.service.js's issueTokenPair), so the refresh_tokens.expires_at
 * column can never drift out of sync with the expiry baked into the JWT.
 * Never use this to trust claims from a token whose signature hasn't been
 * verified elsewhere.
 */
const decodeToken = (token) => jwt.decode(token);

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
};
