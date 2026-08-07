/**
 * Lookup table — no timestamps, no soft delete. Seeded once from
 * db/seed.sql and read constantly (every authenticated request resolves a
 * user's role), never written to at runtime.
 */
module.exports = (sequelize, DataTypes) => {
  const Role = sequelize.define(
    'Role',
    {
      id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      code: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(64), allowNull: false },
      description: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: 'roles',
      timestamps: false,
      paranoid: false,
    },
  );

  Role.associate = (models) => {
    Role.hasMany(models.User, { foreignKey: 'roleId' });
  };

  return Role;
};
