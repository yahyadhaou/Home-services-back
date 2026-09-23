/**
 * One row per payment attempt against a booking. This platform never holds
 * client funds directly — a PSP (Stripe-Connect-style) sits in between and
 * automatically splits out the platform fee, which is why this table only
 * tracks PSP references and status, not settlement logic. See
 * docs/ARCHITECTURE.md for why that split avoids needing a BaFin ZAG
 * payment-institution license.
 */
module.exports = (sequelize, DataTypes) => {
  const numericGetter = (field) => function get() {
    const raw = this.getDataValue(field);
    return raw === null || raw === undefined ? raw : Number(raw);
  };

  const Payment = sequelize.define(
    'Payment',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      uuid: {
        type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true,
      },
      bookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      paymentMethodId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      // Set for a one-off payment not backed by a saved PaymentMethod (cash-
      // on-completion, or a card/wallet charge the client chose not to
      // save). NULL when paymentMethodId is set — read the method from
      // there instead. See createPayment in payments.service.js.
      method: { type: DataTypes.ENUM('card', 'apple_pay', 'google_pay', 'cash'), allowNull: true },
      amountGross: { type: DataTypes.DECIMAL(10, 2), allowNull: false, get: numericGetter('amountGross') },
      currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'EUR' },
      status: {
        type: DataTypes.ENUM('pending', 'succeeded', 'failed', 'refunded'),
        allowNull: false,
        defaultValue: 'pending',
      },
      psp: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'stripe' },
      pspPaymentIntentId: { type: DataTypes.STRING(255), allowNull: true },
      pspChargeId: { type: DataTypes.STRING(255), allowNull: true },
      failureReason: { type: DataTypes.STRING(255), allowNull: true },
      processedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'payments',
      paranoid: false,
    },
  );

  Payment.associate = (models) => {
    Payment.belongsTo(models.Booking, { foreignKey: 'bookingId' });
    Payment.belongsTo(models.PaymentMethod, { foreignKey: 'paymentMethodId' });
  };

  return Payment;
};
