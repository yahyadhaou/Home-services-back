/**
 * The core booking/job lifecycle — see schema.sql's header comment on the
 * `bookings` table for why a client's "booking" and a provider's "job" are
 * modeled as one row. This service is the only code path in the app
 * allowed to create a booking, change its assignment, move it through
 * `booking_statuses`, or attach a completion report — every mutation here
 * goes through a transaction and (for status changes) appends a
 * `booking_status_history` row, so the audit trail can never fall out of
 * sync with the current state.
 */
const crypto = require('crypto');
const {
  sequelize,
  Booking,
  BookingStatus,
  BookingStatusHistory,
  BookingReport,
  BookingReportPhoto,
  Category,
  Company,
  IndependentProvider,
  Worker,
  User,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const { parsePagination, buildPaginatedResponse } = require('../../utils/pagination');
const {
  ROLES, BOOKING_STATUS, NOTIFICATION_TYPES, PLATFORM_FEE_RATE,
} = require('../../config/constants');
const { createNotification } = require('../notifications/notifications.service');

const generateBookingNumber = () => {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 hex chars
  return `JOB-${datePart}-${randomPart}`;
};

// A job only ever moves forward, one step at a time — see the comment on
// transitionStatusBody in bookings.validation.js for why "completed" isn't
// reachable through this map at all.
const ALLOWED_TRANSITIONS = {
  [BOOKING_STATUS.UPCOMING]: [BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.CANCELLED],
  [BOOKING_STATUS.IN_PROGRESS]: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED],
  [BOOKING_STATUS.COMPLETED]: [],
  [BOOKING_STATUS.CANCELLED]: [],
};

const detailInclude = [
  { model: BookingStatus, as: 'status' },
  { model: Category },
  { model: Company, attributes: ['uuid', 'legalName'] },
  { model: IndependentProvider, attributes: ['uuid', 'businessName'] },
  { model: Worker, as: 'assignedWorker', include: [{ model: User, attributes: ['firstName', 'lastName'] }] },
  {
    model: BookingReport,
    include: [{ model: BookingReportPhoto }],
  },
];

const toBookingDTO = (booking, { includeReport = false } = {}) => {
  const dto = {
    id: booking.uuid,
    bookingNumber: booking.bookingNumber,
    category: booking.Category
      ? { code: booking.Category.code, nameDe: booking.Category.nameDe, nameEn: booking.Category.nameEn }
      : undefined,
    serviceLabel: booking.serviceLabel,
    providerType: booking.providerType,
    provider:
      booking.providerType === 'company'
        ? { id: booking.Company?.uuid, name: booking.Company?.legalName }
        : { id: booking.IndependentProvider?.uuid, name: booking.IndependentProvider?.businessName },
    assignedWorker: booking.assignedWorker
      ? {
        id: booking.assignedWorker.uuid,
        firstName: booking.assignedWorker.User.firstName,
        lastName: booking.assignedWorker.User.lastName,
      }
      : null,
    clientName: booking.clientName,
    clientPhone: booking.clientPhone,
    address: {
      street: booking.addressStreet,
      postalCode: booking.addressPostalCode,
      city: booking.addressCity,
    },
    scheduledDate: booking.scheduledDate,
    scheduledTime: booking.scheduledTime,
    status: booking.status?.code,
    pricing: {
      priceGross: booking.priceGross,
      platformFeeRate: booking.platformFeeRate,
      providerEarningNet: booking.providerEarningNet,
    },
    isRecurring: booking.isRecurring,
    recurrenceFrequency: booking.recurrenceFrequency,
    isEmergency: booking.isEmergency,
    cancelledAt: booking.cancelledAt,
    cancelledReason: booking.cancelledReason,
    createdAt: booking.createdAt,
  };

  if (includeReport && booking.BookingReport) {
    dto.report = {
      materialsUsed: booking.BookingReport.materialsUsed,
      remarks: booking.BookingReport.remarks,
      additionalInfo: booking.BookingReport.additionalInfo,
      submittedAt: booking.BookingReport.submittedAt,
      updatedAt: booking.BookingReport.updatedAt,
      photos: (booking.BookingReport.BookingReportPhotos || []).map((p) => ({
        id: p.id,
        photoUrl: p.photoUrl,
        caption: p.caption,
        uploadedAt: p.uploadedAt,
      })),
    };
  }

  return dto;
};

/**
 * Every accessor of a single booking funnels through here — resolves who,
 * in terms of this specific booking, the caller is allowed to be, and
 * throws 404 (never 403) on a mismatch so a client can't distinguish
 * "doesn't exist" from "exists but isn't yours" by probing UUIDs.
 */
const findAccessibleBookingOrThrow = async (user, roleCode, uuid) => {
  const booking = await Booking.findOne({ where: { uuid }, include: detailInclude });
  if (!booking) throw ApiError.notFound('Booking not found');

  let allowed = false;
  if (roleCode === ROLES.CLIENT) {
    allowed = booking.clientId === user.id;
  } else if (roleCode === ROLES.COMPANY_MANAGER) {
    const company = await Company.findOne({ where: { ownerUserId: user.id } });
    allowed = !!company && booking.companyId === company.id;
  } else if (roleCode === ROLES.COMPANY_WORKER) {
    const worker = await Worker.findOne({ where: { userId: user.id } });
    allowed = !!worker && booking.assignedWorkerId === worker.id;
  } else if (roleCode === ROLES.INDEPENDENT_PROVIDER) {
    const provider = await IndependentProvider.findOne({ where: { userId: user.id } });
    allowed = !!provider && booking.independentProviderId === provider.id;
  }

  if (!allowed) throw ApiError.notFound('Booking not found');
  return booking;
};

const notifyOnCreate = async (booking, { companyId, independentProviderId, assignedWorkerId }) => {
  if (assignedWorkerId) {
    const worker = await Worker.findByPk(assignedWorkerId);
    await createNotification({
      userId: worker.userId,
      typeCode: NOTIFICATION_TYPES.JOB_ASSIGNED,
      relatedBookingId: booking.id,
      title: 'New job assigned',
      message: `You've been assigned to "${booking.serviceLabel}" on ${booking.scheduledDate}.`,
    });
  } else if (companyId) {
    const company = await Company.findByPk(companyId);
    await createNotification({
      userId: company.ownerUserId,
      typeCode: NOTIFICATION_TYPES.NEW_JOB,
      relatedBookingId: booking.id,
      title: 'New job',
      message: `A new job "${booking.serviceLabel}" needs a worker assigned.`,
    });
  } else if (independentProviderId) {
    const provider = await IndependentProvider.findByPk(independentProviderId);
    await createNotification({
      userId: provider.userId,
      typeCode: NOTIFICATION_TYPES.NEW_JOB,
      relatedBookingId: booking.id,
      title: 'New booking',
      message: `You have a new booking for "${booking.serviceLabel}" on ${booking.scheduledDate}.`,
    });
  }
};

const createBooking = async (user, roleCode, payload) => {
  if (![ROLES.CLIENT, ROLES.COMPANY_MANAGER].includes(roleCode)) {
    throw ApiError.forbidden('Only clients and company managers can create a booking');
  }
  if (roleCode === ROLES.COMPANY_MANAGER && payload.providerType !== 'company') {
    throw ApiError.badRequest('A company manager can only create bookings for their own company');
  }

  const category = await Category.findOne({ where: { code: payload.categoryCode } });
  if (!category) throw ApiError.badRequest(`Unknown category: "${payload.categoryCode}"`);

  const upcomingStatus = await BookingStatus.findOne({ where: { code: BOOKING_STATUS.UPCOMING } });

  let clientId;
  let clientName;
  let clientPhone;
  let companyId = null;
  let independentProviderId = null;
  let assignedWorkerId = null;

  if (roleCode === ROLES.CLIENT) {
    clientId = user.id;
    clientName = `${user.firstName} ${user.lastName}`;
    clientPhone = payload.clientPhone || user.phone;
    if (!clientPhone) throw ApiError.badRequest('A contact phone number is required — add one to your profile or the request');

    if (payload.providerType === 'company') {
      const company = await Company.findOne({ where: { uuid: payload.companyId } });
      if (!company) throw ApiError.notFound('Company not found');
      companyId = company.id;
      if (payload.assignedWorkerId) {
        const worker = await Worker.findOne({ where: { uuid: payload.assignedWorkerId, companyId: company.id } });
        if (!worker) throw ApiError.badRequest('Assigned worker does not belong to this company');
        assignedWorkerId = worker.id;
      }
    } else {
      const provider = await IndependentProvider.findOne({ where: { uuid: payload.independentProviderId } });
      if (!provider) throw ApiError.notFound('Independent provider not found');
      independentProviderId = provider.id;
    }
  } else {
    // COMPANY_MANAGER creating a job for a client they already have a
    // relationship with. The client must already hold an account — see
    // the comment on clientEmail in bookings.validation.js.
    if (!payload.clientEmail) throw ApiError.badRequest('clientEmail is required when a manager creates a booking');
    const clientUser = await User.findOne({ where: { email: payload.clientEmail.toLowerCase() } });
    if (!clientUser) throw ApiError.notFound('No client account found with that email');
    clientId = clientUser.id;
    clientName = payload.clientName || `${clientUser.firstName} ${clientUser.lastName}`;
    clientPhone = payload.clientPhone || clientUser.phone;
    if (!clientPhone) throw ApiError.badRequest('This client has no phone number on file — provide clientPhone');

    const company = await Company.findOne({ where: { ownerUserId: user.id } });
    if (!company) throw ApiError.notFound('No company profile found for this account');
    companyId = company.id;

    if (payload.assignedWorkerId) {
      const worker = await Worker.findOne({ where: { uuid: payload.assignedWorkerId, companyId: company.id } });
      if (!worker) throw ApiError.badRequest('Assigned worker does not belong to this company');
      assignedWorkerId = worker.id;
    }
  }

  const providerEarningNet = Number((payload.priceGross * (1 - PLATFORM_FEE_RATE)).toFixed(2));

  const booking = await sequelize.transaction(async (t) => {
    const created = await Booking.create(
      {
        uuid: crypto.randomUUID(),
        bookingNumber: generateBookingNumber(),
        clientId,
        categoryId: category.id,
        serviceLabel: payload.serviceLabel,
        providerType: payload.providerType,
        companyId,
        independentProviderId,
        assignedWorkerId,
        clientName,
        clientPhone,
        addressStreet: payload.addressStreet,
        addressPostalCode: payload.addressPostalCode,
        addressCity: payload.addressCity,
        scheduledDate: payload.scheduledDate,
        scheduledTime: payload.scheduledTime,
        statusId: upcomingStatus.id,
        priceGross: payload.priceGross,
        platformFeeRate: PLATFORM_FEE_RATE,
        providerEarningNet,
        isRecurring: !!payload.isRecurring,
        recurrenceFrequency: payload.recurrenceFrequency || null,
        isEmergency: !!payload.isEmergency,
      },
      { transaction: t },
    );

    await BookingStatusHistory.create(
      {
        bookingId: created.id,
        fromStatusId: null,
        toStatusId: upcomingStatus.id,
        changedByUserId: user.id,
        note: 'Booking created',
      },
      { transaction: t },
    );

    return created;
  });

  await notifyOnCreate(booking, { companyId, independentProviderId, assignedWorkerId });

  return toBookingDTO(await findAccessibleBookingOrThrow(user, roleCode, booking.uuid));
};

const list = async (user, roleCode, query) => {
  const pagination = parsePagination(query);
  const where = {};

  if (roleCode === ROLES.CLIENT) {
    where.clientId = user.id;
  } else if (roleCode === ROLES.COMPANY_MANAGER) {
    const company = await Company.findOne({ where: { ownerUserId: user.id } });
    if (!company) throw ApiError.notFound('No company profile found for this account');
    where.companyId = company.id;
    if (query.unassignedOnly === 'true') where.assignedWorkerId = null;
  } else if (roleCode === ROLES.COMPANY_WORKER) {
    const worker = await Worker.findOne({ where: { userId: user.id } });
    if (!worker) throw ApiError.notFound('Worker profile not found');
    where.assignedWorkerId = worker.id;
  } else if (roleCode === ROLES.INDEPENDENT_PROVIDER) {
    const provider = await IndependentProvider.findOne({ where: { userId: user.id } });
    if (!provider) throw ApiError.notFound('No independent provider profile found for this account');
    where.independentProviderId = provider.id;
  }

  if (query.status) {
    const status = await BookingStatus.findOne({ where: { code: query.status } });
    where.statusId = status?.id ?? -1;
  }

  const { rows, count } = await Booking.findAndCountAll({
    where,
    include: detailInclude,
    limit: pagination.limit,
    offset: pagination.offset,
    distinct: true,
    order: [
      ['scheduledDate', 'ASC'],
      ['scheduledTime', 'ASC'],
    ],
  });

  return buildPaginatedResponse(
    rows.map((b) => toBookingDTO(b)),
    count,
    pagination,
  );
};

const getByUuid = async (user, roleCode, uuid) => {
  const booking = await findAccessibleBookingOrThrow(user, roleCode, uuid);
  return toBookingDTO(booking, { includeReport: true });
};

const assignWorker = async (user, roleCode, uuid, workerUuid) => {
  if (roleCode !== ROLES.COMPANY_MANAGER) throw ApiError.forbidden('Only a company manager can assign a worker');

  const booking = await findAccessibleBookingOrThrow(user, roleCode, uuid);
  if (booking.providerType !== 'company') throw ApiError.badRequest('This booking is not fulfilled by a company');
  if ([BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED].includes(booking.status.code)) {
    throw ApiError.conflict('Cannot reassign a booking that is already finished or cancelled');
  }

  if (workerUuid === null) {
    booking.assignedWorkerId = null;
  } else {
    const company = await Company.findOne({ where: { ownerUserId: user.id } });
    const worker = await Worker.findOne({ where: { uuid: workerUuid, companyId: company.id } });
    if (!worker) throw ApiError.badRequest('Worker does not belong to this company');
    booking.assignedWorkerId = worker.id;
  }

  await booking.save();

  if (booking.assignedWorkerId) {
    const worker = await Worker.findByPk(booking.assignedWorkerId);
    await createNotification({
      userId: worker.userId,
      typeCode: NOTIFICATION_TYPES.JOB_ASSIGNED,
      relatedBookingId: booking.id,
      title: 'New job assigned',
      message: `You've been assigned to "${booking.serviceLabel}" on ${booking.scheduledDate}.`,
    });
  }

  return toBookingDTO(await findAccessibleBookingOrThrow(user, roleCode, uuid));
};

const reschedule = async (user, roleCode, uuid, { scheduledDate, scheduledTime }) => {
  if (![ROLES.COMPANY_MANAGER, ROLES.INDEPENDENT_PROVIDER].includes(roleCode)) {
    throw ApiError.forbidden('Only the provider can reschedule a booking');
  }

  const booking = await findAccessibleBookingOrThrow(user, roleCode, uuid);
  if (booking.status.code !== BOOKING_STATUS.UPCOMING) {
    throw ApiError.conflict('Only an upcoming booking can be rescheduled');
  }

  booking.scheduledDate = scheduledDate;
  booking.scheduledTime = scheduledTime;
  await booking.save();

  return toBookingDTO(await findAccessibleBookingOrThrow(user, roleCode, uuid));
};

const notifyOnCancel = async (booking, cancelledByRole) => {
  const message = `Booking "${booking.serviceLabel}" on ${booking.scheduledDate} was cancelled.`;

  if (cancelledByRole === ROLES.CLIENT) {
    if (booking.assignedWorkerId) {
      const worker = await Worker.findByPk(booking.assignedWorkerId);
      await createNotification({
        userId: worker.userId,
        typeCode: NOTIFICATION_TYPES.BOOKING_CANCELLED,
        relatedBookingId: booking.id,
        title: 'Booking cancelled',
        message,
      });
    } else if (booking.companyId) {
      const company = await Company.findByPk(booking.companyId);
      await createNotification({
        userId: company.ownerUserId,
        typeCode: NOTIFICATION_TYPES.BOOKING_CANCELLED,
        relatedBookingId: booking.id,
        title: 'Booking cancelled',
        message,
      });
    } else if (booking.independentProviderId) {
      const provider = await IndependentProvider.findByPk(booking.independentProviderId);
      await createNotification({
        userId: provider.userId,
        typeCode: NOTIFICATION_TYPES.BOOKING_CANCELLED,
        relatedBookingId: booking.id,
        title: 'Booking cancelled',
        message,
      });
    }
  } else {
    await createNotification({
      userId: booking.clientId,
      typeCode: NOTIFICATION_TYPES.BOOKING_CANCELLED,
      relatedBookingId: booking.id,
      title: 'Booking cancelled',
      message,
    });
  }
};

const cancel = async (user, roleCode, uuid, { reason }) => {
  if (![ROLES.CLIENT, ROLES.COMPANY_MANAGER, ROLES.INDEPENDENT_PROVIDER].includes(roleCode)) {
    throw ApiError.forbidden('You are not allowed to cancel this booking');
  }

  const booking = await findAccessibleBookingOrThrow(user, roleCode, uuid);
  if (booking.status.code !== BOOKING_STATUS.UPCOMING) {
    throw ApiError.conflict('Only an upcoming booking can be cancelled');
  }

  const cancelledStatus = await BookingStatus.findOne({ where: { code: BOOKING_STATUS.CANCELLED } });

  await sequelize.transaction(async (t) => {
    await BookingStatusHistory.create(
      {
        bookingId: booking.id,
        fromStatusId: booking.statusId,
        toStatusId: cancelledStatus.id,
        changedByUserId: user.id,
        note: reason || null,
      },
      { transaction: t },
    );

    booking.statusId = cancelledStatus.id;
    booking.cancelledAt = new Date();
    booking.cancelledReason = reason || null;
    booking.cancelledByUserId = user.id;
    await booking.save({ transaction: t });
  });

  await notifyOnCancel(booking, roleCode);

  return toBookingDTO(await findAccessibleBookingOrThrow(user, roleCode, uuid));
};

const transitionStatus = async (user, roleCode, uuid, statusCode) => {
  if (![ROLES.COMPANY_WORKER, ROLES.COMPANY_MANAGER, ROLES.INDEPENDENT_PROVIDER].includes(roleCode)) {
    throw ApiError.forbidden('You are not allowed to change this booking’s status');
  }

  const booking = await findAccessibleBookingOrThrow(user, roleCode, uuid);
  const currentCode = booking.status.code;
  const allowedNext = ALLOWED_TRANSITIONS[currentCode] || [];
  if (!allowedNext.includes(statusCode)) {
    throw ApiError.conflict(`Cannot move a booking from "${currentCode}" to "${statusCode}"`);
  }

  const nextStatus = await BookingStatus.findOne({ where: { code: statusCode } });

  await sequelize.transaction(async (t) => {
    await BookingStatusHistory.create(
      {
        bookingId: booking.id, fromStatusId: booking.statusId, toStatusId: nextStatus.id, changedByUserId: user.id,
      },
      { transaction: t },
    );
    booking.statusId = nextStatus.id;
    await booking.save({ transaction: t });
  });

  return toBookingDTO(await findAccessibleBookingOrThrow(user, roleCode, uuid));
};

/**
 * Submitting a report is how a job actually reaches "completed" — see the
 * comment on transitionStatusBody. Whether this counts as the completing
 * submission is driven by the booking's own status, not by whether a
 * BookingReport row already exists: addReportPhoto (below) can create an
 * empty report row on-site, before any remarks are written, so "a report
 * row exists" is not a safe proxy for "this job has already been marked
 * completed". Submitting again after completion is just an edit (matches
 * the mobile app's "edit completed job report" flow) — materialsUsed/
 * remarks/additionalInfo are replaced wholesale, no second transition.
 */
const submitReport = async (user, roleCode, uuid, payload) => {
  if (![ROLES.COMPANY_WORKER, ROLES.COMPANY_MANAGER, ROLES.INDEPENDENT_PROVIDER].includes(roleCode)) {
    throw ApiError.forbidden('You are not allowed to submit a report for this booking');
  }

  const booking = await findAccessibleBookingOrThrow(user, roleCode, uuid);
  const alreadyCompleted = booking.status.code === BOOKING_STATUS.COMPLETED;

  if (!alreadyCompleted && ![BOOKING_STATUS.UPCOMING, BOOKING_STATUS.IN_PROGRESS].includes(booking.status.code)) {
    throw ApiError.conflict('This booking is not in a state that can be completed');
  }

  const completedStatus = alreadyCompleted ? null : await BookingStatus.findOne({ where: { code: BOOKING_STATUS.COMPLETED } });

  await sequelize.transaction(async (t) => {
    const [report] = await BookingReport.findOrCreate({
      where: { bookingId: booking.id },
      defaults: { bookingId: booking.id, submittedAt: new Date() },
      transaction: t,
    });
    await report.update(
      {
        materialsUsed: payload.materialsUsed ?? report.materialsUsed,
        remarks: payload.remarks ?? report.remarks,
        additionalInfo: payload.additionalInfo ?? report.additionalInfo,
      },
      { transaction: t },
    );

    if (!alreadyCompleted) {
      await BookingStatusHistory.create(
        {
          bookingId: booking.id,
          fromStatusId: booking.statusId,
          toStatusId: completedStatus.id,
          changedByUserId: user.id,
          note: 'Report submitted',
        },
        { transaction: t },
      );
      booking.statusId = completedStatus.id;
      await booking.save({ transaction: t });
    }
  });

  if (!alreadyCompleted) {
    await createNotification({
      userId: booking.clientId,
      typeCode: NOTIFICATION_TYPES.REPORT_SUBMITTED,
      relatedBookingId: booking.id,
      title: 'Job completed',
      message: `Your booking "${booking.serviceLabel}" has been completed.`,
    });
  }

  return toBookingDTO(await findAccessibleBookingOrThrow(user, roleCode, uuid), { includeReport: true });
};

const addReportPhoto = async (user, roleCode, uuid, { photoUrl, caption }) => {
  if (![ROLES.COMPANY_WORKER, ROLES.COMPANY_MANAGER, ROLES.INDEPENDENT_PROVIDER].includes(roleCode)) {
    throw ApiError.forbidden('You are not allowed to add photos to this booking');
  }

  const booking = await findAccessibleBookingOrThrow(user, roleCode, uuid);

  const [report] = await BookingReport.findOrCreate({
    where: { bookingId: booking.id },
    defaults: { bookingId: booking.id, submittedAt: new Date() },
  });

  const photo = await BookingReportPhoto.create({ bookingReportId: report.id, photoUrl, caption: caption || null });
  return {
    id: photo.id, photoUrl: photo.photoUrl, caption: photo.caption, uploadedAt: photo.uploadedAt,
  };
};

const removeReportPhoto = async (user, roleCode, uuid, photoId) => {
  if (![ROLES.COMPANY_WORKER, ROLES.COMPANY_MANAGER, ROLES.INDEPENDENT_PROVIDER].includes(roleCode)) {
    throw ApiError.forbidden('You are not allowed to modify this booking’s report');
  }

  const booking = await findAccessibleBookingOrThrow(user, roleCode, uuid);
  const photo = await BookingReportPhoto.findOne({
    where: { id: photoId },
    include: [{ model: BookingReport, where: { bookingId: booking.id } }],
  });
  if (!photo) throw ApiError.notFound('Photo not found on this booking’s report');
  await photo.destroy();
};

module.exports = {
  createBooking,
  list,
  getByUuid,
  assignWorker,
  reschedule,
  cancel,
  transitionStatus,
  submitReport,
  addReportPhoto,
  removeReportPhoto,
};
