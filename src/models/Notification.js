/**
 * Per-user activity feed entry. `userId` is always a specific recipient —
 * "notify the manager" is resolved to companies.ownerUserId by the calling
 * service at write time rather than this table supporting a broadcast
 * concept. See docs/ARCHITECTURE.md if multi-manager companies are ever
 * needed; that would be the point to add a company-wide broadcast mode.
 */
module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    'Notification',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      uuid: {
        type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true,
      },
      userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      notificationTypeId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
      relatedBookingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      title: { type: DataTypes.STRING(190), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      readAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'notifications',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      paranoid: false,
    },
  );

  Notification.associate = (models) => {
    Notification.belongsTo(models.User, { foreignKey: 'userId' });
    Notification.belongsTo(models.NotificationType, { foreignKey: 'notificationTypeId' });
    Notification.belongsTo(models.Booking, { foreignKey: 'relatedBookingId' });
  };

  return Notification;
};
