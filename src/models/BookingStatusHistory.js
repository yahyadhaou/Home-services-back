/**
 * Full audit trail of every status transition. `bookings.statusId` is
 * never overwritten by a service without a row appended here first — see
 * src/modules/bookings/booking.service.js's `transitionStatus` helper,
 * which is the only code path allowed to change it.
 */
module.exports = (sequelize, DataTypes) => {
  const BookingStatusHistory = sequelize.define(
    'BookingStatusHistory',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      bookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      fromStatusId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
      toStatusId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
      changedByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      note: { type: DataTypes.STRING(255), allowNull: true },
      changedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'booking_status_history',
      timestamps: false,
      paranoid: false,
    },
  );

  BookingStatusHistory.associate = (models) => {
    BookingStatusHistory.belongsTo(models.Booking, { foreignKey: 'bookingId' });
    BookingStatusHistory.belongsTo(models.BookingStatus, { foreignKey: 'fromStatusId', as: 'fromStatus' });
    BookingStatusHistory.belongsTo(models.BookingStatus, { foreignKey: 'toStatusId', as: 'toStatus' });
    BookingStatusHistory.belongsTo(models.User, { foreignKey: 'changedByUserId', as: 'changedBy' });
  };

  return BookingStatusHistory;
};
