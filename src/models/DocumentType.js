module.exports = (sequelize, DataTypes) => {
  const DocumentType = sequelize.define(
    'DocumentType',
    {
      id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      code: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      nameDe: { type: DataTypes.STRING(128), allowNull: false },
      nameEn: { type: DataTypes.STRING(128), allowNull: false },
    },
    {
      tableName: 'document_types',
      timestamps: false,
      paranoid: false,
    },
  );

  DocumentType.associate = (models) => {
    DocumentType.hasMany(models.CompanyDocument, { foreignKey: 'documentTypeId' });
    DocumentType.hasMany(models.IndependentProviderDocument, { foreignKey: 'documentTypeId' });
  };

  return DocumentType;
};
