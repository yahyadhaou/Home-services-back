const crypto = require('crypto');
const {
  Payment, PaymentMethod, Booking, Company, IndependentProvider,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const { ROLES } = require('../../config/constants');

const toPaymentDTO = (payment) => ({
  id: payment.uuid,
  amountGross: payment.amountGross,
  currency: payment.currency,
  status: payment.status,
  method: payment.method || payment.PaymentMethod?.type,
  psp: payment.psp,
  processedAt: payment.processedAt,
  createdAt: payment.createdAt,
});

const toMethodDTO = (method) => ({
  id: method.uuid,
  type: method.type,
  brand: method.brand,
  last4: method.last4,
  expMonth: method.expMonth,
  expYear: method.expYear,
  isDefault: method.isDefault,
});

/**
 * Charges the client for a booking. This platform intentionally never
 * touches a real card number (see models/PaymentMethod.js) — in a
 * production build this is the function that would create a PSP
 * PaymentIntent and return a client secret for the mobile SDK to confirm,
 * with the actual `succeeded`/`failed` transition arriving later via a
 * signed PSP webhook, not decided here. Since no PSP account is wired up
 * for this build, a card/apple_pay/google_pay charge is simulated as
 * succeeding immediately — clearly isolated in one place so swapping in
 * real Stripe/Adyen calls later touches only this function, not any caller
 * of it. Cash is not simulated as paid — it's genuinely owed until
 * collected in person, so it's recorded `pending` with no PSP involved.
 */
const createPayment = async (user, roleCode, {
  bookingId, paymentMethodId, method: oneOffMethod,
}) => {
  if (roleCode !== ROLES.CLIENT) throw ApiError.forbidden('Only a client can pay for a booking');

  const booking = await Booking.findOne({ where: { uuid: bookingId, clientId: user.id } });
  if (!booking) throw ApiError.notFound('Booking not found');

  const existing = await Payment.findOne({ where: { bookingId: booking.id, status: 'succeeded' } });
  if (existing) throw ApiError.conflict('This booking has already been paid');

  let savedMethod = null;
  if (paymentMethodId) {
    savedMethod = await PaymentMethod.findOne({ where: { uuid: paymentMethodId, userId: user.id } });
    if (!savedMethod) throw ApiError.badRequest('Payment method not found');
  }

  const resolvedMethod = savedMethod?.type || oneOffMethod;
  const isCash = resolvedMethod === 'cash';

  const payment = await Payment.create({
    bookingId: booking.id,
    paymentMethodId: savedMethod?.id || null,
    method: savedMethod ? null : oneOffMethod,
    amountGross: booking.priceGross,
    status: isCash ? 'pending' : 'succeeded', // simulated — see function comment
    psp: isCash ? 'cash' : 'simulated',
    pspPaymentIntentId: isCash ? null : `sim_${crypto.randomUUID()}`,
    processedAt: isCash ? null : new Date(),
  });

  return toPaymentDTO(payment);
};

const getForBooking = async (user, roleCode, bookingUuid) => {
  const booking = await Booking.findOne({ where: { uuid: bookingUuid } });
  if (!booking) throw ApiError.notFound('Booking not found');

  let isOwner = false;
  if (roleCode === ROLES.CLIENT) {
    isOwner = booking.clientId === user.id;
  } else if (roleCode === ROLES.COMPANY_MANAGER) {
    const company = await Company.findOne({ where: { ownerUserId: user.id } });
    isOwner = !!company && booking.companyId === company.id;
  } else if (roleCode === ROLES.INDEPENDENT_PROVIDER) {
    const provider = await IndependentProvider.findOne({ where: { userId: user.id } });
    isOwner = !!provider && booking.independentProviderId === provider.id;
  }
  if (!isOwner) throw ApiError.notFound('Booking not found');

  const payments = await Payment.findAll({
    where: { bookingId: booking.id },
    include: [{ model: PaymentMethod }],
    order: [['createdAt', 'DESC']],
  });
  return payments.map(toPaymentDTO);
};

const listMyMethods = async (user) => {
  const methods = await PaymentMethod.findAll({ where: { userId: user.id }, order: [['isDefault', 'DESC'], ['createdAt', 'DESC']] });
  return methods.map(toMethodDTO);
};

const addMethod = async (user, payload) => {
  if (payload.isDefault) {
    await PaymentMethod.update({ isDefault: false }, { where: { userId: user.id } });
  }
  const method = await PaymentMethod.create({ userId: user.id, ...payload });
  return toMethodDTO(method);
};

const removeMethod = async (user, uuid) => {
  const method = await PaymentMethod.findOne({ where: { uuid, userId: user.id } });
  if (!method) throw ApiError.notFound('Payment method not found');
  await method.destroy();
};

module.exports = {
  createPayment, getForBooking, listMyMethods, addMethod, removeMethod,
};
