const { Router } = require('express');
const controller = require('./notifications.controller');
const { authenticate } = require('../../middleware/auth.middleware');

const router = Router();
router.use(authenticate);

router.get('/', controller.list);
router.get('/unread-count', controller.unreadCount);
router.patch('/read-all', controller.markAllRead);
router.patch('/:uuid/read', controller.markRead);

module.exports = router;
