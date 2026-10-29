import { ENCHANT_FOODS, type EnchantCraftDraft, type EnchantCraftState, type EnchantMaterial, type LegacyCalculatorItem } from './types';

export const createMaterial = (overrides: Partial<EnchantMaterial> = {}): EnchantMaterial => ({
  id: crypto.randomUUID(), materialId: null, marketKind: null, name: '', quantityPerCraft: 0,
  returnable: false, priceMode: 'unknown', manualPrice: null, ...overrides,
});

export function createDefaultEnchantDraft(taxMode: EnchantCraftDraft['taxMode'] = 'normal'): EnchantCraftDraft {
  return {
    name: 'Untitled setup', itemId: null, recipeId: null, linkedProjectId: null, projectSnapshotName: null,
    recipeName: 'Custom recipe', craftCount: 1, outputCount: 1, targetEnchantment: 0, enchantmentUnitsPerLevel: null, resourceReturnRatePercent: 15.2, runeTier: 4,
    materials: [createMaterial(), ...(['RUNE', 'SOUL', 'RELIC'] as const).map((kind) => createMaterial({
      marketKind: kind, name: `${kind[0]}${kind.slice(1).toLowerCase()}`, quantityPerCraft: 0, priceMode: 'market',
    }))],
    rerollItemValue: null, serverMultiplier: 1, otherQualityBonus: 0,
    foodId: 'none', foodPrice: null, craftsPerMeal: 1, finishedPrice: null, taxMode,
  };
}

const isNullableAmount = (value: unknown, max = Number.MAX_SAFE_INTEGER): boolean =>
  value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const idLike = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 180;

export function validateEnchantMaterial(value: unknown): value is EnchantMaterial {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as EnchantMaterial;
  return idLike(row.id) && (row.materialId === null || typeof row.materialId === 'string')
    && (row.marketKind === null || ['RUNE', 'SOUL', 'RELIC'].includes(row.marketKind))
    && typeof row.name === 'string' && row.name.length <= 120
    && isNullableAmount(row.quantityPerCraft, 1_000_000_000)
    && typeof row.returnable === 'boolean'
    && ['market', 'manual', 'unknown'].includes(row.priceMode)
    && isNullableAmount(row.manualPrice, 1e15);
}

export function validateEnchantDraft(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Setup data is invalid.'];
  const draft = value as EnchantCraftDraft;
  const errors: string[] = [];
  if (typeof draft.name !== 'string' || draft.name.length > 100) errors.push('Generated setup name is invalid.');
  if (draft.itemId !== null && typeof draft.itemId !== 'string') errors.push('Selected item is invalid.');
  if (draft.recipeId !== null && typeof draft.recipeId !== 'string') errors.push('Selected recipe is invalid.');
  if (draft.linkedProjectId !== null && typeof draft.linkedProjectId !== 'string') errors.push('Project reference is invalid.');
  if (draft.projectSnapshotName !== null && typeof draft.projectSnapshotName !== 'string') errors.push('Project snapshot name is invalid.');
  if (typeof draft.recipeName !== 'string' || draft.recipeName.length > 100) errors.push('Recipe label is invalid.');
  if (!Number.isSafeInteger(draft.craftCount) || draft.craftCount == null || draft.craftCount < 1 || draft.craftCount > 1_000_000) errors.push('Finished item quantity must be a whole number from 1 to 1,000,000.');
  if (!Number.isSafeInteger(draft.outputCount) || draft.outputCount < 1 || draft.outputCount > 1000
    || draft.itemId != null && draft.outputCount !== 1) errors.push('Gear crafting yield is fixed at one item per craft.');
  if (!Number.isInteger(draft.targetEnchantment) || draft.targetEnchantment < 0 || draft.targetEnchantment > 3) errors.push('Target enchantment must be .0 through .3.');
  if (draft.enchantmentUnitsPerLevel !== null && (!Number.isSafeInteger(draft.enchantmentUnitsPerLevel) || draft.enchantmentUnitsPerLevel < 0 || draft.enchantmentUnitsPerLevel > 10000)) errors.push('Enchantment material quantity is invalid.');
  if (!isNullableAmount(draft.resourceReturnRatePercent, 100)) errors.push('Resource Return Rate must be between 0% and 100%.');
  if (!Number.isInteger(draft.runeTier) || draft.runeTier < 4 || draft.runeTier > 8) errors.push('Market material tier must be T4 through T8.');
  if (!Array.isArray(draft.materials) || draft.materials.length > 500 || !draft.materials.every(validateEnchantMaterial)) errors.push('Material rows are invalid.');
  if (!isNullableAmount(draft.rerollItemValue, 1e15)) errors.push('Item value must be a non-negative finite number or unknown.');
  if (!isNullableAmount(draft.serverMultiplier, 1_000_000)) errors.push('Server multiplier must be a non-negative finite number or unknown.');
  if (!isNullableAmount(draft.otherQualityBonus, 1_000_000)) errors.push('Additional quality bonus must be a non-negative finite number or unknown.');
  if (!Object.hasOwn(ENCHANT_FOODS, draft.foodId)) errors.push('Food option is invalid.');
  if (!isNullableAmount(draft.foodPrice, 1e15)) errors.push('Food price must be a non-negative finite number or unknown.');
  if (!Number.isSafeInteger(draft.craftsPerMeal) || draft.craftsPerMeal == null || draft.craftsPerMeal < 1 || draft.craftsPerMeal > 1_000_000) errors.push('Crafts per meal must be a positive whole number.');
  if (!isNullableAmount(draft.finishedPrice, 1e15)) errors.push('Selling price must be a non-negative finite number or unknown.');
  if (!['normal', 'premium'].includes(draft.taxMode)) errors.push('Selling tax mode is invalid.');
  return errors;
}

// The live editor is persisted on every change, so a cleared text/number field
// can be a legitimate in-progress value. Keep that safe state on reload while
// applying the stricter checks above to estimates, presets, and plan entries.
function validateEditableDraft(value: unknown): value is EnchantCraftDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as EnchantCraftDraft;
  return typeof draft.name === 'string' && draft.name.length <= 100
    && (draft.itemId === null || typeof draft.itemId === 'string')
    && (draft.recipeId === null || typeof draft.recipeId === 'string')
    && (draft.linkedProjectId === null || typeof draft.linkedProjectId === 'string')
    && (draft.projectSnapshotName === null || typeof draft.projectSnapshotName === 'string')
    && typeof draft.recipeName === 'string' && draft.recipeName.length <= 100
    && (draft.craftCount === null || Number.isSafeInteger(draft.craftCount) && draft.craftCount >= 1 && draft.craftCount <= 1_000_000)
    && Number.isSafeInteger(draft.outputCount) && draft.outputCount >= 1 && draft.outputCount <= 1000
    && (draft.itemId == null || draft.outputCount === 1)
    && Number.isInteger(draft.targetEnchantment) && draft.targetEnchantment >= 0 && draft.targetEnchantment <= 3
    && (draft.enchantmentUnitsPerLevel === null || Number.isSafeInteger(draft.enchantmentUnitsPerLevel) && draft.enchantmentUnitsPerLevel >= 0 && draft.enchantmentUnitsPerLevel <= 10000)
    && isNullableAmount(draft.resourceReturnRatePercent, 100)
    && Number.isInteger(draft.runeTier) && draft.runeTier >= 4 && draft.runeTier <= 8
    && Array.isArray(draft.materials) && draft.materials.length <= 500 && draft.materials.every(validateEnchantMaterial)
    && isNullableAmount(draft.rerollItemValue, 1e15) && isNullableAmount(draft.serverMultiplier, 1_000_000)
    && isNullableAmount(draft.otherQualityBonus, 1_000_000)
    && Object.hasOwn(ENCHANT_FOODS, draft.foodId)
    && isNullableAmount(draft.foodPrice, 1e15)
    && (draft.craftsPerMeal === null || Number.isSafeInteger(draft.craftsPerMeal) && draft.craftsPerMeal >= 1 && draft.craftsPerMeal <= 1_000_000)
    && isNullableAmount(draft.finishedPrice, 1e15) && ['normal', 'premium'].includes(draft.taxMode);
}

export function validateEnchantCraftState(value: unknown): value is EnchantCraftState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as EnchantCraftState;
  return validateEditableDraft(state.draft)
    && Array.isArray(state.itemValues) && state.itemValues.length <= 10000
    && state.itemValues.every((entry) => !!entry && typeof entry.itemId === 'string' && entry.itemId.length > 0 && entry.itemId.length <= 180
      && Number.isInteger(entry.tier) && entry.tier >= 4 && entry.tier <= 8
      && isNullableAmount(entry.value, 1e15))
    && new Set(state.itemValues.map((entry) => `${entry.itemId}:T${entry.tier}`)).size === state.itemValues.length
    && Array.isArray(state.presets) && state.presets.length <= 1000
    && state.presets.every((preset) => !!preset && idLike(preset.id) && typeof preset.name === 'string'
      && preset.name.trim().length > 0 && preset.name.length <= 100 && typeof preset.updatedAt === 'string'
      && validateEnchantDraft(preset.draft).length === 0)
    && new Set(state.presets.map((preset) => preset.id)).size === state.presets.length
    && Array.isArray(state.plan) && state.plan.length <= 1000
    && state.plan.every((entry) => !!entry && idLike(entry.id) && typeof entry.addedAt === 'string'
      && validateEnchantDraft(entry.draft).length === 0)
    && new Set(state.plan.map((entry) => entry.id)).size === state.plan.length
    && (state.lastTaxMode == null || ['normal', 'premium'].includes(state.lastTaxMode))
    && (state.legacyImportedAt == null || typeof state.legacyImportedAt === 'string');
}

export function createDefaultEnchantCraftState(): EnchantCraftState {
  return { draft: createDefaultEnchantDraft(), presets: [], plan: [], itemValues: [], lastTaxMode: 'normal', legacyImportedAt: null };
}

export function normalizeEnchantCraftState(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const state = value as Partial<EnchantCraftState>;
  const normalizeDraft = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate;
    const draft = candidate as Partial<EnchantCraftDraft>;
    return {
      ...draft,
      outputCount: draft.itemId == null ? draft.outputCount ?? 1 : 1,
      targetEnchantment: draft.targetEnchantment ?? 0,
      enchantmentUnitsPerLevel: draft.enchantmentUnitsPerLevel ?? null,
      resourceReturnRatePercent: 15.2,
      materials: Array.isArray(draft.materials) ? draft.materials.map((material) => ({ ...material, returnable: material && typeof material === 'object' && 'returnable' in material ? material.returnable : false })) : draft.materials,
    };
  };
  return {
    ...state,
    itemValues: Array.isArray(state.itemValues) ? state.itemValues : [],
    lastTaxMode: state.lastTaxMode === 'premium' || state.lastTaxMode === 'normal'
      ? state.lastTaxMode : (state.draft as EnchantCraftDraft | undefined)?.taxMode || 'normal',
    draft: normalizeDraft(state.draft),
    presets: Array.isArray(state.presets) ? state.presets.map((preset) => ({ ...preset, draft: normalizeDraft(preset?.draft) })) : state.presets,
    plan: Array.isArray(state.plan) ? state.plan.map((entry) => ({ ...entry, draft: normalizeDraft(entry?.draft) })) : state.plan,
  };
}

function safeLegacyAmount(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function stableLegacyId(kind: string, index: number, name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'setup';
  return `legacy-${kind}-${index}-${slug}`;
}

export function legacyItemToDraft(legacy: LegacyCalculatorItem): EnchantCraftDraft | null {
  if (!legacy || typeof legacy !== 'object') return null;
  const draft = createDefaultEnchantDraft();
  const tier = Number(legacy.runeTier);
  draft.name = typeof legacy.name === 'string' && legacy.name.trim() ? legacy.name.trim().slice(0, 100) : 'Imported setup';
  draft.recipeName = draft.name;
  draft.craftCount = Number.isFinite(Number(legacy.craftAmount)) && Number(legacy.craftAmount) > 0
    ? Math.min(1_000_000, Math.floor(Number(legacy.craftAmount))) : 1;
  draft.runeTier = (Number.isInteger(tier) && tier >= 4 && tier <= 8 ? tier : 4) as EnchantCraftDraft['runeTier'];
  draft.rerollItemValue = safeLegacyAmount(legacy.rerollItemValue);
  draft.serverMultiplier = Number.isFinite(Number(legacy.rerollMultiplier)) && Number(legacy.rerollMultiplier) >= 0 ? Number(legacy.rerollMultiplier) : 1;
  draft.otherQualityBonus = Number.isFinite(Number(legacy.otherQualityBonus)) && Number(legacy.otherQualityBonus) >= 0 ? Number(legacy.otherQualityBonus) : 0;
  draft.foodId = legacy.craftFood && legacy.craftFood in ENCHANT_FOODS ? legacy.craftFood : 'none';
  draft.foodPrice = safeLegacyAmount(legacy.craftFoodPrice);
  draft.craftsPerMeal = Number.isSafeInteger(legacy.craftsPerMeal) && Number(legacy.craftsPerMeal) > 0 ? Number(legacy.craftsPerMeal) : 1;
  draft.finishedPrice = safeLegacyAmount(legacy.finishedPrice);
  draft.taxMode = legacy.premiumTax ? 'premium' : 'normal';
  const rows = Array.isArray(legacy.materials) ? legacy.materials : [];
  draft.materials = rows.slice(0, 500).map((row, index) => {
    const marketKind = (index >= 3 && index <= 5 ? ['RUNE', 'SOUL', 'RELIC'][index - 3] : null) as EnchantMaterial['marketKind'];
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, 120) : '';
    const amount = Number(row.quantity);
    const price = safeLegacyAmount(row.price);
    return {
      id: stableLegacyId(legacy.id || 'material', index, name),
      materialId: null, marketKind, name: marketKind ? `${marketKind[0]}${marketKind.slice(1).toLowerCase()}` : name,
      quantityPerCraft: Number.isFinite(amount) && amount >= 0 ? Math.min(1_000_000_000, amount) : 0,
      returnable: false,
      // Legacy market snapshots carried no usable source timestamp; import
      // their value as a manually accepted price instead of claiming it's live.
      priceMode: price == null ? 'unknown' : 'manual', manualPrice: price,
    };
  });
  if (!draft.materials.length) draft.materials = createDefaultEnchantDraft().materials;
  return validateEnchantDraft(draft).length === 0 ? draft : null;
}

export function migrateLegacyCalculatorData(existing: EnchantCraftState, savedItems: unknown, plannedItems: unknown, migratedAt = new Date().toISOString()): EnchantCraftState {
  const saved = Array.isArray(savedItems) ? savedItems : [];
  const planned = Array.isArray(plannedItems) ? plannedItems : [];
  const presets = saved.flatMap((value, index) => {
    const legacy = value as LegacyCalculatorItem;
    const draft = legacyItemToDraft(legacy);
    return draft ? [{ id: stableLegacyId('preset', index, draft.name), name: draft.name, draft, updatedAt: migratedAt }] : [];
  });
  const plan = planned.flatMap((value, index) => {
    const legacy = value as LegacyCalculatorItem;
    const draft = legacyItemToDraft(legacy);
    return draft ? [{ id: stableLegacyId('plan', index, draft.name), draft, addedAt: migratedAt }] : [];
  });
  const knownPresetIds = new Set(existing.presets.map((preset) => preset.id));
  const knownPlanIds = new Set(existing.plan.map((entry) => entry.id));
  return {
    ...existing,
    presets: [...existing.presets, ...presets.filter((preset) => !knownPresetIds.has(preset.id))],
    plan: [...existing.plan, ...plan.filter((entry) => !knownPlanIds.has(entry.id))],
    legacyImportedAt: migratedAt,
  };
}

export function mergeEnchantCraftState(existing: EnchantCraftState, incoming: EnchantCraftState): EnchantCraftState {
  const presetIds = new Set(existing.presets.map((preset) => preset.id));
  const planIds = new Set(existing.plan.map((entry) => entry.id));
  const itemValueKeys = new Set(existing.itemValues.map((entry) => `${entry.itemId}:T${entry.tier}`));
  return {
    ...existing,
    itemValues: [...existing.itemValues, ...incoming.itemValues.filter((entry) => !itemValueKeys.has(`${entry.itemId}:T${entry.tier}`))],
    presets: [...existing.presets, ...incoming.presets.filter((preset) => !presetIds.has(preset.id))],
    plan: [...existing.plan, ...incoming.plan.filter((entry) => !planIds.has(entry.id))],
  };
}
