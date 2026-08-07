const service = require('./messages.service');

const listMine = async (req, res) => {
  const result = await service.listMine(req.user, req.userRole, req.query);
  res.status(200).json({ success: true, ...result });
};

const start = async (req, res) => {
  const conversation = await service.start(req.user, req.userRole, req.body);
  res.status(201).json({ success: true, data: { conversation } });
};

const listMessages = async (req, res) => {
  const result = await service.listMessages(req.user, req.userRole, req.params.uuid, req.query);
  res.status(200).json({ success: true, ...result });
};

const sendMessage = async (req, res) => {
  const message = await service.sendMessage(req.user, req.userRole, req.params.uuid, req.body.body);
  res.status(201).json({ success: true, data: { message } });
};

const markRead = async (req, res) => {
  await service.markRead(req.user, req.userRole, req.params.uuid);
  res.status(204).send();
};

module.exports = {
  listMine, start, listMessages, sendMessage, markRead,
};
