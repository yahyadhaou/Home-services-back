const { Op, literal } = require('sequelize');
const {
  Company,
  ApplicationStatus,
  ProviderCategory,
  Category,
  DocumentType,
  CompanyDocument,
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
 * What the client-facing marketplace is allowed to see about a company.
 * `distanceKm` is only present when the caller shared their own
 * coordinates (see listPublic); `avgResponseMinutes` is only present once
 * the company has at least one real conversation to derive it from —
 * both are `undefined`/absent rather than a made-up number otherwise.
 */
const toPublicDTO = (company, { avgResponseMinutes } = {}) => {
  const distanceKm = company.get ? company.get('distanceKm') : undefined;
  return {
    id: company.uuid,
    legalName: company.legalName,
    city: company.city,
    postalCode: company.postalCode,
    hourlyRateFrom: company.hourlyRateFrom,
    distanceKm: distanceKm !== undefined && distanceKm !== null ? Number(Number(distanceKm).toFixed(1)) : undefined,
    avgResponseMinutes: avgResponseMinutes ?? undefined,
    categories: (company.ProviderCategories || []).map((pc) => pc.Category.code),
  };
};

/** Full detail, only ever returned to the company's own owner. */
const toOwnerDTO = (company) => ({
  id: company.uuid,
  legalName: company.legalName,
  street: company.street,
  postalCode: company.postalCode,
  city: company.city,
  latitude: company.latitude,
  longitude: company.longitude,
  hourlyRateFrom: company.hourlyRateFrom,
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
    include: [{ model: ApplicationStatus }, categoriesInclude],
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

  const include = [categoriesInclude];
  if (categoryCode) {
    include[0] = {
      ...categoriesInclude,
      required: true,
      include: [{ model: Category, where: { code: categoryCode }, attributes: ['code', 'nameDe', 'nameEn'] }],
    };
  }

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

  const avgResponseByCompany = await getAvgResponseMinutesByProvider('company');
  const dtos = rows.map((company) => toPublicDTO(company, { avgResponseMinutes: avgResponseByCompany.get(company.id) ?? null }));

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

  const avgResponseByCompany = await getAvgResponseMinutesByProvider('company');
  return toPublicDTO(company, { avgResponseMinutes: avgResponseByCompany.get(company.id) ?? null });
};

module.exports = {
  getMe, updateMe, updateMyCategories, upsertMyDocument, listPublic, getPublicByUuid, findOwnCompanyOrThrow,
};
