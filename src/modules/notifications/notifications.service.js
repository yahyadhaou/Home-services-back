/**
 * `createNotification` is called from several other modules (bookings,
 * reviews, ...) whenever something happens that a specific user should be
 * told about — it lives here, rather than duplicated per caller, so
 * "notify the manager" always resolves the same way (see the comment on
 * notifications.userId in models/Notification.js). The list/read-state
 * endpoints built on top of this in notifications.controller.js are what
 * the app's Notifications screen actually calls.
 */
const { Notification, NotificationType } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { parsePagination, buildPaginatedResponse } = require('../../utils/pagination');

const createNotification = async ({
  userId, typeCode, relatedBookingId = null, title, message,
}) => {
  const type = await NotificationType.findOne({ where: { code: typeCode } });
  if (!type) throw ApiError.badRequest(`Unknown notification type: "${typeCode}"`);

  return Notification.create({
    userId,
    notificationTypeId: type.id,
    relatedBookingId,
    title,
    message,
  });
};

const toDTO = (notification) => ({
  id: notification.uuid,
  type: notification.NotificationType?.code,
  relatedBookingId: notification.relatedBookingId,
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
    include: [{ model: NotificationType }],
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['createdAt', 'DESC']],
  });

  return buildPaginatedResponse(rows.map(toDTO), count, pagination);
};

const unreadCount = async (user) => Notification.count({ where: { userId: user.id, isRead: false } });

const markRead = async (user, uuid) => {
  const notification = await Notification.findOne({ where: { uuid, userId: user.id }, include: [{ model: NotificationType }] });
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
