const { Router } = require('express');
const controller = require('./admin.controller');
const {
  uuidParam,
  companiesListQuery,
  independentsListQuery,
  workersListQuery,
  clientsListQuery,
  bookingsListQuery,
  paymentsListQuery,
  reviewsListQuery,
  applicationStatusBody,
  activeBody,
} = require('./admin.validation');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');
const { ROLES } = require('../../config/constants');

const router = Router();

// Every route below is platform-staff only — see admin.service.js's header
// comment for why this module is the one place allowed to see across every
// company/independent/client instead of scoping to "my own".
router.use(authenticate, requireRole(ROLES.ADMIN));

router.get('/overview', controller.getOverview);

router.get('/companies', validate({ query: companiesListQuery }), controller.listCompanies);
router.get('/companies/:uuid', validate({ params: uuidParam }), controller.getCompany);
router.patch('/companies/:uuid/status', validate({ params: uuidParam, body: applicationStatusBody }), controller.setCompanyStatus);

router.get('/independents', validate({ query: independentsListQuery }), controller.listIndependents);
router.get('/independents/:uuid', validate({ params: uuidParam }), controller.getIndependent);
router.patch('/independents/:uuid/status', validate({ params: uuidParam, body: applicationStatusBody }), controller.setIndependentStatus);

router.get('/workers', validate({ query: workersListQuery }), controller.listWorkers);
router.get('/workers/:uuid', validate({ params: uuidParam }), controller.getWorker);

router.get('/clients', validate({ query: clientsListQuery }), controller.listClients);
router.get('/clients/:uuid', validate({ params: uuidParam }), controller.getClient);

router.patch('/users/:uuid/active', validate({ params: uuidParam, body: activeBody }), controller.setUserActive);

router.get('/bookings', validate({ query: bookingsListQuery }), controller.listBookings);
router.get('/bookings/:uuid', validate({ params: uuidParam }), controller.getBooking);

router.get('/payments', validate({ query: paymentsListQuery }), controller.listPayments);

router.get('/reviews', validate({ query: reviewsListQuery }), controller.listReviews);
router.delete('/reviews/:uuid', validate({ params: uuidParam }), controller.deleteReview);

module.exports = router;
