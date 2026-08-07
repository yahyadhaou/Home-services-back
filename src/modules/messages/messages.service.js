const { Op } = require('sequelize');
const {
  sequelize, Conversation, Message, User, Company, IndependentProvider, Booking,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const { parsePagination, buildPaginatedResponse } = require('../../utils/pagination');
const { ROLES } = require('../../config/constants');

const conversationInclude = [
  { model: User, as: 'client', attributes: ['uuid', 'firstName', 'lastName'] },
  { model: Company, attributes: ['uuid', 'legalName'] },
  { model: IndependentProvider, attributes: ['uuid', 'businessName'] },
];

const toConversationDTO = (conversation) => ({
  id: conversation.uuid,
  providerType: conversation.providerType,
  client: { id: conversation.client.uuid, firstName: conversation.client.firstName, lastName: conversation.client.lastName },
  provider:
    conversation.providerType === 'company'
      ? { id: conversation.Company?.uuid, name: conversation.Company?.legalName }
      : { id: conversation.IndependentProvider?.uuid, name: conversation.IndependentProvider?.businessName },
  bookingId: conversation.bookingId,
  lastMessageAt: conversation.lastMessageAt,
  createdAt: conversation.createdAt,
});

const toMessageDTO = (message) => ({
  id: message.id,
  senderId: message.sender?.uuid,
  body: message.body,
  sentAt: message.sentAt,
  readAt: message.readAt,
});

/** Resolves which side of the conversation the caller is, or throws 404 — same "don't leak existence" rule as bookings. */
const findAccessibleConversationOrThrow = async (user, roleCode, uuid) => {
  const conversation = await Conversation.findOne({ where: { uuid }, include: conversationInclude });
  if (!conversation) throw ApiError.notFound('Conversation not found');

  let allowed = false;
  if (roleCode === ROLES.CLIENT) {
    allowed = conversation.clientId === user.id;
  } else if (roleCode === ROLES.COMPANY_MANAGER) {
    const company = await Company.findOne({ where: { ownerUserId: user.id } });
    allowed = !!company && conversation.companyId === company.id;
  } else if (roleCode === ROLES.INDEPENDENT_PROVIDER) {
    const provider = await IndependentProvider.findOne({ where: { userId: user.id } });
    allowed = !!provider && conversation.independentProviderId === provider.id;
  }

  if (!allowed) throw ApiError.notFound('Conversation not found');
  return conversation;
};

const listMine = async (user, roleCode, query) => {
  const pagination = parsePagination(query);
  const where = {};

  if (roleCode === ROLES.CLIENT) {
    where.clientId = user.id;
  } else if (roleCode === ROLES.COMPANY_MANAGER) {
    const company = await Company.findOne({ where: { ownerUserId: user.id } });
    if (!company) throw ApiError.notFound('No company profile found for this account');
    where.companyId = company.id;
  } else if (roleCode === ROLES.INDEPENDENT_PROVIDER) {
    const provider = await IndependentProvider.findOne({ where: { userId: user.id } });
    if (!provider) throw ApiError.notFound('No independent provider profile found for this account');
    where.independentProviderId = provider.id;
  } else {
    throw ApiError.forbidden('This role does not have a conversation inbox');
  }

  const { rows, count } = await Conversation.findAndCountAll({
    where,
    include: conversationInclude,
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['lastMessageAt', 'DESC']],
  });

  return buildPaginatedResponse(rows.map(toConversationDTO), count, pagination);
};

const start = async (user, roleCode, payload) => {
  if (roleCode !== ROLES.CLIENT) throw ApiError.forbidden('Only a client can start a conversation');

  let companyId = null;
  let independentProviderId = null;
  if (payload.providerType === 'company') {
    const company = await Company.findOne({ where: { uuid: payload.companyId } });
    if (!company) throw ApiError.notFound('Company not found');
    companyId = company.id;
  } else {
    const provider = await IndependentProvider.findOne({ where: { uuid: payload.independentProviderId } });
    if (!provider) throw ApiError.notFound('Independent provider not found');
    independentProviderId = provider.id;
  }

  let bookingId = null;
  if (payload.bookingId) {
    const booking = await Booking.findOne({ where: { uuid: payload.bookingId } });
    if (!booking) throw ApiError.notFound('Booking not found');
    bookingId = booking.id;
  }

  const [conversation] = await Conversation.findOrCreate({
    where: {
      clientId: user.id, providerType: payload.providerType, companyId, independentProviderId, bookingId,
    },
    defaults: { lastMessageAt: new Date() },
  });

  return toConversationDTO(await findAccessibleConversationOrThrow(user, roleCode, conversation.uuid));
};

const listMessages = async (user, roleCode, conversationUuid, query) => {
  const conversation = await findAccessibleConversationOrThrow(user, roleCode, conversationUuid);
  const pagination = parsePagination(query);

  const { rows, count } = await Message.findAndCountAll({
    where: { conversationId: conversation.id },
    include: [{ model: User, as: 'sender', attributes: ['uuid'] }],
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['sentAt', 'ASC']],
  });

  return buildPaginatedResponse(rows.map(toMessageDTO), count, pagination);
};

const sendMessage = async (user, roleCode, conversationUuid, body) => {
  const conversation = await findAccessibleConversationOrThrow(user, roleCode, conversationUuid);

  const message = await sequelize.transaction(async (t) => {
    const created = await Message.create({ conversationId: conversation.id, senderUserId: user.id, body }, { transaction: t });
    conversation.lastMessageAt = created.sentAt;
    await conversation.save({ transaction: t });
    return created;
  });

  return toMessageDTO(await Message.findByPk(message.id, { include: [{ model: User, as: 'sender', attributes: ['uuid'] }] }));
};

const markRead = async (user, roleCode, conversationUuid) => {
  const conversation = await findAccessibleConversationOrThrow(user, roleCode, conversationUuid);
  await Message.update(
    { readAt: new Date() },
    { where: { conversationId: conversation.id, senderUserId: { [Op.ne]: user.id }, readAt: null } },
  );
};

module.exports = {
  listMine, start, listMessages, sendMessage, markRead,
};
