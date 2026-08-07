const { Router } = require('express');
const controller = require('./reviews.controller');
const { createReviewBody, respondBody, listQuery } = require('./reviews.validation');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');
const { ROLES } = require('../../config/constants');

const router = Router();

// Public — reviews are marketing content for the marketplace, same as a
// company/independent's public profile.
router.get('/booking/:bookingUuid', controller.getForBooking);
router.get('/companies/:companyUuid', validate({ query: listQuery }), controller.listForCompany);
router.get('/independents/:providerUuid', validate({ query: listQuery }), controller.listForIndependent);

router.post('/', authenticate, requireRole(ROLES.CLIENT), validate({ body: createReviewBody }), controller.create);
router.post(
  '/:uuid/response',
  authenticate,
  requireRole(ROLES.COMPANY_MANAGER, ROLES.INDEPENDENT_PROVIDER),
  validate({ body: respondBody }),
  controller.respond,
);

module.exports = router;
