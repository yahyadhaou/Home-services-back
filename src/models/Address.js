module.exports = (sequelize, DataTypes) => {
  const Address = sequelize.define(
    'Address',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      uuid: {
        type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true,
      },
      userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      label: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'Zuhause' },
      street: { type: DataTypes.STRING(190), allowNull: false },
      postalCode: { type: DataTypes.STRING(10), allowNull: false },
      city: { type: DataTypes.STRING(100), allowNull: false },
      country: { type: DataTypes.CHAR(2), allowNull: false, defaultValue: 'DE' },
      phone: { type: DataTypes.STRING(32), allowNull: true },
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'addresses' },
  );

  Address.associate = (models) => {
    Address.belongsTo(models.User, { foreignKey: 'userId' });
    Address.hasOne(models.ClientProfile, { foreignKey: 'defaultAddressId' });
  };

  return Address;
};
