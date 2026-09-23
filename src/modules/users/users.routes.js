const { Router } = require('express');
const controller = require('./users.controller');
const { updateMeBody, pushTokenBody, deletePushTokenBody } = require('./users.validation');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');

const router = Router();

router.patch('/me', authenticate, validate({ body: updateMeBody }), controller.updateMe);
router.post('/me/push-token', authenticate, validate({ body: pushTokenBody }), controller.registerPushToken);
router.delete('/me/push-token', authenticate, validate({ body: deletePushTokenBody }), controller.removePushToken);

module.exports = router;
