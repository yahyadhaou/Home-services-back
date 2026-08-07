const { Router } = require('express');
const controller = require('./payments.controller');
const { createPaymentBody, createPaymentMethodBody } = require('./payments.validation');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');

const router = Router();
router.use(authenticate);

router.post('/', validate({ body: createPaymentBody }), controller.createPayment);
router.get('/booking/:bookingUuid', controller.getForBooking);

router.get('/methods', controller.listMyMethods);
router.post('/methods', validate({ body: createPaymentMethodBody }), controller.addMethod);
router.delete('/methods/:uuid', controller.removeMethod);

module.exports = router;
