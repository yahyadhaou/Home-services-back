module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define(
    'Message',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      conversationId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      senderUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      sentAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      readAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'messages',
      timestamps: false,
      paranoid: false,
    },
  );

  Message.associate = (models) => {
    Message.belongsTo(models.Conversation, { foreignKey: 'conversationId' });
    Message.belongsTo(models.User, { foreignKey: 'senderUserId', as: 'sender' });
  };

  return Message;
};
