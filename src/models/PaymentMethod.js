/**
 * Tokenized reference to a payment instrument held by the PSP
 * (Stripe/Adyen-style). Only the last4/brand/expiry — display-safe
 * metadata a checkout page needs to render "Visa •••• 4242" — ever lands
 * here. The real card number never touches this database or this API;
 * that stays entirely within the PSP's PCI-compliant vault.
 */
module.exports = (sequelize, DataTypes) => {
  const PaymentMethod = sequelize.define(
    'PaymentMethod',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      uuid: {
        type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true,
      },
      userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      type: { type: DataTypes.ENUM('card', 'apple_pay'), allowNull: false },
      pspCustomerId: { type: DataTypes.STRING(255), allowNull: true },
      pspPaymentMethodId: { type: DataTypes.STRING(255), allowNull: true },
      brand: { type: DataTypes.STRING(32), allowNull: true },
      last4: { type: DataTypes.CHAR(4), allowNull: true },
      expMonth: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
      expYear: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: 'payment_methods',
      timestamps: true,
      updatedAt: false,
      paranoid: true,
      deletedAt: 'deleted_at',
    },
  );

  PaymentMethod.associate = (models) => {
    PaymentMethod.belongsTo(models.User, { foreignKey: 'userId' });
    PaymentMethod.hasMany(models.Payment, { foreignKey: 'paymentMethodId' });
  };

  return PaymentMethod;
};
