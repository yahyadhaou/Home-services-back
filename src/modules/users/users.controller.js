const usersService = require('./users.service');

const updateMe = async (req, res) => {
  const user = await usersService.updateMe(req.user, req.userRole, req.body);
  res.status(200).json({ success: true, data: { user } });
};

const registerPushToken = async (req, res) => {
  await usersService.registerPushToken(req.user, req.body);
  res.status(200).json({ success: true, data: null });
};

const removePushToken = async (req, res) => {
  await usersService.removePushToken(req.user, req.body.token);
  res.status(200).json({ success: true, data: null });
};

module.exports = { updateMe, registerPushToken, removePushToken };
