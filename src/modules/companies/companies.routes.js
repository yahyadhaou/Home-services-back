const { Router } = require('express');
const controller = require('./companies.controller');
const {
  updateMeBody, updateCategoriesBody, documentBody, listQuery, coordsQuery,
} = require('./companies.validation');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');
const { ROLES } = require('../../config/constants');

const router = Router();

// Public marketplace browsing — no auth required, only approved companies
// are ever returned (enforced in companies.service.js, not here).
router.get('/', validate({ query: listQuery }), controller.listPublic);
router.get('/:uuid', validate({ query: coordsQuery }), controller.getPublicByUuid);

router.get('/me/profile', authenticate, requireRole(ROLES.COMPANY_MANAGER), controller.getMe);
router.patch('/me/profile', authenticate, requireRole(ROLES.COMPANY_MANAGER), validate({ body: updateMeBody }), controller.updateMe);
router.put(
  '/me/categories',
  authenticate,
  requireRole(ROLES.COMPANY_MANAGER),
  validate({ body: updateCategoriesBody }),
  controller.updateMyCategories,
);
router.post(
  '/me/documents',
  authenticate,
  requireRole(ROLES.COMPANY_MANAGER),
  validate({ body: documentBody }),
  controller.upsertMyDocument,
);

module.exports = router;
