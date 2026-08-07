const service = require('./independents.service');

const getMe = async (req, res) => {
  const provider = await service.getMe(req.user);
  res.status(200).json({ success: true, data: { provider } });
};

const updateMe = async (req, res) => {
  const provider = await service.updateMe(req.user, req.body);
  res.status(200).json({ success: true, data: { provider } });
};

const updateMyCategories = async (req, res) => {
  const provider = await service.updateMyCategories(req.user, req.body.categoryCodes);
  res.status(200).json({ success: true, data: { provider } });
};

const upsertMyDocument = async (req, res) => {
  const document = await service.upsertMyDocument(req.user, req.body);
  res.status(200).json({ success: true, data: { document } });
};

const listPublic = async (req, res) => {
  const result = await service.listPublic(req.query);
  res.status(200).json({ success: true, ...result });
};

const getPublicByUuid = async (req, res) => {
  const provider = await service.getPublicByUuid(req.params.uuid, req.query);
  res.status(200).json({ success: true, data: { provider } });
};

module.exports = {
  getMe, updateMe, updateMyCategories, upsertMyDocument, listPublic, getPublicByUuid,
};
