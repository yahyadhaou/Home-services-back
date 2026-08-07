module.exports = (sequelize, DataTypes) => {
  const NotificationType = sequelize.define(
    'NotificationType',
    {
      id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      code: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'notification_types',
      timestamps: false,
      paranoid: false,
    },
  );

  NotificationType.associate = (models) => {
    NotificationType.hasMany(models.Notification, { foreignKey: 'notificationTypeId' });
  };

  return NotificationType;
};
