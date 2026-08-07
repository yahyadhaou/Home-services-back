const { Op, literal } = require('sequelize');
const {
  IndependentProvider,
  ApplicationStatus,
  ProviderCategory,
  Category,
  DocumentType,
  IndependentProviderDocument,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const { parsePagination, buildPaginatedResponse } = require('../../utils/pagination');
const { APPLICATION_STATUS } = require('../../config/constants');
const { replaceProviderCategories } = require('../shared/providerCategories.service');
const { distanceKmLiteral, getAvgResponseMinutesByProvider } = require('../shared/providerMetrics.service');

const categoriesInclude = {
  model: ProviderCategory,
  include: [{ model: Category, attributes: ['code', 'nameDe', 'nameEn'] }],
};

/**
 * `distanceKm` is only present when the caller shared their own
 * coordinates (see listPublic); `avgResponseMinutes` is only present once
 * the provider has at least one real conversation to derive it from —
 * both are `undefined`/absent rather than a made-up number otherwise.
 */
const toPublicDTO = (provider, { avgResponseMinutes } = {}) => {
  const distanceKm = provider.get ? provider.get('distanceKm') : undefined;
  return {
    id: provider.uuid,
    businessName: provider.businessName,
    city: provider.city,
    postalCode: provider.postalCode,
    hourlyRateFrom: provider.hourlyRateFrom,
    distanceKm: distanceKm !== undefined && distanceKm !== null ? Number(Number(distanceKm).toFixed(1)) : undefined,
    avgResponseMinutes: avgResponseMinutes ?? undefined,
    primaryCategory: provider.primaryCategory?.code,
    categories: (provider.ProviderCategories || []).map((pc) => pc.Category.code),
  };
};

const toOwnerDTO = (provider) => ({
  id: provider.uuid,
  businessName: provider.businessName,
  street: provider.street,
  postalCode: provider.postalCode,
  city: provider.city,
  latitude: provider.latitude,
  longitude: provider.longitude,
  hourlyRateFrom: provider.hourlyRateFrom,
  taxNumber: provider.taxNumber,
  vatId: provider.vatId,
  accountHolder: provider.accountHolder,
  iban: provider.iban,
  bic: provider.bic,
  bankName: provider.bankName,
  applicationStatus: provider.ApplicationStatus?.code,
  rejectedReason: provider.rejectedReason,
  primaryCategory: provider.primaryCategory?.code,
  categories: (provider.ProviderCategories || []).map((pc) => pc.Category.code),
});

const findOwnProviderOrThrow = async (userId) => {
  const provider = await IndependentProvider.findOne({
    where: { userId },
    include: [{ model: ApplicationStatus }, { model: Category, as: 'primaryCategory' }, categoriesInclude],
  });
  if (!provider) throw ApiError.notFound('No independent provider profile found for this account');
  return provider;
};

const getMe = async (user) => toOwnerDTO(await findOwnProviderOrThrow(user.id));

const updateMe = async (user, patch) => {
  const provider = await findOwnProviderOrThrow(user.id);

  const {
    iban, bic, bankName, accountHolder, ...rest
  } = patch;
  Object.assign(provider, rest);

  const touchesPayout = iban !== undefined || bic !== undefined || bankName !== undefined || accountHolder !== undefined;
  if (iban !== undefined) provider.iban = iban;
  if (bic !== undefined) provider.bic = bic;
  if (bankName !== undefined) provider.bankName = bankName;
  if (accountHolder !== undefined) provider.accountHolder = accountHolder;
  if (touchesPayout) provider.payoutConsentAt = new Date();

  await provider.save();
  return toOwnerDTO(await findOwnProviderOrThrow(user.id));
};

const updateMyCategories = async (user, categoryCodes) => {
  const provider = await findOwnProviderOrThrow(user.id);
  await replaceProviderCategories({ providerType: 'independent', independentProviderId: provider.id, categoryCodes });
  return toOwnerDTO(await findOwnProviderOrThrow(user.id));
};

const upsertMyDocument = async (user, { documentTypeCode, fileUrl }) => {
  const provider = await findOwnProviderOrThrow(user.id);
  const documentType = await DocumentType.findOne({ where: { code: documentTypeCode } });
  if (!documentType) throw ApiError.badRequest(`Unknown document type: "${documentTypeCode}"`);

  const [document] = await IndependentProviderDocument.upsert(
    {
      independentProviderId: provider.id,
      documentTypeId: documentType.id,
      fileUrl,
      uploadedAt: new Date(),
      verifiedAt: null,
      verifiedByUserId: null,
    },
    { returning: true },
  );
  return { documentTypeCode, fileUrl: document.fileUrl, uploadedAt: document.uploadedAt };
};

const listPublic = async ({
  categoryCode, city, lat, lng, page, limit,
}) => {
  const pagination = parsePagination({ page, limit });
  const approved = await ApplicationStatus.findOne({ where: { code: APPLICATION_STATUS.APPROVED } });

  const where = { applicationStatusId: approved?.id ?? -1 };
  if (city) where.city = { [Op.like]: `%${city}%` };

  const include = [{ model: Category, as: 'primaryCategory', attributes: ['code'] }, categoriesInclude];
  if (categoryCode) {
    include[1] = {
      ...categoriesInclude,
      required: true,
      include: [{ model: Category, where: { code: categoryCode }, attributes: ['code', 'nameDe', 'nameEn'] }],
    };
  }

  const hasCoords = lat !== undefined && lng !== undefined;
  const attributes = hasCoords
    ? { include: [[distanceKmLiteral(lat, lng), 'distanceKm']] }
    : undefined;

  const { rows, count } = await IndependentProvider.findAndCountAll({
    where,
    include,
    attributes,
    limit: pagination.limit,
    offset: pagination.offset,
    distinct: true,
    order: hasCoords ? [[literal('distanceKm'), 'ASC']] : [['createdAt', 'DESC']],
  });

  const avgResponseByProvider = await getAvgResponseMinutesByProvider('independent');
  const dtos = rows.map((provider) => toPublicDTO(provider, { avgResponseMinutes: avgResponseByProvider.get(provider.id) ?? null }));

  return buildPaginatedResponse(dtos, count, pagination);
};

const getPublicByUuid = async (uuid, { lat, lng } = {}) => {
  const approved = await ApplicationStatus.findOne({ where: { code: APPLICATION_STATUS.APPROVED } });
  const hasCoords = lat !== undefined && lng !== undefined;

  const provider = await IndependentProvider.findOne({
    where: { uuid, applicationStatusId: approved?.id ?? -1 },
    include: [{ model: Category, as: 'primaryCategory', attributes: ['code'] }, categoriesInclude],
    attributes: hasCoords ? { include: [[distanceKmLiteral(lat, lng), 'distanceKm']] } : undefined,
  });
  if (!provider) throw ApiError.notFound('Independent provider not found');

  const avgResponseByProvider = await getAvgResponseMinutesByProvider('independent');
  return toPublicDTO(provider, { avgResponseMinutes: avgResponseByProvider.get(provider.id) ?? null });
};

module.exports = {
  getMe, updateMe, updateMyCategories, upsertMyDocument, listPublic, getPublicByUuid, findOwnProviderOrThrow,
};
