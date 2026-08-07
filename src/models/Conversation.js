module.exports = (sequelize, DataTypes) => {
  const Conversation = sequelize.define(
    'Conversation',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      uuid: {
        type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true,
      },
      clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      providerType: { type: DataTypes.ENUM('company', 'independent'), allowNull: false },
      companyId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      independentProviderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      bookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      lastMessageAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'conversations',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      paranoid: false,
    },
  );

  Conversation.associate = (models) => {
    Conversation.belongsTo(models.User, { foreignKey: 'clientId', as: 'client' });
    Conversation.belongsTo(models.Company, { foreignKey: 'companyId' });
    Conversation.belongsTo(models.IndependentProvider, { foreignKey: 'independentProviderId' });
    Conversation.belongsTo(models.Booking, { foreignKey: 'bookingId' });
    Conversation.hasMany(models.Message, { foreignKey: 'conversationId' });
  };

  return Conversation;
};
