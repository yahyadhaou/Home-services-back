/**
 * 1:1 extension of `users` for role = client. Deliberately thin today —
 * kept as its own table (rather than columns bolted onto `users`) so that
 * client-only fields never leak into the shape every other role shares,
 * and so it has somewhere to grow (loyalty tier, preferred providers, ...)
 * without another migration touching the core identity table.
 */
module.exports = (sequelize, DataTypes) => {
  const ClientProfile = sequelize.define(
    'ClientProfile',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
      defaultAddressId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'client_profiles',
      paranoid: false,
    },
  );

  ClientProfile.associate = (models) => {
    ClientProfile.belongsTo(models.User, { foreignKey: 'userId' });
    ClientProfile.belongsTo(models.Address, { foreignKey: 'defaultAddressId', as: 'defaultAddress' });
  };

  return ClientProfile;
};
