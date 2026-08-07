const usersService = require('./users.service');

const updateMe = async (req, res) => {
  const user = await usersService.updateMe(req.user, req.userRole, req.body);
  res.status(200).json({ success: true, data: { user } });
};

module.exports = { updateMe };
