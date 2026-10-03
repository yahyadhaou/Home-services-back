const { Op, literal } = require('sequelize');
const {
  Company,
  ApplicationStatus,
  LegalForm,
  ProviderCategory,
  Category,
  DocumentType,
  CompanyDocument,
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
 * What the client-facing marketplace is allowed to see about a company.
 * `distanceKm` is only present when the caller shared their own
 * coordinates (see listPublic); `avgResponseMinutes`/`ratingAvg`/
 * `reviewCount` are only present once real data exists to derive them
 * from — absent (`undefined`) rather than a made-up number otherwise.
 * `completedJobs` is always present (0 is a real, meaningful answer).
 * `latitude`/`longitude`/`street` are exposed the same way any storefront
 * listing (Google/Yelp-style) shows a business address — not sensitive for
 * a registered company, and needed client-side to place a map pin.
 */
const toPublicDTO = (company, {
  avgResponseMinutes, ratingSummary, completedJobs,
} = {}) => {
  const distanceKm = company.get ? company.get('distanceKm') : undefined;
  return {
    id: company.uuid,
    legalName: company.legalName,
    street: company.street,
    city: company.city,
    postalCode: company.postalCode,
    latitude: company.latitude,
    longitude: company.longitude,
    hourlyRateFrom: company.hourlyRateFrom,
    vehicleType: company.vehicleType ?? undefined,
    vehicleMaxVolumeM3: company.vehicleMaxVolumeM3 ?? undefined,
    crewSize: company.crewSize ?? undefined,
    isInsured: company.isInsured ?? undefined,
    longHaulCapable: company.longHaulCapable ?? undefined,
    distanceKm: distanceKm !== undefined && distanceKm !== null ? Number(Number(distanceKm).toFixed(1)) : undefined,
    avgResponseMinutes: avgResponseMinutes ?? undefined,
    ratingAvg: ratingSummary?.avgRating ?? undefined,
    reviewCount: ratingSummary?.reviewCount ?? undefined,
    completedJobs: completedJobs ?? 0,
    categories: (company.ProviderCategories || []).map((pc) => pc.Category.code),
  };
};

/** Full detail, only ever returned to the company's own owner. */
const toOwnerDTO = (company) => ({
  id: company.uuid,
  legalName: company.legalName,
  legalForm: company.LegalForm?.code,
  commercialRegisterNumber: company.commercialRegisterNumber,
  registerCourt: company.registerCourt,
  street: company.street,
  postalCode: company.postalCode,
  city: company.city,
  latitude: company.latitude,
  longitude: company.longitude,
  hourlyRateFrom: company.hourlyRateFrom,
  vehicleType: company.vehicleType,
  vehicleMaxVolumeM3: company.vehicleMaxVolumeM3,
  crewSize: company.crewSize,
  isInsured: company.isInsured,
  longHaulCapable: company.longHaulCapable,
  representativeName: company.representativeName,
  representativeEmail: company.representativeEmail,
  representativePhone: company.representativePhone,
  taxNumber: company.taxNumber,
  vatId: company.vatId,
  accountHolder: company.accountHolder,
  iban: company.iban,
  bic: company.bic,
  bankName: company.bankName,
  applicationStatus: company.ApplicationStatus?.code,
  rejectedReason: company.rejectedReason,
  categories: (company.ProviderCategories || []).map((pc) => pc.Category.code),
});

const findOwnCompanyOrThrow = async (ownerUserId) => {
  const company = await Company.findOne({
    where: { ownerUserId },
    include: [{ model: ApplicationStatus }, { model: LegalForm }, categoriesInclude],
  });
  if (!company) throw ApiError.notFound('No company profile found for this account');
  return company;
};

const getMe = async (user) => toOwnerDTO(await findOwnCompanyOrThrow(user.id));

const updateMe = async (user, patch) => {
  const company = await findOwnCompanyOrThrow(user.id);

  const {
    iban, bic, bankName, accountHolder, ...rest
  } = patch;
  Object.assign(company, rest);

  const touchesPayout = iban !== undefined || bic !== undefined || bankName !== undefined || accountHolder !== undefined;
  if (iban !== undefined) company.iban = iban;
  if (bic !== undefined) company.bic = bic;
  if (bankName !== undefined) company.bankName = bankName;
  if (accountHolder !== undefined) company.accountHolder = accountHolder;
  if (touchesPayout) company.payoutConsentAt = new Date();

  await company.save();
  return toOwnerDTO(await findOwnCompanyOrThrow(user.id));
};

const updateMyCategories = async (user, categoryCodes) => {
  const company = await findOwnCompanyOrThrow(user.id);
  await replaceProviderCategories({ providerType: 'company', companyId: company.id, categoryCodes });
  return toOwnerDTO(await findOwnCompanyOrThrow(user.id));
};

const upsertMyDocument = async (user, { documentTypeCode, fileUrl }) => {
  const company = await findOwnCompanyOrThrow(user.id);
  const documentType = await DocumentType.findOne({ where: { code: documentTypeCode } });
  if (!documentType) throw ApiError.badRequest(`Unknown document type: "${documentTypeCode}"`);

  const [document] = await CompanyDocument.upsert(
    {
      companyId: company.id,
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
    // A `required: true` nested include here (instead of this separate
    // id-narrowing query) breaks under Sequelize's subQuery mode once
    // `limit` + `distinct` are also in play — it drops the join to
    // provider_categories entirely and produces invalid SQL referencing a
    // column that was never joined. Resolving matching ids up front avoids
    // that interaction, and categoriesInclude below stays a plain
    // (non-required) include so it can still return each company's full
    // category list, not just the one matched here.
    const category = await Category.findOne({ where: { code: categoryCode } });
    const matchingIds = category
      ? (await ProviderCategory.findAll({
        where: { providerType: 'company', categoryId: category.id },
        attributes: ['companyId'],
      })).map((pc) => pc.companyId)
      : [];
    where.id = { [Op.in]: matchingIds.length ? matchingIds : [-1] };
  }

  const include = [categoriesInclude];
  const hasCoords = lat !== undefined && lng !== undefined;
  const attributes = hasCoords
    ? { include: [[distanceKmLiteral(lat, lng), 'distanceKm']] }
    : undefined;
  const { rows, count } = await Company.findAndCountAll({
    where,
    include,
    attributes,
    limit: pagination.limit,
    offset: pagination.offset,
    distinct: true,
    order: hasCoords ? [[literal('distanceKm'), 'ASC']] : [['createdAt', 'DESC']],
  });

  const [avgResponseByCompany, ratingByCompany, completedJobsByCompany] = await Promise.all([
    getAvgResponseMinutesByProvider('company'),
    getRatingSummaryByProvider('company'),
    getCompletedJobsCountByProvider('company'),
  ]);
  const dtos = rows.map((company) => toPublicDTO(company, {
    avgResponseMinutes: avgResponseByCompany.get(company.id) ?? null,
    ratingSummary: ratingByCompany.get(company.id) ?? null,
    completedJobs: completedJobsByCompany.get(company.id) ?? 0,
  }));

  return buildPaginatedResponse(dtos, count, pagination);
};

const getPublicByUuid = async (uuid, { lat, lng } = {}) => {
  const approved = await ApplicationStatus.findOne({ where: { code: APPLICATION_STATUS.APPROVED } });
  const hasCoords = lat !== undefined && lng !== undefined;

  const company = await Company.findOne({
    where: { uuid, applicationStatusId: approved?.id ?? -1 },
    include: [categoriesInclude],
    attributes: hasCoords ? { include: [[distanceKmLiteral(lat, lng), 'distanceKm']] } : undefined,
  });
  if (!company) throw ApiError.notFound('Company not found');

  const [avgResponseByCompany, ratingByCompany, completedJobsByCompany] = await Promise.all([
    getAvgResponseMinutesByProvider('company'),
    getRatingSummaryByProvider('company'),
    getCompletedJobsCountByProvider('company'),
  ]);
  return toPublicDTO(company, {
    avgResponseMinutes: avgResponseByCompany.get(company.id) ?? null,
    ratingSummary: ratingByCompany.get(company.id) ?? null,
    completedJobs: completedJobsByCompany.get(company.id) ?? 0,
  });
};

module.exports = {
  getMe, updateMe, updateMyCategories, upsertMyDocument, listPublic, getPublicByUuid, findOwnCompanyOrThrow,
};
