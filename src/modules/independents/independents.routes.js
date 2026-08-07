const { Router } = require('express');
const controller = require('./independents.controller');
const {
  updateMeBody, updateCategoriesBody, documentBody, listQuery, coordsQuery,
} = require('./independents.validation');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');
const { ROLES } = require('../../config/constants');

const router = Router();

router.get('/', validate({ query: listQuery }), controller.listPublic);
router.get('/:uuid', validate({ query: coordsQuery }), controller.getPublicByUuid);

router.get('/me/profile', authenticate, requireRole(ROLES.INDEPENDENT_PROVIDER), controller.getMe);
router.patch(
  '/me/profile',
  authenticate,
  requireRole(ROLES.INDEPENDENT_PROVIDER),
  validate({ body: updateMeBody }),
  controller.updateMe,
);
router.put(
  '/me/categories',
  authenticate,
  requireRole(ROLES.INDEPENDENT_PROVIDER),
  validate({ body: updateCategoriesBody }),
  controller.updateMyCategories,
);
router.post(
  '/me/documents',
  authenticate,
  requireRole(ROLES.INDEPENDENT_PROVIDER),
  validate({ body: documentBody }),
  controller.upsertMyDocument,
);

module.exports = router;
