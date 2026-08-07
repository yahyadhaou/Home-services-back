const service = require('./notifications.service');

const list = async (req, res) => {
  const result = await service.list(req.user, req.query);
  res.status(200).json({ success: true, ...result });
};

const unreadCount = async (req, res) => {
  const count = await service.unreadCount(req.user);
  res.status(200).json({ success: true, data: { count } });
};

const markRead = async (req, res) => {
  const notification = await service.markRead(req.user, req.params.uuid);
  res.status(200).json({ success: true, data: { notification } });
};

const markAllRead = async (req, res) => {
  await service.markAllRead(req.user);
  res.status(204).send();
};

module.exports = {
  list, unreadCount, markRead, markAllRead,
};
