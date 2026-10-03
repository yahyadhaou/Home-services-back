const service = require('./admin.service');

const getOverview = async (req, res) => {
  const overview = await service.getOverview();
  res.status(200).json({ success: true, data: overview });
};

const listCompanies = async (req, res) => {
  const result = await service.listCompanies(req.query);
  res.status(200).json({ success: true, ...result });
};

const getCompany = async (req, res) => {
  const company = await service.getCompanyDetail(req.params.uuid);
  res.status(200).json({ success: true, data: { company } });
};

const setCompanyStatus = async (req, res) => {
  const company = await service.setCompanyApplicationStatus(req.params.uuid, req.body);
  res.status(200).json({ success: true, data: { company } });
};

const listIndependents = async (req, res) => {
  const result = await service.listIndependents(req.query);
  res.status(200).json({ success: true, ...result });
};

const getIndependent = async (req, res) => {
  const provider = await service.getIndependentDetail(req.params.uuid);
  res.status(200).json({ success: true, data: { independent: provider } });
};

const setIndependentStatus = async (req, res) => {
  const provider = await service.setIndependentApplicationStatus(req.params.uuid, req.body);
  res.status(200).json({ success: true, data: { independent: provider } });
};

const listWorkers = async (req, res) => {
  const result = await service.listWorkers(req.query);
  res.status(200).json({ success: true, ...result });
};

const getWorker = async (req, res) => {
  const worker = await service.getWorkerDetail(req.params.uuid);
  res.status(200).json({ success: true, data: { worker } });
};

const listClients = async (req, res) => {
  const result = await service.listClients(req.query);
  res.status(200).json({ success: true, ...result });
};

const getClient = async (req, res) => {
  const client = await service.getClientDetail(req.params.uuid);
  res.status(200).json({ success: true, data: { client } });
};

const setUserActive = async (req, res) => {
  const user = await service.setUserActive(req.params.uuid, req.body.isActive);
  res.status(200).json({ success: true, data: { user } });
};

const listBookings = async (req, res) => {
  const result = await service.listBookings(req.query);
  res.status(200).json({ success: true, ...result });
};

const getBooking = async (req, res) => {
  const booking = await service.getBookingDetail(req.params.uuid);
  res.status(200).json({ success: true, data: { booking } });
};

const listPayments = async (req, res) => {
  const result = await service.listPayments(req.query);
  res.status(200).json({ success: true, ...result });
};

const listReviews = async (req, res) => {
  const result = await service.listReviews(req.query);
  res.status(200).json({ success: true, ...result });
};

const deleteReview = async (req, res) => {
  await service.deleteReview(req.params.uuid);
  res.status(204).send();
};

module.exports = {
  getOverview,
  listCompanies,
  getCompany,
  setCompanyStatus,
  listIndependents,
  getIndependent,
  setIndependentStatus,
  listWorkers,
  getWorker,
  listClients,
  getClient,
  setUserActive,
  listBookings,
  getBooking,
  listPayments,
  listReviews,
  deleteReview,
};
