const { Op, literal } = require('sequelize');
const {
  IndependentProvider,
  ApplicationStatus,
  LegalForm,
  ProviderCategory,
  Category,
  DocumentType,
  IndependentProviderDocument,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const { parsePagination, buildPaginatedResponse } = require('../../utils/pagination');
const { APPLICATION_STATUS } = require('../../config/constants');
const { replaceProviderCategories } = require('../shared/providerCategories.service');
const {
  distanceKmLiteral, getAvgResponseMinutesByProvider, getRatingSummaryByProvider, getCompletedJobsCountByProvider,
} = require('../shared/providerMetrics.service');

const categoriesInclude = {
  model: ProviderCategory,
  include: [{ model: Category, attributes: ['code', 'nameDe', 'nameEn'] }],
};

/**
 * `distanceKm` is only present when the caller shared their own
 * coordinates (see listPublic); `avgResponseMinutes`/`ratingAvg`/
 * `reviewCount` are only present once real data exists to derive them
 * from — absent (`undefined`) rather than a made-up number otherwise.
 * `completedJobs` is always present (0 is a real, meaningful answer).
 */
const toPublicDTO = (provider, {
  avgResponseMinutes, ratingSummary, completedJobs,
} = {}) => {
  const distanceKm = provider.get ? provider.get('distanceKm') : undefined;
  return {
    id: provider.uuid,
    businessName: provider.businessName,
    street: provider.street,
    city: provider.city,
    postalCode: provider.postalCode,
    latitude: provider.latitude,
    longitude: provider.longitude,
    hourlyRateFrom: provider.hourlyRateFrom,
    vehicleType: provider.vehicleType ?? undefined,
    vehicleMaxVolumeM3: provider.vehicleMaxVolumeM3 ?? undefined,
    crewSize: provider.crewSize ?? undefined,
    isInsured: provider.isInsured ?? undefined,
    longHaulCapable: provider.longHaulCapable ?? undefined,
    distanceKm: distanceKm !== undefined && distanceKm !== null ? Number(Number(distanceKm).toFixed(1)) : undefined,
    avgResponseMinutes: avgResponseMinutes ?? undefined,
    ratingAvg: ratingSummary?.avgRating ?? undefined,
    reviewCount: ratingSummary?.reviewCount ?? undefined,
    completedJobs: completedJobs ?? 0,
    primaryCategory: provider.primaryCategory?.code,
    categories: (provider.ProviderCategories || []).map((pc) => pc.Category.code),
  };
};

const toOwnerDTO = (provider) => ({
  id: provider.uuid,
  businessName: provider.businessName,
  legalForm: provider.LegalForm?.code,
  street: provider.street,
  postalCode: provider.postalCode,
  city: provider.city,
  latitude: provider.latitude,
  longitude: provider.longitude,
  hourlyRateFrom: provider.hourlyRateFrom,
  vehicleType: provider.vehicleType,
  vehicleMaxVolumeM3: provider.vehicleMaxVolumeM3,
  crewSize: provider.crewSize,
  isInsured: provider.isInsured,
  longHaulCapable: provider.longHaulCapable,
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
    include: [{ model: ApplicationStatus }, { model: LegalForm }, { model: Category, as: 'primaryCategory' }, categoriesInclude],
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
  if (categoryCode) {
    // See companies.service.js's listPublic for why this is a separate
    // id-narrowing query rather than a `required: true` nested include —
    // that combination breaks under Sequelize's subQuery mode once
    // `limit` + `distinct` are also involved.
    const category = await Category.findOne({ where: { code: categoryCode } });
    const matchingIds = category
      ? (await ProviderCategory.findAll({
        where: { providerType: 'independent', categoryId: category.id },
        attributes: ['independentProviderId'],
      })).map((pc) => pc.independentProviderId)
      : [];
    where.id = { [Op.in]: matchingIds.length ? matchingIds : [-1] };
  }

  const include = [{ model: Category, as: 'primaryCategory', attributes: ['code'] }, categoriesInclude];
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

  const [avgResponseByProvider, ratingByProvider, completedJobsByProvider] = await Promise.all([
    getAvgResponseMinutesByProvider('independent'),
    getRatingSummaryByProvider('independent'),
    getCompletedJobsCountByProvider('independent'),
  ]);
  const dtos = rows.map((provider) => toPublicDTO(provider, {
    avgResponseMinutes: avgResponseByProvider.get(provider.id) ?? null,
    ratingSummary: ratingByProvider.get(provider.id) ?? null,
    completedJobs: completedJobsByProvider.get(provider.id) ?? 0,
  }));

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

  const [avgResponseByProvider, ratingByProvider, completedJobsByProvider] = await Promise.all([
    getAvgResponseMinutesByProvider('independent'),
    getRatingSummaryByProvider('independent'),
    getCompletedJobsCountByProvider('independent'),
  ]);
  return toPublicDTO(provider, {
    avgResponseMinutes: avgResponseByProvider.get(provider.id) ?? null,
    ratingSummary: ratingByProvider.get(provider.id) ?? null,
    completedJobs: completedJobsByProvider.get(provider.id) ?? 0,
  });
};

module.exports = {
  getMe, updateMe, updateMyCategories, upsertMyDocument, listPublic, getPublicByUuid, findOwnProviderOrThrow,
};
