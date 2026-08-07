module.exports = (sequelize, DataTypes) => {
  const LegalForm = sequelize.define(
    'LegalForm',
    {
      id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      code: { type: DataTypes.STRING(24), allowNull: false, unique: true },
      nameDe: { type: DataTypes.STRING(64), allowNull: false },
      nameEn: { type: DataTypes.STRING(64), allowNull: false },
      requiresCommercialRegister: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: 'legal_forms',
      timestamps: false,
      paranoid: false,
    },
  );

  LegalForm.associate = (models) => {
    LegalForm.hasMany(models.Company, { foreignKey: 'legalFormId' });
    LegalForm.hasMany(models.IndependentProvider, { foreignKey: 'legalFormId' });
  };

  return LegalForm;
};
