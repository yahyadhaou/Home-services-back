module.exports = (sequelize, DataTypes) => {
  const Review = sequelize.define(
    'Review',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      uuid: {
        type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true,
      },
      bookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
      clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      providerType: { type: DataTypes.ENUM('company', 'independent'), allowNull: false },
      companyId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      independentProviderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, validate: { min: 1, max: 5 } },
      comment: { type: DataTypes.TEXT, allowNull: true },
      providerResponse: { type: DataTypes.TEXT, allowNull: true },
      providerRespondedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'reviews',
      timestamps: true,
      updatedAt: false,
      paranoid: false,
    },
  );

  Review.associate = (models) => {
    Review.belongsTo(models.Booking, { foreignKey: 'bookingId' });
    Review.belongsTo(models.User, { foreignKey: 'clientId', as: 'client' });
    Review.belongsTo(models.Company, { foreignKey: 'companyId' });
    Review.belongsTo(models.IndependentProvider, { foreignKey: 'independentProviderId' });
  };

  return Review;
};
