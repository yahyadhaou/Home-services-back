/**
 * Which service categories a company or independent offers — a plumbing
 * company with a heating specialist on staff can serve both Klempner and
 * Heizung. `providerType` + exactly one of `companyId`/`independentProviderId`
 * is the polymorphic-association pattern MySQL doesn't support natively.
 *
 * `providerKey` is a generated (STORED, computed by MySQL) column used only
 * to make the uniqueness constraint in schema.sql actually work — see the
 * comment there for why a plain composite UNIQUE over nullable FKs doesn't
 * dedupe correctly. It is intentionally NOT declared as a model attribute:
 * MySQL rejects an explicit INSERT value for a generated column, so the
 * safest way to keep Sequelize from ever trying to write one is to never
 * tell it the column exists.
 */
module.exports = (sequelize, DataTypes) => {
  const ProviderCategory = sequelize.define(
    'ProviderCategory',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      providerType: { type: DataTypes.ENUM('company', 'independent'), allowNull: false },
      companyId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      independentProviderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      categoryId: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
    },
    {
      tableName: 'provider_categories',
      timestamps: false,
      paranoid: false,
    },
  );

  ProviderCategory.associate = (models) => {
    ProviderCategory.belongsTo(models.Company, { foreignKey: 'companyId' });
    ProviderCategory.belongsTo(models.IndependentProvider, { foreignKey: 'independentProviderId' });
    ProviderCategory.belongsTo(models.Category, { foreignKey: 'categoryId' });
  };

  return ProviderCategory;
};
