const { Router } = require('express');
const controller = require('./workers.controller');
const { createWorkerBody, updateWorkerBody, updateMyAvailabilityBody } = require('./workers.validation');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');
const { ROLES } = require('../../config/constants');

const router = Router();
router.use(authenticate);

// Worker self-service — registered before the /:uuid routes below so "me"
// is never captured as a :uuid param.
router.get('/me', requireRole(ROLES.COMPANY_WORKER), controller.getMe);
router.patch(
  '/me/availability',
  requireRole(ROLES.COMPANY_WORKER),
  validate({ body: updateMyAvailabilityBody }),
  controller.updateMyAvailability,
);

// Manager-side team management — ownership of each worker is verified
// against the caller's own company in workers.service.js, not here.
router.get('/', requireRole(ROLES.COMPANY_MANAGER), controller.listMyTeam);
router.post('/', requireRole(ROLES.COMPANY_MANAGER), validate({ body: createWorkerBody }), controller.addWorker);
router.patch('/:uuid', requireRole(ROLES.COMPANY_MANAGER), validate({ body: updateWorkerBody }), controller.updateWorker);
router.delete('/:uuid', requireRole(ROLES.COMPANY_MANAGER), controller.removeWorker);

module.exports = router;
