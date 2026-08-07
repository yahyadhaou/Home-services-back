const {
  sequelize, User, Role, Worker, Category, Company,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const { hashPassword } = require('../../utils/password');
const { ROLES } = require('../../config/constants');

const toWorkerDTO = (worker) => ({
  id: worker.uuid,
  firstName: worker.User.firstName,
  lastName: worker.User.lastName,
  email: worker.User.email,
  phone: worker.User.phone,
  specialtyCategory: worker.specialtyCategory?.code,
  isAvailable: worker.isAvailable,
  joinedDate: worker.joinedDate,
  isActive: !worker.deletedAt,
});

const workerInclude = [
  { model: User, attributes: ['firstName', 'lastName', 'email', 'phone'] },
  { model: Category, as: 'specialtyCategory', attributes: ['code', 'nameDe', 'nameEn'] },
];

const getOwnCompanyOrThrow = async (managerUserId) => {
  const company = await Company.findOne({ where: { ownerUserId: managerUserId } });
  if (!company) throw ApiError.notFound('No company profile found for this account');
  return company;
};

/**
 * Loads a worker AND verifies it belongs to the calling manager's company —
 * the ownership check the RBAC middleware deliberately leaves to the service layer.
 */
const findOwnedWorkerOrThrow = async (managerUserId, workerUuid) => {
  const company = await getOwnCompanyOrThrow(managerUserId);
  const worker = await Worker.findOne({ where: { uuid: workerUuid, companyId: company.id }, include: workerInclude });
  if (!worker) throw ApiError.notFound('Worker not found on this company');
  return worker;
};

const listMyTeam = async (managerUserId) => {
  const company = await getOwnCompanyOrThrow(managerUserId);
  const workers = await Worker.findAll({ where: { companyId: company.id }, include: workerInclude, order: [['joinedDate', 'ASC']] });
  return workers.map(toWorkerDTO);
};

/**
 * "Add coworker" — a worker never self-registers; the manager creates the
 * login on their behalf. Company assignment always comes from the caller's
 * own company (never trusted from the request body), so a manager can
 * never add a worker onto someone else's team.
 */
const addWorker = async (managerUserId, payload) => {
  const company = await getOwnCompanyOrThrow(managerUserId);

  const existing = await User.findOne({ where: { email: payload.email.toLowerCase() } });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const [role, category] = await Promise.all([
    Role.findOne({ where: { code: ROLES.COMPANY_WORKER } }),
    Category.findOne({ where: { code: payload.specialtyCategoryCode } }),
  ]);
  if (!category) throw ApiError.badRequest(`Unknown category: "${payload.specialtyCategoryCode}"`);

  const passwordHash = await hashPassword(payload.password);

  const worker = await sequelize.transaction(async (t) => {
    const user = await User.create(
      {
        roleId: role.id,
        email: payload.email,
        passwordHash,
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone || null,
      },
      { transaction: t },
    );

    return Worker.create(
      {
        userId: user.id,
        companyId: company.id,
        specialtyCategoryId: category.id,
        joinedDate: new Date(),
      },
      { transaction: t },
    );
  });

  return toWorkerDTO(await findOwnedWorkerOrThrow(managerUserId, worker.uuid));
};

/** Manager-side edit: availability toggle and/or specialty reassignment. */
const updateWorker = async (managerUserId, workerUuid, patch) => {
  const worker = await findOwnedWorkerOrThrow(managerUserId, workerUuid);

  if (patch.isAvailable !== undefined) worker.isAvailable = patch.isAvailable;
  if (patch.specialtyCategoryCode !== undefined) {
    const category = await Category.findOne({ where: { code: patch.specialtyCategoryCode } });
    if (!category) throw ApiError.badRequest(`Unknown category: "${patch.specialtyCategoryCode}"`);
    worker.specialtyCategoryId = category.id;
  }

  await worker.save();
  return toWorkerDTO(await findOwnedWorkerOrThrow(managerUserId, workerUuid));
};

/**
 * "Remove from team" — soft delete only (Worker is `paranoid: true`).
 * bookings.assignedWorkerId keeps pointing at this row so completed jobs
 * still show who did the work; "assign to" pickers just filter out
 * anything with a non-null deletedAt.
 */
const removeWorker = async (managerUserId, workerUuid) => {
  const worker = await findOwnedWorkerOrThrow(managerUserId, workerUuid);
  await worker.destroy();
};

const getMe = async (workerUserId) => {
  const worker = await Worker.findOne({ where: { userId: workerUserId }, include: workerInclude });
  if (!worker) throw ApiError.notFound('Worker profile not found');
  return toWorkerDTO(worker);
};

const updateMyAvailability = async (workerUserId, isAvailable) => {
  const worker = await Worker.findOne({ where: { userId: workerUserId } });
  if (!worker) throw ApiError.notFound('Worker profile not found');
  worker.isAvailable = isAvailable;
  await worker.save();
  return getMe(workerUserId);
};

module.exports = {
  listMyTeam, addWorker, updateWorker, removeWorker, getMe, updateMyAvailability,
};
