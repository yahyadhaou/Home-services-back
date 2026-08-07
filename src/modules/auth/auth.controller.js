/**
 * Thin HTTP layer over auth.service. The refresh token travels two ways at
 * once, and each client uses whichever fits it:
 *   - An httpOnly, Secure (in prod), SameSite=strict cookie — for a browser
 *     or webview context, this keeps the token out of reach of an XSS
 *     payload entirely; JS on either end never touches it.
 *   - The raw value in the JSON response body — for React Native (and any
 *     other non-browser client), where there is no reliable cookie jar
 *     shared across requests/app restarts the way a browser guarantees.
 *     The mobile apps store this themselves (SecureStore) and send it back
 *     explicitly in the request body on `/auth/refresh` and `/auth/logout`.
 * Both a request's cookie and its body are accepted on the way in (cookie
 * preferred if both are present); both are always set on the way out.
 */
const authService = require('./auth.service');
const env = require('../../config/env');

const REFRESH_COOKIE = 'refreshToken';

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days, matches JWT_REFRESH_EXPIRES_IN's default
});

const requestMeta = (req) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });

const sendAuthResult = (res, statusCode, result) => {
  res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());
  res.status(statusCode).json({
    success: true,
    data: { user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken },
  });
};

const register = async (req, res) => {
  const result = await authService.register(req.body, requestMeta(req));
  sendAuthResult(res, 201, result);
};

const login = async (req, res) => {
  const result = await authService.login(req.body, requestMeta(req));
  sendAuthResult(res, 200, result);
};

const refresh = async (req, res) => {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
  const result = await authService.refresh(rawRefreshToken, requestMeta(req));
  sendAuthResult(res, 200, result);
};

const logout = async (req, res) => {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
  await authService.logout(rawRefreshToken);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  res.status(204).send();
};

const me = async (req, res) => {
  res.status(200).json({
    success: true,
    data: { user: authService.toPublicUser(req.user, req.userRole) },
  });
};

module.exports = {
  register, login, refresh, logout, me,
};
