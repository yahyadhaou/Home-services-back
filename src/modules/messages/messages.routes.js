const { Router } = require('express');
const controller = require('./messages.controller');
const { startConversationBody, sendMessageBody, listQuery } = require('./messages.validation');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');

const router = Router();
router.use(authenticate);

router.get('/', validate({ query: listQuery }), controller.listMine);
router.post('/', validate({ body: startConversationBody }), controller.start);
router.get('/:uuid/messages', validate({ query: listQuery }), controller.listMessages);
router.post('/:uuid/messages', validate({ body: sendMessageBody }), controller.sendMessage);
router.patch('/:uuid/read', controller.markRead);

module.exports = router;
