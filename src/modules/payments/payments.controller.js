const service = require('./payments.service');

const createPayment = async (req, res) => {
  const payment = await service.createPayment(req.user, req.userRole, req.body);
  res.status(201).json({ success: true, data: { payment } });
};

const getForBooking = async (req, res) => {
  const payments = await service.getForBooking(req.user, req.userRole, req.params.bookingUuid);
  res.status(200).json({ success: true, data: { payments } });
};

const listMyMethods = async (req, res) => {
  const methods = await service.listMyMethods(req.user);
  res.status(200).json({ success: true, data: { methods } });
};

const addMethod = async (req, res) => {
  const method = await service.addMethod(req.user, req.body);
  res.status(201).json({ success: true, data: { method } });
};

const removeMethod = async (req, res) => {
  await service.removeMethod(req.user, req.params.uuid);
  res.status(204).send();
};

module.exports = {
  createPayment, getForBooking, listMyMethods, addMethod, removeMethod,
};
