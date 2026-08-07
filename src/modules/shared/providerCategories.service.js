/**
 * Shared "which categories does this provider serve" logic — used by both
 * the companies and independents modules, since a company with a heating
 * specialist on staff and a solo independent electrician both need the
 * exact same replace-all semantics over provider_categories. Living in one
 * place means a future rule change (e.g. "max 5 categories per provider")
 * only has to be written once.
 */
const { sequelize, ProviderCategory, Category } = require('../../models');
const ApiError = require('../../utils/ApiError');

/** Replaces the full set of categories for a provider with `categoryCodes` — add what's missing, remove what's no longer listed. */
const replaceProviderCategories = async ({
  providerType, companyId, independentProviderId, categoryCodes,
}) => {
  const uniqueCodes = [...new Set(categoryCodes)];
  const categories = await Category.findAll({ where: { code: uniqueCodes } });

  if (categories.length !== uniqueCodes.length) {
    const found = new Set(categories.map((c) => c.code));
    const missing = uniqueCodes.filter((code) => !found.has(code));
    throw ApiError.badRequest(`Unknown category code(s): ${missing.join(', ')}`);
  }

  const ownerWhere = providerType === 'company' ? { companyId } : { independentProviderId };

  await sequelize.transaction(async (t) => {
    await ProviderCategory.destroy({ where: ownerWhere, transaction: t });
    await ProviderCategory.bulkCreate(
      categories.map((category) => ({
        providerType,
        companyId: providerType === 'company' ? companyId : null,
        independentProviderId: providerType === 'independent' ? independentProviderId : null,
        categoryId: category.id,
      })),
      { transaction: t },
    );
  });

  return categories.map((c) => ({ code: c.code, nameDe: c.nameDe, nameEn: c.nameEn }));
};

module.exports = { replaceProviderCategories };
