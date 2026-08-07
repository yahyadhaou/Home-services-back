module.exports = (sequelize, DataTypes) => {
  const CompanyDocument = sequelize.define(
    'CompanyDocument',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      documentTypeId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
      fileUrl: { type: DataTypes.STRING(500), allowNull: false },
      uploadedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      verifiedAt: { type: DataTypes.DATE, allowNull: true },
      verifiedByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_documents',
      timestamps: false,
      paranoid: false,
    },
  );

  CompanyDocument.associate = (models) => {
    CompanyDocument.belongsTo(models.Company, { foreignKey: 'companyId' });
    CompanyDocument.belongsTo(models.DocumentType, { foreignKey: 'documentTypeId' });
    CompanyDocument.belongsTo(models.User, { foreignKey: 'verifiedByUserId', as: 'verifier' });
  };

  return CompanyDocument;
};
