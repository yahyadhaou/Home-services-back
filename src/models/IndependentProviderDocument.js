module.exports = (sequelize, DataTypes) => {
  const IndependentProviderDocument = sequelize.define(
    'IndependentProviderDocument',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      independentProviderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      documentTypeId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
      fileUrl: { type: DataTypes.STRING(500), allowNull: false },
      uploadedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      verifiedAt: { type: DataTypes.DATE, allowNull: true },
      verifiedByUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'independent_provider_documents',
      timestamps: false,
      paranoid: false,
    },
  );

  IndependentProviderDocument.associate = (models) => {
    IndependentProviderDocument.belongsTo(models.IndependentProvider, { foreignKey: 'independentProviderId' });
    IndependentProviderDocument.belongsTo(models.DocumentType, { foreignKey: 'documentTypeId' });
    IndependentProviderDocument.belongsTo(models.User, { foreignKey: 'verifiedByUserId', as: 'verifier' });
  };

  return IndependentProviderDocument;
};
