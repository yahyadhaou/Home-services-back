module.exports = (sequelize, DataTypes) => {
  const PushToken = sequelize.define(
    'PushToken',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      token: { type: DataTypes.STRING(255), allowNull: false },
      platform: { type: DataTypes.ENUM('ios', 'android'), allowNull: true },
    },
    {
      tableName: 'push_tokens',
      timestamps: true,
      updatedAt: false,
      paranoid: false,
    },
  );

  PushToken.associate = (models) => {
    PushToken.belongsTo(models.User, { foreignKey: 'userId' });
  };

  return PushToken;
};
