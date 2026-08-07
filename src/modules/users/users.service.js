const { User } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { toPublicUser } = require('../auth/auth.service');

const updateMe = async (user, roleCode, patch) => {
  if (patch.email && patch.email.toLowerCase() !== user.email) {
    const clash = await User.findOne({ where: { email: patch.email.toLowerCase() } });
    if (clash) throw ApiError.conflict('An account with this email already exists');
    // A real deployment would re-send a verification email here and leave
    // emailVerifiedAt untouched until it's confirmed. Out of scope for this
    // build — flagged so it isn't mistaken for an oversight.
    user.emailVerifiedAt = null;
  }

  Object.assign(user, patch);
  await user.save();
  return toPublicUser(user, roleCode);
};

module.exports = { updateMe };
