module.exports = (sequelize, DataTypes) => {
  const BookingStatus = sequelize.define(
    'BookingStatus',
    {
      id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      nameDe: { type: DataTypes.STRING(64), allowNull: false },
      nameEn: { type: DataTypes.STRING(64), allowNull: false },
      sortOrder: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'booking_statuses',
      timestamps: false,
      paranoid: false,
    },
  );

  BookingStatus.associate = (models) => {
    BookingStatus.hasMany(models.Booking, { foreignKey: 'statusId' });
    BookingStatus.hasMany(models.BookingStatusHistory, { foreignKey: 'fromStatusId', as: 'transitionsFrom' });
    BookingStatus.hasMany(models.BookingStatusHistory, { foreignKey: 'toStatusId', as: 'transitionsTo' });
  };

  return BookingStatus;
};
