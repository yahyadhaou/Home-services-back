module.exports = (sequelize, DataTypes) => {
  const BookingReport = sequelize.define(
    'BookingReport',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      bookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
      materialsUsed: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Array of {name, qty, unit} — see docs/DATABASE.md for the exact shape.',
      },
      remarks: { type: DataTypes.TEXT, allowNull: true },
      additionalInfo: { type: DataTypes.TEXT, allowNull: true },
      submittedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: 'booking_reports',
      timestamps: true,
      createdAt: false,
      paranoid: false,
    },
  );

  BookingReport.associate = (models) => {
    BookingReport.belongsTo(models.Booking, { foreignKey: 'bookingId' });
    BookingReport.hasMany(models.BookingReportPhoto, { foreignKey: 'bookingReportId' });
  };

  return BookingReport;
};
