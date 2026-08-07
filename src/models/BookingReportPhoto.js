module.exports = (sequelize, DataTypes) => {
  const BookingReportPhoto = sequelize.define(
    'BookingReportPhoto',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      bookingReportId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      photoUrl: { type: DataTypes.STRING(500), allowNull: false },
      caption: { type: DataTypes.STRING(190), allowNull: true },
      uploadedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'booking_report_photos',
      timestamps: false,
      paranoid: false,
    },
  );

  BookingReportPhoto.associate = (models) => {
    BookingReportPhoto.belongsTo(models.BookingReport, { foreignKey: 'bookingReportId' });
  };

  return BookingReportPhoto;
};
