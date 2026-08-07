const service = require('./bookings.service');

const create = async (req, res) => {
  const booking = await service.createBooking(req.user, req.userRole, req.body);
  res.status(201).json({ success: true, data: { booking } });
};

const list = async (req, res) => {
  const result = await service.list(req.user, req.userRole, req.query);
  res.status(200).json({ success: true, ...result });
};

const getByUuid = async (req, res) => {
  const booking = await service.getByUuid(req.user, req.userRole, req.params.uuid);
  res.status(200).json({ success: true, data: { booking } });
};

const assign = async (req, res) => {
  const booking = await service.assignWorker(req.user, req.userRole, req.params.uuid, req.body.workerId);
  res.status(200).json({ success: true, data: { booking } });
};

const reschedule = async (req, res) => {
  const booking = await service.reschedule(req.user, req.userRole, req.params.uuid, req.body);
  res.status(200).json({ success: true, data: { booking } });
};

const cancel = async (req, res) => {
  const booking = await service.cancel(req.user, req.userRole, req.params.uuid, req.body);
  res.status(200).json({ success: true, data: { booking } });
};

const transitionStatus = async (req, res) => {
  const booking = await service.transitionStatus(req.user, req.userRole, req.params.uuid, req.body.statusCode);
  res.status(200).json({ success: true, data: { booking } });
};

const submitReport = async (req, res) => {
  const booking = await service.submitReport(req.user, req.userRole, req.params.uuid, req.body);
  res.status(200).json({ success: true, data: { booking } });
};

const addReportPhoto = async (req, res) => {
  const photo = await service.addReportPhoto(req.user, req.userRole, req.params.uuid, req.body);
  res.status(201).json({ success: true, data: { photo } });
};

const removeReportPhoto = async (req, res) => {
  await service.removeReportPhoto(req.user, req.userRole, req.params.uuid, req.params.photoId);
  res.status(204).send();
};

module.exports = {
  create,
  list,
  getByUuid,
  assign,
  reschedule,
  cancel,
  transitionStatus,
  submitReport,
  addReportPhoto,
  removeReportPhoto,
};
