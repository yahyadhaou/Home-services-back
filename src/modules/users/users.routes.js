const { Router } = require('express');
const controller = require('./users.controller');
const { updateMeBody } = require('./users.validation');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');

const router = Router();

router.patch('/me', authenticate, validate({ body: updateMeBody }), controller.updateMe);

module.exports = router;
