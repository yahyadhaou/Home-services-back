const { Router } = require('express');
const controller = require('./bookings.controller');
const {
  createBookingBody,
  listQuery,
  assignBody,
  rescheduleBody,
  cancelBody,
  transitionStatusBody,
  submitReportBody,
  addPhotoBody,
} = require('./bookings.validation');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');

const router = Router();
router.use(authenticate);

// Every handler resolves "which bookings/actions am I allowed to see or
// perform" from req.user + req.userRole inside bookings.service.js — there
// is no role gate here beyond "authenticated", because who can act on a
// given booking depends on that specific booking (its client, its
// company, its assigned worker), not on the caller's role in the
// abstract. See findAccessibleBookingOrThrow.
router.get('/', validate({ query: listQuery }), controller.list);
router.post('/', validate({ body: createBookingBody }), controller.create);
router.get('/:uuid', controller.getByUuid);
router.patch('/:uuid/assign', validate({ body: assignBody }), controller.assign);
router.patch('/:uuid/reschedule', validate({ body: rescheduleBody }), controller.reschedule);
router.post('/:uuid/cancel', validate({ body: cancelBody }), controller.cancel);
router.post('/:uuid/confirm', controller.confirmBooking);
router.patch('/:uuid/status', validate({ body: transitionStatusBody }), controller.transitionStatus);
router.post('/:uuid/report', validate({ body: submitReportBody }), controller.submitReport);
router.post('/:uuid/report/photos', validate({ body: addPhotoBody }), controller.addReportPhoto);
router.delete('/:uuid/report/photos/:photoId', controller.removeReportPhoto);

module.exports = router;
