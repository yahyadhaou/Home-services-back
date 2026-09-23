const { encryptField, decryptField, maskIban } = require('../utils/encryption');

/**
 * A solo, self-employed provider. Mirrors Company closely on purpose — see
 * schema.sql's comment on the independent_providers table for why this is
 * a separate table rather than nullable columns on `companies`.
 */
module.exports = (sequelize, DataTypes) => {
  const numericGetter = (field) =>
    function get() {
      const raw = this.getDataValue(field);
      return raw === null || raw === undefined ? raw : Number(raw);
    };

  const IndependentProvider = sequelize.define(
    'IndependentProvider',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      uuid: {
        type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true,
      },
      userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
      businessName: { type: DataTypes.STRING(255), allowNull: false },
      legalFormId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
      street: { type: DataTypes.STRING(190), allowNull: false },
      postalCode: { type: DataTypes.STRING(10), allowNull: false },
      city: { type: DataTypes.STRING(100), allowNull: false },
      latitude: {
        type: DataTypes.DECIMAL(10, 7), allowNull: true, get: numericGetter('latitude'),
      },
      longitude: {
        type: DataTypes.DECIMAL(10, 7), allowNull: true, get: numericGetter('longitude'),
      },
      hourlyRateFrom: {
        type: DataTypes.DECIMAL(8, 2), allowNull: true, get: numericGetter('hourlyRateFrom'),
      },
      vehicleType: { type: DataTypes.STRING(100), allowNull: true },
      vehicleMaxVolumeM3: {
        type: DataTypes.DECIMAL(6, 2), allowNull: true, get: numericGetter('vehicleMaxVolumeM3'),
      },
      crewSize: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
      isInsured: { type: DataTypes.BOOLEAN, allowNull: true },
      longHaulCapable: { type: DataTypes.BOOLEAN, allowNull: true },
      taxNumber: { type: DataTypes.STRING(32), allowNull: true },
      vatId: { type: DataTypes.STRING(20), allowNull: true },
      accountHolder: { type: DataTypes.STRING(190), allowNull: true },
      ibanEncrypted: { type: DataTypes.STRING(255), allowNull: true, field: 'iban_encrypted' },
      iban: {
        type: DataTypes.VIRTUAL,
        get() {
          return decryptField(this.getDataValue('ibanEncrypted'));
        },
        set(value) {
          this.setDataValue('ibanEncrypted', encryptField(value));
        },
      },
      ibanMasked: {
        type: DataTypes.VIRTUAL,
        get() {
          return maskIban(decryptField(this.getDataValue('ibanEncrypted')));
        },
      },
      bic: { type: DataTypes.STRING(20), allowNull: true },
      bankName: { type: DataTypes.STRING(190), allowNull: true },
      payoutConsentAt: { type: DataTypes.DATE, allowNull: true },
      primaryCategoryId: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
      applicationStatusId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
      submittedAt: { type: DataTypes.DATE, allowNull: true },
      approvedAt: { type: DataTypes.DATE, allowNull: true },
      rejectedReason: { type: DataTypes.STRING(255), allowNull: true },
    },
    { tableName: 'independent_providers' },
  );

  IndependentProvider.associate = (models) => {
    IndependentProvider.belongsTo(models.User, { foreignKey: 'userId' });
    IndependentProvider.belongsTo(models.LegalForm, { foreignKey: 'legalFormId' });
    IndependentProvider.belongsTo(models.Category, { foreignKey: 'primaryCategoryId', as: 'primaryCategory' });
    IndependentProvider.belongsTo(models.ApplicationStatus, { foreignKey: 'applicationStatusId' });
    IndependentProvider.hasMany(models.IndependentProviderDocument, { foreignKey: 'independentProviderId' });
    IndependentProvider.hasMany(models.ProviderCategory, { foreignKey: 'independentProviderId' });
    IndependentProvider.hasMany(models.Booking, { foreignKey: 'independentProviderId' });
    IndependentProvider.hasMany(models.Review, { foreignKey: 'independentProviderId' });
    IndependentProvider.hasMany(models.Conversation, { foreignKey: 'independentProviderId' });
  };

  return IndependentProvider;
};
