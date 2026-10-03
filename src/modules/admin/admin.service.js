/**
 * Platform-owner view across every entity — the one module deliberately
 * allowed to bypass the "scoped to the caller's own company/profile"
 * pattern every other module follows (see companies.service.js,
 * workers.service.js, ...). Every handler here sits behind
 * `requireRole(ROLES.ADMIN)` in admin.routes.js, never reachable by a
 * regular account.
 *
 * "Suspend" is deliberately not a new status/column on companies or
 * independent_providers — it reuses `users.isActive`, the same flag
 * `auth.middleware.js` already checks on every request. Deactivating a
 * company's owner account locks that company out immediately without
 * inventing a second, parallel suspension concept.
 */
const { Op } = require('sequelize');
const {
  sequelize,
  User,
  Role,
  Company,
  IndependentProvider,
  Worker,
  ClientProfile,
  Booking,
  BookingStatus,
  Category,
  Payment,
  Review,
  ApplicationStatus,
  LegalForm,
  CompanyDocument,
  IndependentProviderDocument,
  DocumentType,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const { parsePagination, buildPaginatedResponse } = require('../../utils/pagination');
const { ROLES, PAYMENT_STATUS } = require('../../config/constants');

// ---- small shared lookups -------------------------------------------------

const statusIdMap = async (Model) => {
  const rows = await Model.findAll({ attributes: ['id', 'code'] });
  return rows.reduce((acc, row) => ({ ...acc, [row.code]: row.id }), {});
};

const roleIdFor = async (code) => {
  const role = await Role.findOne({ where: { code } });
  if (!role) throw ApiError.internal(`Role "${code}" is not seeded`);
  return role.id;
};

// ---- DTOs -------------------------------------------------------------

const toUserSummaryDTO = (user) => (user ? {
  id: user.uuid,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  isActive: user.isActive,
  emailVerifiedAt: user.emailVerifiedAt,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
} : null);

const toCompanySummaryDTO = (company) => ({
  id: company.uuid,
  legalName: company.legalName,
  city: company.city,
  postalCode: company.postalCode,
  applicationStatus: company.ApplicationStatus?.code,
  owner: toUserSummaryDTO(company.owner),
  workerCount: company.get('workerCount') !== undefined ? Number(company.get('workerCount')) : undefined,
  bookingCount: company.get('bookingCount') !== undefined ? Number(company.get('bookingCount')) : undefined,
  submittedAt: company.submittedAt,
  approvedAt: company.approvedAt,
  createdAt: company.createdAt,
});

// Deliberately never sends IBAN/BIC/bank name/account holder to the admin
// client — not even the already-masked IBAN — so there is nothing for the
// dashboard to display but "Confidential" and nothing sensitive sitting in
// a browser network tab. `payoutOnFile` is the only signal an admin gets:
// whether the company has submitted payout details at all.
const toPayoutSummary = (record) => ({
  payoutOnFile: Boolean(record.ibanEncrypted && record.bic && record.accountHolder),
  payoutConsentAt: record.payoutConsentAt,
});

const toCompanyDetailDTO = (company, { workers, documents, stats }) => ({
  ...toCompanySummaryDTO(company),
  street: company.street,
  legalForm: company.LegalForm?.code,
  commercialRegisterNumber: company.commercialRegisterNumber,
  registerCourt: company.registerCourt,
  representativeName: company.representativeName,
  representativeEmail: company.representativeEmail,
  representativePhone: company.representativePhone,
  taxNumber: company.taxNumber,
  vatId: company.vatId,
  hourlyRateFrom: company.hourlyRateFrom,
  vehicleType: company.vehicleType,
  vehicleMaxVolumeM3: company.vehicleMaxVolumeM3,
  longHaulCapable: company.longHaulCapable,
  crewSize: company.crewSize,
  isInsured: company.isInsured,
  ...toPayoutSummary(company),
  rejectedReason: company.rejectedReason,
  workers: workers.map(toWorkerSummaryDTO),
  documents: documents.map(toDocumentDTO),
  stats,
});

const toWorkerSummaryDTO = (worker) => ({
  id: worker.uuid,
  firstName: worker.User?.firstName,
  lastName: worker.User?.lastName,
  email: worker.User?.email,
  phone: worker.User?.phone,
  isActive: worker.User ? worker.User.isActive && !worker.deletedAt : undefined,
  isAvailable: worker.isAvailable,
  specialtyCategory: worker.specialtyCategory?.code,
  company: worker.Company ? { id: worker.Company.uuid, legalName: worker.Company.legalName } : undefined,
  joinedDate: worker.joinedDate,
  removedAt: worker.deletedAt ?? undefined,
});

const toIndependentSummaryDTO = (provider) => ({
  id: provider.uuid,
  businessName: provider.businessName,
  city: provider.city,
  postalCode: provider.postalCode,
  applicationStatus: provider.ApplicationStatus?.code,
  primaryCategory: provider.primaryCategory?.code,
  owner: toUserSummaryDTO(provider.User),
  bookingCount: provider.get('bookingCount') !== undefined ? Number(provider.get('bookingCount')) : undefined,
  submittedAt: provider.submittedAt,
  approvedAt: provider.approvedAt,
  createdAt: provider.createdAt,
});

const toIndependentDetailDTO = (provider, { documents, stats }) => ({
  ...toIndependentSummaryDTO(provider),
  street: provider.street,
  legalForm: provider.LegalForm?.code,
  taxNumber: provider.taxNumber,
  vatId: provider.vatId,
  hourlyRateFrom: provider.hourlyRateFrom,
  vehicleType: provider.vehicleType,
  vehicleMaxVolumeM3: provider.vehicleMaxVolumeM3,
  longHaulCapable: provider.longHaulCapable,
  crewSize: provider.crewSize,
  isInsured: provider.isInsured,
  ...toPayoutSummary(provider),
  rejectedReason: provider.rejectedReason,
  documents: documents.map(toDocumentDTO),
  stats,
});

const toDocumentDTO = (doc) => ({
  id: doc.id,
  type: doc.DocumentType?.code,
  fileUrl: doc.fileUrl,
  uploadedAt: doc.uploadedAt,
  verifiedAt: doc.verifiedAt,
});

const toClientSummaryDTO = (user) => ({
  ...toUserSummaryDTO(user),
  bookingCount: user.get('bookingCount') !== undefined ? Number(user.get('bookingCount')) : undefined,
});

const toBookingSummaryDTO = (booking) => ({
  id: booking.uuid,
  bookingNumber: booking.bookingNumber,
  status: booking.status?.code,
  category: booking.Category?.code,
  serviceLabel: booking.serviceLabel,
  providerType: booking.providerType,
  provider: booking.providerType === 'company'
    ? { id: booking.Company?.uuid, name: booking.Company?.legalName }
    : { id: booking.IndependentProvider?.uuid, name: booking.IndependentProvider?.businessName },
  client: booking.client ? { id: booking.client.uuid, name: `${booking.client.firstName} ${booking.client.lastName}` } : undefined,
  assignedWorker: booking.assignedWorker
    ? { id: booking.assignedWorker.uuid, name: `${booking.assignedWorker.User?.firstName} ${booking.assignedWorker.User?.lastName}` }
    : null,
  scheduledDate: booking.scheduledDate,
  scheduledTime: booking.scheduledTime,
  priceGross: booking.priceGross,
  providerEarningNet: booking.providerEarningNet,
  isEmergency: booking.isEmergency,
  createdAt: booking.createdAt,
});

const toPaymentDTO = (payment) => ({
  id: payment.uuid,
  booking: payment.Booking ? { id: payment.Booking.uuid, bookingNumber: payment.Booking.bookingNumber } : undefined,
  amountGross: payment.amountGross,
  currency: payment.currency,
  status: payment.status,
  method: payment.method || payment.PaymentMethod?.type,
  psp: payment.psp,
  processedAt: payment.processedAt,
  createdAt: payment.createdAt,
});

const toReviewDTO = (review) => ({
  id: review.uuid,
  rating: review.rating,
  comment: review.comment,
  providerResponse: review.providerResponse,
  client: review.client ? { id: review.client.uuid, name: `${review.client.firstName} ${review.client.lastName}` } : undefined,
  providerType: review.providerType,
  provider: review.providerType === 'company'
    ? { id: review.Company?.uuid, name: review.Company?.legalName }
    : { id: review.IndependentProvider?.uuid, name: review.IndependentProvider?.businessName },
  booking: review.Booking ? { id: review.Booking.uuid, bookingNumber: review.Booking.bookingNumber } : undefined,
  createdAt: review.createdAt,
});

// ---- overview -----------------------------------------------------------

const getOverview = async () => {
  const [appStatusIds, bookingStatusIds, clientRoleId] = await Promise.all([
    statusIdMap(ApplicationStatus),
    statusIdMap(BookingStatus),
    roleIdFor(ROLES.CLIENT),
  ]);

  const [
    clientCount,
    companyCounts,
    independentCounts,
    workerCount,
    bookingCounts,
    revenue,
    recentBookingsRaw,
  ] = await Promise.all([
    User.count({ where: { roleId: clientRoleId } }),
    Promise.all(
      Object.entries(appStatusIds).map(async ([code, id]) => [code, await Company.count({ where: { applicationStatusId: id } })]),
    ).then(Object.fromEntries),
    Promise.all(
      Object.entries(appStatusIds).map(async ([code, id]) => [code, await IndependentProvider.count({ where: { applicationStatusId: id } })]),
    ).then(Object.fromEntries),
    Worker.count(),
    Promise.all(
      Object.entries(bookingStatusIds).map(async ([code, id]) => [code, await Booking.count({ where: { statusId: id } })]),
    ).then(Object.fromEntries),
    Payment.sum('amountGross', { where: { status: PAYMENT_STATUS.SUCCEEDED } }),
    Booking.findAll({
      limit: 8,
      order: [['createdAt', 'DESC']],
      include: [
        { model: BookingStatus, as: 'status' },
        { model: Category },
        { model: Company, attributes: ['uuid', 'legalName'] },
        { model: IndependentProvider, attributes: ['uuid', 'businessName'] },
        { model: User, as: 'client', attributes: ['uuid', 'firstName', 'lastName'] },
        { model: Worker, as: 'assignedWorker', include: [{ model: User, attributes: ['firstName', 'lastName'] }] },
      ],
    }),
  ]);

  const completedGross = (await Booking.sum('priceGross', { where: { statusId: bookingStatusIds.completed } })) || 0;
  const completedNet = (await Booking.sum('providerEarningNet', { where: { statusId: bookingStatusIds.completed } })) || 0;

  return {
    counts: {
      clients: clientCount,
      companies: { total: Object.values(companyCounts).reduce((a, b) => a + b, 0), ...companyCounts },
      independents: { total: Object.values(independentCounts).reduce((a, b) => a + b, 0), ...independentCounts },
      workers: workerCount,
      bookings: { total: Object.values(bookingCounts).reduce((a, b) => a + b, 0), ...bookingCounts },
    },
    revenue: {
      totalCollected: revenue || 0,
      completedBookingsGross: completedGross,
      completedBookingsProviderNet: completedNet,
      platformEarnings: Number((completedGross - completedNet).toFixed(2)),
    },
    recentBookings: recentBookingsRaw.map(toBookingSummaryDTO),
  };
};

// ---- companies ------------------------------------------------------------

const listCompanies = async (query) => {
  const pagination = parsePagination(query);
  const where = {};
  if (query.status) {
    const ids = await statusIdMap(ApplicationStatus);
    where.applicationStatusId = ids[query.status];
  }
  if (query.search) {
    where[Op.or] = [
      { legalName: { [Op.like]: `%${query.search}%` } },
      { city: { [Op.like]: `%${query.search}%` } },
    ];
  }

  const { rows, count } = await Company.findAndCountAll({
    where,
    include: [
      { model: ApplicationStatus },
      { model: User, as: 'owner', attributes: ['uuid', 'firstName', 'lastName', 'email', 'phone', 'isActive'] },
    ],
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['createdAt', 'DESC']],
    distinct: true,
  });

  const withCounts = await Promise.all(rows.map(async (company) => {
    const [workerCount, bookingCount] = await Promise.all([
      Worker.count({ where: { companyId: company.id } }),
      Booking.count({ where: { companyId: company.id } }),
    ]);
    company.setDataValue('workerCount', workerCount);
    company.setDataValue('bookingCount', bookingCount);
    return company;
  }));

  return buildPaginatedResponse(withCounts.map(toCompanySummaryDTO), count, pagination);
};

const findCompanyOrThrow = async (uuid) => {
  const company = await Company.findOne({
    where: { uuid },
    include: [
      { model: ApplicationStatus },
      { model: LegalForm },
      { model: User, as: 'owner', attributes: ['uuid', 'firstName', 'lastName', 'email', 'phone', 'isActive', 'emailVerifiedAt', 'lastLoginAt', 'createdAt'] },
    ],
  });
  if (!company) throw ApiError.notFound('Company not found');
  return company;
};

const getCompanyDetail = async (uuid) => {
  const company = await findCompanyOrThrow(uuid);

  const [workers, documents, bookingCount, completedCount, grossSum, netSum] = await Promise.all([
    Worker.findAll({
      where: { companyId: company.id },
      paranoid: false,
      include: [
        { model: User, attributes: ['firstName', 'lastName', 'email', 'phone', 'isActive'] },
        { model: Category, as: 'specialtyCategory', attributes: ['code'] },
      ],
    }),
    CompanyDocument.findAll({ where: { companyId: company.id }, include: [{ model: DocumentType }] }),
    Booking.count({ where: { companyId: company.id } }),
    Booking.count({ where: { companyId: company.id }, include: [{ model: BookingStatus, as: 'status', where: { code: 'completed' } }] }),
    Booking.sum('priceGross', { where: { companyId: company.id } }),
    Booking.sum('providerEarningNet', { where: { companyId: company.id } }),
  ]);

  return toCompanyDetailDTO(company, {
    workers,
    documents,
    stats: {
      totalBookings: bookingCount,
      completedBookings: completedCount,
      totalGross: grossSum || 0,
      totalProviderNet: netSum || 0,
    },
  });
};

const setCompanyApplicationStatus = async (uuid, { status, rejectedReason }) => {
  const company = await findCompanyOrThrow(uuid);
  const ids = await statusIdMap(ApplicationStatus);
  company.applicationStatusId = ids[status];
  if (status === 'approved') {
    company.approvedAt = new Date();
    company.rejectedReason = null;
  } else {
    company.rejectedReason = rejectedReason;
  }
  await company.save();
  return getCompanyDetail(uuid);
};

// ---- independents -----------------------------------------------------

const findIndependentOrThrow = async (uuid) => {
  const provider = await IndependentProvider.findOne({
    where: { uuid },
    include: [
      { model: ApplicationStatus },
      { model: LegalForm },
      { model: Category, as: 'primaryCategory', attributes: ['code'] },
      { model: User, attributes: ['uuid', 'firstName', 'lastName', 'email', 'phone', 'isActive', 'emailVerifiedAt', 'lastLoginAt', 'createdAt'] },
    ],
  });
  if (!provider) throw ApiError.notFound('Independent provider not found');
  return provider;
};

const listIndependents = async (query) => {
  const pagination = parsePagination(query);
  const where = {};
  if (query.status) {
    const ids = await statusIdMap(ApplicationStatus);
    where.applicationStatusId = ids[query.status];
  }
  if (query.search) {
    where[Op.or] = [
      { businessName: { [Op.like]: `%${query.search}%` } },
      { city: { [Op.like]: `%${query.search}%` } },
    ];
  }

  const { rows, count } = await IndependentProvider.findAndCountAll({
    where,
    include: [
      { model: ApplicationStatus },
      { model: Category, as: 'primaryCategory', attributes: ['code'] },
      { model: User, attributes: ['uuid', 'firstName', 'lastName', 'email', 'phone', 'isActive'] },
    ],
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['createdAt', 'DESC']],
    distinct: true,
  });

  const withCounts = await Promise.all(rows.map(async (provider) => {
    const bookingCount = await Booking.count({ where: { independentProviderId: provider.id } });
    provider.setDataValue('bookingCount', bookingCount);
    return provider;
  }));

  return buildPaginatedResponse(withCounts.map(toIndependentSummaryDTO), count, pagination);
};

const getIndependentDetail = async (uuid) => {
  const provider = await findIndependentOrThrow(uuid);

  const [documents, bookingCount, completedCount, grossSum, netSum] = await Promise.all([
    IndependentProviderDocument.findAll({ where: { independentProviderId: provider.id }, include: [{ model: DocumentType }] }),
    Booking.count({ where: { independentProviderId: provider.id } }),
    Booking.count({ where: { independentProviderId: provider.id }, include: [{ model: BookingStatus, as: 'status', where: { code: 'completed' } }] }),
    Booking.sum('priceGross', { where: { independentProviderId: provider.id } }),
    Booking.sum('providerEarningNet', { where: { independentProviderId: provider.id } }),
  ]);

  return toIndependentDetailDTO(provider, {
    documents,
    stats: {
      totalBookings: bookingCount,
      completedBookings: completedCount,
      totalGross: grossSum || 0,
      totalProviderNet: netSum || 0,
    },
  });
};

const setIndependentApplicationStatus = async (uuid, { status, rejectedReason }) => {
  const provider = await findIndependentOrThrow(uuid);
  const ids = await statusIdMap(ApplicationStatus);
  provider.applicationStatusId = ids[status];
  if (status === 'approved') {
    provider.approvedAt = new Date();
    provider.rejectedReason = null;
  } else {
    provider.rejectedReason = rejectedReason;
  }
  await provider.save();
  return getIndependentDetail(uuid);
};

// ---- workers (cross-company) -------------------------------------------

const listWorkers = async (query) => {
  const pagination = parsePagination(query);
  const where = {};
  if (query.companyId) {
    const company = await Company.findOne({ where: { uuid: query.companyId } });
    if (!company) throw ApiError.notFound('Company not found');
    where.companyId = company.id;
  }

  const include = [
    { model: User, attributes: ['uuid', 'firstName', 'lastName', 'email', 'phone', 'isActive'] },
    { model: Company, attributes: ['uuid', 'legalName'] },
    { model: Category, as: 'specialtyCategory', attributes: ['code'] },
  ];
  if (query.search) {
    include[0].where = {
      [Op.or]: [
        { firstName: { [Op.like]: `%${query.search}%` } },
        { lastName: { [Op.like]: `%${query.search}%` } },
        { email: { [Op.like]: `%${query.search}%` } },
      ],
    };
  }

  const { rows, count } = await Worker.findAndCountAll({
    where,
    include,
    paranoid: false,
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['createdAt', 'DESC']],
    distinct: true,
  });

  return buildPaginatedResponse(rows.map(toWorkerSummaryDTO), count, pagination);
};

const getWorkerDetail = async (uuid) => {
  const worker = await Worker.findOne({
    where: { uuid },
    paranoid: false,
    include: [
      { model: User, attributes: ['uuid', 'firstName', 'lastName', 'email', 'phone', 'isActive', 'lastLoginAt', 'createdAt'] },
      { model: Company, attributes: ['uuid', 'legalName'] },
      { model: Category, as: 'specialtyCategory', attributes: ['code'] },
    ],
  });
  if (!worker) throw ApiError.notFound('Worker not found');

  const jobs = await Booking.findAll({
    where: { assignedWorkerId: worker.id },
    limit: 20,
    order: [['scheduledDate', 'DESC']],
    include: [
      { model: BookingStatus, as: 'status' },
      { model: Category },
      { model: Company, attributes: ['uuid', 'legalName'] },
      { model: IndependentProvider, attributes: ['uuid', 'businessName'] },
      { model: User, as: 'client', attributes: ['uuid', 'firstName', 'lastName'] },
    ],
  });

  return {
    ...toWorkerSummaryDTO(worker),
    email: worker.User?.email,
    lastLoginAt: worker.User?.lastLoginAt,
    createdAt: worker.User?.createdAt,
    recentJobs: jobs.map(toBookingSummaryDTO),
  };
};

// ---- clients ------------------------------------------------------------

const listClients = async (query) => {
  const pagination = parsePagination(query);
  const clientRoleId = await roleIdFor(ROLES.CLIENT);
  const where = { roleId: clientRoleId };
  if (query.search) {
    where[Op.or] = [
      { firstName: { [Op.like]: `%${query.search}%` } },
      { lastName: { [Op.like]: `%${query.search}%` } },
      { email: { [Op.like]: `%${query.search}%` } },
    ];
  }

  const { rows, count } = await User.findAndCountAll({
    where,
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['createdAt', 'DESC']],
  });

  const withCounts = await Promise.all(rows.map(async (user) => {
    const bookingCount = await Booking.count({ where: { clientId: user.id } });
    user.setDataValue('bookingCount', bookingCount);
    return user;
  }));

  return buildPaginatedResponse(withCounts.map(toClientSummaryDTO), count, pagination);
};

const getClientDetail = async (uuid) => {
  const clientRoleId = await roleIdFor(ROLES.CLIENT);
  const user = await User.findOne({ where: { uuid, roleId: clientRoleId } });
  if (!user) throw ApiError.notFound('Client not found');

  const [bookings, reviews, profile] = await Promise.all([
    Booking.findAll({
      where: { clientId: user.id },
      limit: 20,
      order: [['createdAt', 'DESC']],
      include: [
        { model: BookingStatus, as: 'status' },
        { model: Category },
        { model: Company, attributes: ['uuid', 'legalName'] },
        { model: IndependentProvider, attributes: ['uuid', 'businessName'] },
      ],
    }),
    Review.findAll({
      where: { clientId: user.id },
      limit: 20,
      order: [['createdAt', 'DESC']],
      include: [
        { model: Company, attributes: ['uuid', 'legalName'] },
        { model: IndependentProvider, attributes: ['uuid', 'businessName'] },
      ],
    }),
    ClientProfile.findOne({ where: { userId: user.id } }),
  ]);

  return {
    ...toUserSummaryDTO(user),
    hasProfile: !!profile,
    totalBookings: bookings.length,
    recentBookings: bookings.map(toBookingSummaryDTO),
    reviews: reviews.map(toReviewDTO),
  };
};

// ---- generic user activation (covers manager/worker/independent/client) --

const setUserActive = async (uuid, isActive) => {
  const user = await User.findOne({ where: { uuid }, include: [{ model: Role, as: 'role' }] });
  if (!user) throw ApiError.notFound('User not found');
  if (user.role.code === ROLES.ADMIN) throw ApiError.forbidden('Cannot change activation status of an admin account');

  user.isActive = isActive;
  await user.save();
  return toUserSummaryDTO(user);
};

// ---- bookings -------------------------------------------------------------

const bookingDetailInclude = [
  { model: BookingStatus, as: 'status' },
  { model: Category },
  { model: Company, attributes: ['uuid', 'legalName'] },
  { model: IndependentProvider, attributes: ['uuid', 'businessName'] },
  { model: User, as: 'client', attributes: ['uuid', 'firstName', 'lastName', 'email'] },
  { model: Worker, as: 'assignedWorker', include: [{ model: User, attributes: ['firstName', 'lastName'] }] },
];

const listBookings = async (query) => {
  const pagination = parsePagination(query);
  const where = {};
  if (query.providerType) where.providerType = query.providerType;
  if (query.search) {
    where[Op.or] = [
      { bookingNumber: { [Op.like]: `%${query.search}%` } },
      { serviceLabel: { [Op.like]: `%${query.search}%` } },
      { clientName: { [Op.like]: `%${query.search}%` } },
    ];
  }

  const include = [...bookingDetailInclude];
  if (query.status) {
    include[0] = { model: BookingStatus, as: 'status', where: { code: query.status } };
  }

  const { rows, count } = await Booking.findAndCountAll({
    where,
    include,
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['createdAt', 'DESC']],
    distinct: true,
  });

  return buildPaginatedResponse(rows.map(toBookingSummaryDTO), count, pagination);
};

const getBookingDetail = async (uuid) => {
  const booking = await Booking.findOne({
    where: { uuid },
    include: bookingDetailInclude,
  });
  if (!booking) throw ApiError.notFound('Booking not found');

  const [payments, review] = await Promise.all([
    Payment.findAll({ where: { bookingId: booking.id }, order: [['createdAt', 'DESC']] }),
    Review.findOne({ where: { bookingId: booking.id } }),
  ]);

  return {
    ...toBookingSummaryDTO(booking),
    address: { street: booking.addressStreet, postalCode: booking.addressPostalCode, city: booking.addressCity },
    isRecurring: booking.isRecurring,
    recurrenceFrequency: booking.recurrenceFrequency,
    cancelledAt: booking.cancelledAt,
    cancelledReason: booking.cancelledReason,
    payments: payments.map(toPaymentDTO),
    review: review ? toReviewDTO({
      ...review.toJSON(), client: booking.client, Company: booking.Company, IndependentProvider: booking.IndependentProvider, Booking: booking,
    }) : null,
  };
};

// ---- payments ---------------------------------------------------------

const listPayments = async (query) => {
  const pagination = parsePagination(query);
  const where = {};
  if (query.status) where.status = query.status;

  const { rows, count } = await Payment.findAndCountAll({
    where,
    include: [{ model: sequelize.models.Booking, attributes: ['uuid', 'bookingNumber'] }],
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['createdAt', 'DESC']],
  });

  return buildPaginatedResponse(rows.map(toPaymentDTO), count, pagination);
};

// ---- reviews ------------------------------------------------------------

const listReviews = async (query) => {
  const pagination = parsePagination(query);
  const where = {};
  if (query.providerType) where.providerType = query.providerType;

  const { rows, count } = await Review.findAndCountAll({
    where,
    include: [
      { model: User, as: 'client', attributes: ['uuid', 'firstName', 'lastName'] },
      { model: Company, attributes: ['uuid', 'legalName'] },
      { model: IndependentProvider, attributes: ['uuid', 'businessName'] },
      { model: Booking, attributes: ['uuid', 'bookingNumber'] },
    ],
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['createdAt', 'DESC']],
  });

  return buildPaginatedResponse(rows.map(toReviewDTO), count, pagination);
};

const deleteReview = async (uuid) => {
  const review = await Review.findOne({ where: { uuid } });
  if (!review) throw ApiError.notFound('Review not found');
  await review.destroy();
};

module.exports = {
  getOverview,
  listCompanies,
  getCompanyDetail,
  setCompanyApplicationStatus,
  listIndependents,
  getIndependentDetail,
  setIndependentApplicationStatus,
  listWorkers,
  getWorkerDetail,
  listClients,
  getClientDetail,
  setUserActive,
  listBookings,
  getBookingDetail,
  listPayments,
  listReviews,
  deleteReview,
};
