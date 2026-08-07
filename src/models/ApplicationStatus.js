module.exports = (sequelize, DataTypes) => {
  const ApplicationStatus = sequelize.define(
    'ApplicationStatus',
    {
      id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      nameDe: { type: DataTypes.STRING(64), allowNull: false },
      nameEn: { type: DataTypes.STRING(64), allowNull: false },
    },
    {
      tableName: 'application_statuses',
      timestamps: false,
      paranoid: false,
    },
  );

  ApplicationStatus.associate = (models) => {
    ApplicationStatus.hasMany(models.Company, { foreignKey: 'applicationStatusId' });
    ApplicationStatus.hasMany(models.IndependentProvider, { foreignKey: 'applicationStatusId' });
  };

  return ApplicationStatus;
};
