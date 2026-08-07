/**
 * Every human who can log in — clients, company managers, company workers,
 * independents, admins — one table, distinguished by roleId. Role-specific
 * data (bank details, business name, ...) lives in the 1:1 extension tables
 * (ClientProfile, Company, IndependentProvider, Worker), never bolted onto
 * this one, so `users` stays a clean identity record for every role alike.
 *
 * `passwordHash` is never included in `toJSON()` output — see the
 * `defaultScope` below — so a stray `res.json(user)` in a controller can
 * never leak it, even if a developer forgets `attributes: { exclude: [...] }`
 * on that particular query.
 */
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      uuid: {
        type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true,
      },
      roleId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
      email: {
        type: DataTypes.STRING(190),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
        set(value) {
          this.setDataValue('email', String(value).trim().toLowerCase());
        },
      },
      passwordHash: { type: DataTypes.STRING(255), allowNull: false },
      firstName: { type: DataTypes.STRING(100), allowNull: false },
      lastName: { type: DataTypes.STRING(100), allowNull: false },
      phone: { type: DataTypes.STRING(32), allowNull: true },
      locale: { type: DataTypes.CHAR(2), allowNull: false, defaultValue: 'de' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      emailVerifiedAt: { type: DataTypes.DATE, allowNull: true },
      lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'users',
      defaultScope: {
        attributes: { exclude: ['passwordHash'] },
      },
      scopes: {
        // Explicit opt-in for the one place that legitimately needs the
        // hash: the login/password-verification service.
        withPassword: { attributes: {} },
      },
    },
  );

  User.associate = (models) => {
    User.belongsTo(models.Role, { foreignKey: 'roleId', as: 'role' });
    User.hasOne(models.ClientProfile, { foreignKey: 'userId' });
    User.hasOne(models.Company, { foreignKey: 'ownerUserId', as: 'ownedCompany' });
    User.hasOne(models.IndependentProvider, { foreignKey: 'userId' });
    User.hasOne(models.Worker, { foreignKey: 'userId' });
    User.hasMany(models.Address, { foreignKey: 'userId' });
    User.hasMany(models.PaymentMethod, { foreignKey: 'userId' });
    User.hasMany(models.RefreshToken, { foreignKey: 'userId' });
    User.hasMany(models.PasswordResetToken, { foreignKey: 'userId' });
    User.hasMany(models.Booking, { foreignKey: 'clientId', as: 'bookingsAsClient' });
    User.hasMany(models.Notification, { foreignKey: 'userId' });
    User.hasMany(models.Message, { foreignKey: 'senderUserId' });
  };

  return User;
};
