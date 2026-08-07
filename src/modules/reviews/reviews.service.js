const {
  Review, Booking, BookingStatus, Company, IndependentProvider,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const { parsePagination, buildPaginatedResponse } = require('../../utils/pagination');
const { ROLES, BOOKING_STATUS, NOTIFICATION_TYPES } = require('../../config/constants');
const { createNotification } = require('../notifications/notifications.service');

const toDTO = (review) => ({
  id: review.uuid,
  rating: review.rating,
  comment: review.comment,
  providerResponse: review.providerResponse,
  providerRespondedAt: review.providerRespondedAt,
  createdAt: review.createdAt,
});

const create = async (user, roleCode, { bookingId, rating, comment }) => {
  if (roleCode !== ROLES.CLIENT) throw ApiError.forbidden('Only a client can leave a review');

  const booking = await Booking.findOne({
    where: { uuid: bookingId, clientId: user.id },
    include: [{ model: BookingStatus, as: 'status' }],
  });
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.status.code !== BOOKING_STATUS.COMPLETED) throw ApiError.conflict('Only a completed booking can be reviewed');

  const existing = await Review.findOne({ where: { bookingId: booking.id } });
  if (existing) throw ApiError.conflict('This booking has already been reviewed');

  const review = await Review.create({
    bookingId: booking.id,
    clientId: user.id,
    providerType: booking.providerType,
    companyId: booking.companyId,
    independentProviderId: booking.independentProviderId,
    rating,
    comment: comment || null,
  });

  const recipientUserId = booking.providerType === 'company'
    ? (await Company.findByPk(booking.companyId)).ownerUserId
    : (await IndependentProvider.findByPk(booking.independentProviderId)).userId;

  await createNotification({
    userId: recipientUserId,
    typeCode: NOTIFICATION_TYPES.REVIEW_RECEIVED,
    relatedBookingId: booking.id,
    title: 'New review',
    message: `You received a ${rating}-star review for "${booking.serviceLabel}".`,
  });

  return toDTO(review);
};

const getForBooking = async (bookingUuid) => {
  const booking = await Booking.findOne({ where: { uuid: bookingUuid } });
  if (!booking) throw ApiError.notFound('Booking not found');
  const review = await Review.findOne({ where: { bookingId: booking.id } });
  return review ? toDTO(review) : null;
};

const listForProvider = async (providerType, providerId, query) => {
  const pagination = parsePagination(query);
  const where = providerType === 'company' ? { companyId: providerId } : { independentProviderId: providerId };

  // The average must be computed over every matching review, not just the
  // current page — a separate aggregate query, not a reduce() over `rows`.
  const [{ rows, count }, avgRatingRaw] = await Promise.all([
    Review.findAndCountAll({
      where, limit: pagination.limit, offset: pagination.offset, order: [['createdAt', 'DESC']],
    }),
    Review.aggregate('rating', 'avg', { where }),
  ]);

  const averageRating = avgRatingRaw !== null ? Number(Number(avgRatingRaw).toFixed(2)) : null;
  return { ...buildPaginatedResponse(rows.map(toDTO), count, pagination), summary: { averageRating, totalReviews: count } };
};

const listForCompany = async (companyUuid, query) => {
  const company = await Company.findOne({ where: { uuid: companyUuid } });
  if (!company) throw ApiError.notFound('Company not found');
  return listForProvider('company', company.id, query);
};

const listForIndependent = async (providerUuid, query) => {
  const provider = await IndependentProvider.findOne({ where: { uuid: providerUuid } });
  if (!provider) throw ApiError.notFound('Independent provider not found');
  return listForProvider('independent', provider.id, query);
};

const respond = async (user, roleCode, reviewUuid, response) => {
  const review = await Review.findOne({ where: { uuid: reviewUuid } });
  if (!review) throw ApiError.notFound('Review not found');

  if (roleCode === ROLES.COMPANY_MANAGER) {
    const company = await Company.findOne({ where: { ownerUserId: user.id } });
    if (!company || review.companyId !== company.id) throw ApiError.notFound('Review not found');
  } else if (roleCode === ROLES.INDEPENDENT_PROVIDER) {
    const provider = await IndependentProvider.findOne({ where: { userId: user.id } });
    if (!provider || review.independentProviderId !== provider.id) throw ApiError.notFound('Review not found');
  } else {
    throw ApiError.forbidden('Only the reviewed provider can respond');
  }

  review.providerResponse = response;
  review.providerRespondedAt = new Date();
  await review.save();
  return toDTO(review);
};

module.exports = {
  create, getForBooking, listForCompany, listForIndependent, respond,
};
