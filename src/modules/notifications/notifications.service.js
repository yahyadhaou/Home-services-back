/**
 * `createNotification` is called from several other modules (bookings,
 * reviews, ...) whenever something happens that a specific user should be
 * told about — it lives here, rather than duplicated per caller, so
 * "notify the manager" always resolves the same way (see the comment on
 * notifications.userId in models/Notification.js). The list/read-state
 * endpoints built on top of this in notifications.controller.js are what
 * the app's Notifications screen actually calls.
 */
const { Expo } = require('expo-server-sdk');
const {
  Notification, NotificationType, PushToken, Booking,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const { parsePagination, buildPaginatedResponse } = require('../../utils/pagination');

const expo = new Expo();

// Fire-and-forget by design: a push delivery hiccup (expired token, Expo API
// outage, ...) must never fail the booking/assignment flow that's waiting on
// createNotification() to resolve — the DB row (source of truth for the
// in-app notification list) is already written by the time this runs.
// Dead-token pruning (DeviceNotRegistered receipts) is intentionally not
// implemented yet — failed sends are just logged.
const sendPushNotification = async (userId, { title, message, data }) => {
  try {
    const tokens = await PushToken.findAll({ where: { userId } });
    if (!tokens.length) return;

    const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t.token));
    if (!validTokens.length) return;

    const messages = validTokens.map((t) => ({
      to: t.token,
      title,
      body: message,
      data,
      sound: 'default',
    }));

    const chunks = expo.chunkPushNotifications(messages);
    await Promise.all(chunks.map((chunk) => expo.sendPushNotificationsAsync(chunk)));
  } catch (err) {
    logger.warn('Failed to send push notification', { userId, error: err.message });
  }
};

const createNotification = async ({
  userId, typeCode, relatedBookingId = null, title, message,
}) => {
  const type = await NotificationType.findOne({ where: { code: typeCode } });
  if (!type) throw ApiError.badRequest(`Unknown notification type: "${typeCode}"`);

  const notification = await Notification.create({
    userId,
    notificationTypeId: type.id,
    relatedBookingId,
    title,
    message,
  });

  // The push payload must carry the booking's public uuid (what
  // GET /bookings/:uuid expects), never the internal bigint FK stored in
  // relatedBookingId — that FK exists for the Notification.belongsTo(Booking)
  // association, not for API consumers.
  const booking = relatedBookingId ? await Booking.findByPk(relatedBookingId, { attributes: ['uuid'] }) : null;
  sendPushNotification(userId, {
    title,
    message,
    data: { notificationId: notification.uuid, bookingId: booking?.uuid, type: typeCode },
  });

  return notification;
};

const toDTO = (notification) => ({
  id: notification.uuid,
  type: notification.NotificationType?.code,
  relatedBookingId: notification.Booking?.uuid,
  title: notification.title,
  message: notification.message,
  isRead: notification.isRead,
  readAt: notification.readAt,
  createdAt: notification.createdAt,
});

const list = async (user, query) => {
  const pagination = parsePagination(query);
  const where = { userId: user.id };
  if (query.unreadOnly === 'true') where.isRead = false;

  const { rows, count } = await Notification.findAndCountAll({
    where,
    include: [{ model: NotificationType }, { model: Booking, attributes: ['uuid'] }],
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['createdAt', 'DESC']],
  });

  return buildPaginatedResponse(rows.map(toDTO), count, pagination);
};

const unreadCount = async (user) => Notification.count({ where: { userId: user.id, isRead: false } });

const markRead = async (user, uuid) => {
  const notification = await Notification.findOne({
    where: { uuid, userId: user.id },
    include: [{ model: NotificationType }, { model: Booking, attributes: ['uuid'] }],
  });
  if (!notification) throw ApiError.notFound('Notification not found');
  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }
  return toDTO(notification);
};

const markAllRead = async (user) => {
  await Notification.update({ isRead: true, readAt: new Date() }, { where: { userId: user.id, isRead: false } });
};

module.exports = {
  createNotification, list, unreadCount, markRead, markAllRead,
};
