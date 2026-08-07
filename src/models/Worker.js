/**
 * 1:1 extension of `users` for role = company_worker — an employee of
 * exactly one company. `deletedAt` here means "removed from team" (see
 * WorkerDetailScreen's remove flow in the company app): historical bookings
 * keep pointing at this row via bookings.assignedWorkerId, which is soft
 * delete only — the FK is ON DELETE RESTRICT (not SET NULL, which MySQL
 * disallows here alongside bookings' CHECK constraints anyway), so a hard
 * DELETE of a worker with job history is rejected outright rather than
 * silently orphaning "who did this job." A completed job keeps showing who
 * did it even after they've left the team.
 */
module.exports = (sequelize, DataTypes) => {
  const Worker = sequelize.define(
    'Worker',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      uuid: {
        type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true,
      },
      userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
      companyId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      specialtyCategoryId: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
      isAvailable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      joinedDate: { type: DataTypes.DATEONLY, allowNull: false },
    },
    { tableName: 'workers' },
  );

  Worker.associate = (models) => {
    Worker.belongsTo(models.User, { foreignKey: 'userId' });
    Worker.belongsTo(models.Company, { foreignKey: 'companyId' });
    Worker.belongsTo(models.Category, { foreignKey: 'specialtyCategoryId', as: 'specialtyCategory' });
    Worker.hasMany(models.Booking, { foreignKey: 'assignedWorkerId' });
  };

  return Worker;
};
