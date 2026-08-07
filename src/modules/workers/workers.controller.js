const service = require('./workers.service');

const listMyTeam = async (req, res) => {
  const workers = await service.listMyTeam(req.user.id);
  res.status(200).json({ success: true, data: { workers } });
};

const addWorker = async (req, res) => {
  const worker = await service.addWorker(req.user.id, req.body);
  res.status(201).json({ success: true, data: { worker } });
};

const updateWorker = async (req, res) => {
  const worker = await service.updateWorker(req.user.id, req.params.uuid, req.body);
  res.status(200).json({ success: true, data: { worker } });
};

const removeWorker = async (req, res) => {
  await service.removeWorker(req.user.id, req.params.uuid);
  res.status(204).send();
};

const getMe = async (req, res) => {
  const worker = await service.getMe(req.user.id);
  res.status(200).json({ success: true, data: { worker } });
};

const updateMyAvailability = async (req, res) => {
  const worker = await service.updateMyAvailability(req.user.id, req.body.isAvailable);
  res.status(200).json({ success: true, data: { worker } });
};

module.exports = {
  listMyTeam, addWorker, updateWorker, removeWorker, getMe, updateMyAvailability,
};
