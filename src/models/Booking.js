/**
 * The single source of truth for a service job. A client's "booking" and a
 * provider's "job" are the same row, viewed from two sides — see
 * schema.sql's header comment for the full rationale.
 *
 * Money columns come back from MySQL as strings (a Sequelize/mysql2 default
 * that avoids silent float-precision loss on the wire); the getters below
 * convert them to numbers at the point of use so callers get plain
 * `booking.priceGross === 89.5`, not `"89.50"` needing a parse everywhere it's used.
 */
module.exports = (sequelize, DataTypes) => {
  const numericGetter = (field) => function get() {
    const raw = this.getDataValue(field);
    return raw === null || raw === undefined ? raw : Number(raw);
  };

  const Booking = sequelize.define(
    'Booking',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      uuid: {
        type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true,
      },
      bookingNumber: { type: DataTypes.STRING(20), allowNull: false, unique: true },

      clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      categoryId: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
      serviceLabel: { type: DataTypes.STRING(190), allowNull: false },

      providerType: { type: DataTypes.ENUM('company', 'independent'), allowNull: false },
      companyId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      independentProviderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      assignedWorkerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },

      // Snapshotted at booking time — see schema.sql's comment on this table.
      clientName: { type: DataTypes.STRING(190), allowNull: false },
      clientPhone: { type: DataTypes.STRING(32), allowNull: false },
      addressStreet: { type: DataTypes.STRING(190), allowNull: false },
      addressPostalCode: { type: DataTypes.STRING(10), allowNull: false },
      addressCity: { type: DataTypes.STRING(100), allowNull: false },

      scheduledDate: { type: DataTypes.DATEONLY, allowNull: false },
      scheduledTime: { type: DataTypes.TIME, allowNull: false },

      statusId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },

      priceGross: { type: DataTypes.DECIMAL(10, 2), allowNull: false, get: numericGetter('priceGross') },
      platformFeeRate: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        get: numericGetter('platformFeeRate'),
        validate: { min: 0, max: 0.9999 },
      },
      providerEarningNet: { type: DataTypes.DECIMAL(10, 2), allowNull: false, get: numericGetter('providerEarningNet') },

      isRecurring: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      recurrenceFrequency: { type: DataTypes.ENUM('weekly', 'biweekly', 'monthly'), allowNull: true },
      isEmergency: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      cancelledAt: { type: DataTypes.DATE, allowNull: true },
      cancelledReason: { type: DataTypes.STRING(255), allowNull: true },
      cancelledByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'bookings',
      hooks: {
        // Belt-and-braces alongside the DB CHECK constraint in schema.sql:
        // failing fast here gives a clean 400 with a field name instead of
        // a raw SequelizeDatabaseError bubbling up from a CHECK violation.
        beforeValidate(booking) {
          if (booking.providerType === 'company') {
            booking.independentProviderId = null;
          } else if (booking.providerType === 'independent') {
            booking.companyId = null;
            booking.assignedWorkerId = null;
          }
        },
      },
    },
  );

  Booking.associate = (models) => {
    Booking.belongsTo(models.User, { foreignKey: 'clientId', as: 'client' });
    Booking.belongsTo(models.Category, { foreignKey: 'categoryId' });
    Booking.belongsTo(models.Company, { foreignKey: 'companyId' });
    Booking.belongsTo(models.IndependentProvider, { foreignKey: 'independentProviderId' });
    Booking.belongsTo(models.Worker, { foreignKey: 'assignedWorkerId', as: 'assignedWorker' });
    Booking.belongsTo(models.BookingStatus, { foreignKey: 'statusId', as: 'status' });
    Booking.belongsTo(models.User, { foreignKey: 'cancelledByUserId', as: 'cancelledBy' });
    Booking.hasMany(models.BookingStatusHistory, { foreignKey: 'bookingId' });
    Booking.hasOne(models.BookingReport, { foreignKey: 'bookingId' });
    Booking.hasOne(models.Review, { foreignKey: 'bookingId' });
    Booking.hasMany(models.Conversation, { foreignKey: 'bookingId' });
    Booking.hasMany(models.Notification, { foreignKey: 'relatedBookingId' });
    Booking.hasMany(models.Payment, { foreignKey: 'bookingId' });
  };

  return Booking;
};
