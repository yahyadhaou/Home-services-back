const { User, PushToken } = require('../../models');
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

// Upsert-by-hand rather than Sequelize's `upsert` — MySQL's upsert needs the
// unique key to be the primary key or handled via ON DUPLICATE KEY, and this
// keeps the intent (one row per user+token, re-registering is a no-op) obvious.
const registerPushToken = async (user, { token, platform }) => {
  const existing = await PushToken.findOne({ where: { userId: user.id, token } });
  if (existing) {
    if (platform && existing.platform !== platform) {
      existing.platform = platform;
      await existing.save();
    }
    return;
  }
  await PushToken.create({ userId: user.id, token, platform: platform || null });
};

const removePushToken = async (user, token) => {
  await PushToken.destroy({ where: { userId: user.id, token } });
};

module.exports = {
  updateMe, registerPushToken, removePushToken,
};
