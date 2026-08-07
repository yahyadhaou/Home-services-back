const { Router } = require('express');
const controller = require('./auth.controller');
const { registerBody, loginBody, refreshBody } = require('./auth.validation');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const { authLimiter } = require('../../middleware/rateLimiter.middleware');

const router = Router();

// authLimiter is IP-based and only counts failed attempts (see
// rateLimiter.middleware.js) — it's the actual brute-force defense here,
// not the Zod validation, which only rejects malformed input.
router.post('/register', authLimiter, validate({ body: registerBody }), controller.register);
router.post('/login', authLimiter, validate({ body: loginBody }), controller.login);
router.post('/refresh', authLimiter, validate({ body: refreshBody }), controller.refresh);
router.post('/logout', validate({ body: refreshBody }), controller.logout);
router.get('/me', authenticate, controller.me);

module.exports = router;
