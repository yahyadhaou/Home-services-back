const { encryptField, decryptField, maskIban } = require('../utils/encryption');

/**
 * A registered company partner. `iban` is exposed as a VIRTUAL field backed
 * by the real `ibanEncrypted` column — application code reads/writes
 * `company.iban` like a normal string and never has to think about
 * encryption; the getter/setter below is the only place that does. This is
 * the same reason field-level encryption belongs in the model layer rather
 * than the controller layer: one place to get right, not one per call site.
 */
module.exports = (sequelize, DataTypes) => {
  const numericGetter = (field) => function get() {
    const raw = this.getDataValue(field);
    return raw === null || raw === undefined ? raw : Number(raw);
  };

  const Company = sequelize.define(
    'Company',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      uuid: {
        type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true,
      },
      ownerUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
      legalName: { type: DataTypes.STRING(255), allowNull: false },
      legalFormId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
      commercialRegisterNumber: { type: DataTypes.STRING(64), allowNull: true },
      registerCourt: { type: DataTypes.STRING(190), allowNull: true },
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
      representativeName: { type: DataTypes.STRING(190), allowNull: false },
      representativeEmail: { type: DataTypes.STRING(190), allowNull: false, validate: { isEmail: true } },
      representativePhone: { type: DataTypes.STRING(32), allowNull: true },
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
      applicationStatusId: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
      submittedAt: { type: DataTypes.DATE, allowNull: true },
      approvedAt: { type: DataTypes.DATE, allowNull: true },
      rejectedReason: { type: DataTypes.STRING(255), allowNull: true },
    },
    { tableName: 'companies' },
  );

  Company.associate = (models) => {
    Company.belongsTo(models.User, { foreignKey: 'ownerUserId', as: 'owner' });
    Company.belongsTo(models.LegalForm, { foreignKey: 'legalFormId' });
    Company.belongsTo(models.ApplicationStatus, { foreignKey: 'applicationStatusId' });
    Company.hasMany(models.CompanyDocument, { foreignKey: 'companyId' });
    Company.hasMany(models.Worker, { foreignKey: 'companyId' });
    Company.hasMany(models.ProviderCategory, { foreignKey: 'companyId' });
    Company.hasMany(models.Booking, { foreignKey: 'companyId' });
    Company.hasMany(models.Review, { foreignKey: 'companyId' });
    Company.hasMany(models.Conversation, { foreignKey: 'companyId' });
  };

  return Company;
};
