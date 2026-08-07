/**
 * Auth business logic — registration (all three public-facing roles),
 * login, refresh-token rotation, and logout. Nothing here talks HTTP;
 * auth.controller.js is the only thing that touches req/res.
 */
const crypto = require('crypto');
const {
  sequelize,
  User,
  Role,
  ClientProfile,
  Company,
  IndependentProvider,
  LegalForm,
  Category,
  ApplicationStatus,
  RefreshToken,
} = require('../../models');
const { hashPassword, verifyPassword } = require('../../utils/password');
const {
  signAccessToken, signRefreshToken, verifyRefreshToken, decodeToken,
} = require('../../utils/jwt');
const ApiError = require('../../utils/ApiError');
const { ROLES, APPLICATION_STATUS } = require('../../config/constants');

const hashToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex');

/** Resolves a lookup table row by `code`, or throws a clean 400 — never a raw FK violation. */
const findLookupOrThrow = async (Model, code, label) => {
  const row = await Model.findOne({ where: { code } });
  if (!row) throw ApiError.badRequest(`Unknown ${label}: "${code}"`);
  return row;
};

const toPublicUser = (user, roleCode) => ({
  id: user.uuid,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  role: roleCode,
  locale: user.locale,
});

/**
 * Signs a fresh access+refresh pair for a user and persists the refresh
 * token's hash so it can be looked up and revoked later. Returns the raw
 * (unhashed) refresh token — that's the only time it ever exists outside
 * the client's cookie jar.
 */
const issueTokenPair = async (user, roleCode, meta = {}) => {
  const accessToken = signAccessToken({ sub: user.id, role: roleCode });
  const refreshToken = signRefreshToken({ sub: user.id });
  const { exp } = decodeToken(refreshToken);

  await RefreshToken.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(exp * 1000),
    ipAddress: meta.ipAddress || null,
    userAgent: meta.userAgent || null,
  });

  return { accessToken, refreshToken };
};

const register = async (payload, meta) => {
  const existing = await User.findOne({ where: { email: payload.email.toLowerCase() } });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const role = await findLookupOrThrow(Role, payload.role, 'role');
  const passwordHash = await hashPassword(payload.password);

  const result = await sequelize.transaction(async (t) => {
    const user = await User.create(
      {
        roleId: role.id,
        email: payload.email,
        passwordHash,
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone || null,
        locale: payload.locale || 'de',
      },
      { transaction: t },
    );

    if (payload.role === ROLES.CLIENT) {
      await ClientProfile.create({ userId: user.id }, { transaction: t });
    }

    if (payload.role === ROLES.COMPANY_MANAGER) {
      const legalForm = await findLookupOrThrow(LegalForm, payload.company.legalFormCode, 'legal form');
      const pendingStatus = await findLookupOrThrow(ApplicationStatus, APPLICATION_STATUS.PENDING, 'application status');
      await Company.create(
        {
          ownerUserId: user.id,
          legalFormId: legalForm.id,
          applicationStatusId: pendingStatus.id,
          submittedAt: new Date(),
          legalName: payload.company.legalName,
          street: payload.company.street,
          postalCode: payload.company.postalCode,
          city: payload.company.city,
          representativeName: payload.company.representativeName,
          representativeEmail: payload.company.representativeEmail,
          representativePhone: payload.company.representativePhone || null,
          taxNumber: payload.company.taxNumber || null,
          vatId: payload.company.vatId || null,
        },
        { transaction: t },
      );
    }

    if (payload.role === ROLES.INDEPENDENT_PROVIDER) {
      const legalForm = await findLookupOrThrow(LegalForm, payload.independent.legalFormCode, 'legal form');
      const pendingStatus = await findLookupOrThrow(ApplicationStatus, APPLICATION_STATUS.PENDING, 'application status');
      let primaryCategoryId = null;
      if (payload.independent.primaryCategoryCode) {
        const category = await findLookupOrThrow(Category, payload.independent.primaryCategoryCode, 'category');
        primaryCategoryId = category.id;
      }
      await IndependentProvider.create(
        {
          userId: user.id,
          legalFormId: legalForm.id,
          applicationStatusId: pendingStatus.id,
          submittedAt: new Date(),
          primaryCategoryId,
          businessName: payload.independent.businessName,
          street: payload.independent.street,
          postalCode: payload.independent.postalCode,
          city: payload.independent.city,
          taxNumber: payload.independent.taxNumber || null,
          vatId: payload.independent.vatId || null,
        },
        { transaction: t },
      );
    }

    return user;
  });

  const tokens = await issueTokenPair(result, role.code, meta);
  return { user: toPublicUser(result, role.code), ...tokens };
};

const login = async ({ email, password }, meta) => {
  // `withPassword` opts back into the passwordHash column that User's
  // defaultScope hides everywhere else in the app.
  const user = await User.scope('withPassword').findOne({
    where: { email: email.toLowerCase() },
    include: [{ model: Role, as: 'role' }],
  });

  // Same error for "no such user" and "wrong password" — a distinct
  // message for the former would let an attacker enumerate registered
  // emails one guess at a time.
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) {
    throw ApiError.unauthorized('This account has been deactivated');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokenPair(user, user.role.code, meta);
  return { user: toPublicUser(user, user.role.code), ...tokens };
};

/**
 * Refresh-token rotation: every use of a refresh token issues a brand new
 * one and immediately revokes the old one. If a refresh token is ever
 * replayed after rotation (a strong signal it was stolen), it will no
 * longer match an active DB row and this throws — the legitimate user's
 * next real refresh attempt is what surfaces the compromise.
 */
const refresh = async (rawRefreshToken, meta) => {
  if (!rawRefreshToken) throw ApiError.unauthorized('Missing refresh token');

  let payload;
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const tokenHash = hashToken(rawRefreshToken);
  const stored = await RefreshToken.findOne({ where: { userId: payload.sub, tokenHash } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Refresh token is no longer valid');
  }

  const user = await User.findByPk(payload.sub, { include: [{ model: Role, as: 'role' }] });
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Account not found or deactivated');
  }

  stored.revokedAt = new Date();
  await stored.save();

  const tokens = await issueTokenPair(user, user.role.code, meta);
  return { user: toPublicUser(user, user.role.code), ...tokens };
};

const logout = async (rawRefreshToken) => {
  if (!rawRefreshToken) return;
  const tokenHash = hashToken(rawRefreshToken);
  await RefreshToken.update({ revokedAt: new Date() }, { where: { tokenHash, revokedAt: null } });
};

module.exports = {
  register, login, refresh, logout, toPublicUser,
};
