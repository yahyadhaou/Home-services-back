const service = require('./reviews.service');

const create = async (req, res) => {
  const review = await service.create(req.user, req.userRole, req.body);
  res.status(201).json({ success: true, data: { review } });
};

const getForBooking = async (req, res) => {
  const review = await service.getForBooking(req.params.bookingUuid);
  res.status(200).json({ success: true, data: { review } });
};

const listForCompany = async (req, res) => {
  const result = await service.listForCompany(req.params.companyUuid, req.query);
  res.status(200).json({ success: true, ...result });
};

const listForIndependent = async (req, res) => {
  const result = await service.listForIndependent(req.params.providerUuid, req.query);
  res.status(200).json({ success: true, ...result });
};

const respond = async (req, res) => {
  const review = await service.respond(req.user, req.userRole, req.params.uuid, req.body.response);
  res.status(200).json({ success: true, data: { review } });
};

module.exports = {
  create, getForBooking, listForCompany, listForIndependent, respond,
};
