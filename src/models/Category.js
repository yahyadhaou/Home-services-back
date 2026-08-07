module.exports = (sequelize, DataTypes) => {
  const Category = sequelize.define(
    'Category',
    {
      id: { type: DataTypes.SMALLINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      code: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      nameDe: { type: DataTypes.STRING(64), allowNull: false },
      nameEn: { type: DataTypes.STRING(64), allowNull: false },
      icon: { type: DataTypes.STRING(64), allowNull: true },
      sortOrder: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 0 },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: 'categories',
      timestamps: false,
      paranoid: false,
    },
  );

  Category.associate = (models) => {
    Category.hasMany(models.Booking, { foreignKey: 'categoryId' });
    Category.hasMany(models.Worker, { foreignKey: 'specialtyCategoryId' });
    Category.hasMany(models.ProviderCategory, { foreignKey: 'categoryId' });
    Category.hasMany(models.IndependentProvider, { foreignKey: 'primaryCategoryId' });
  };

  return Category;
};
