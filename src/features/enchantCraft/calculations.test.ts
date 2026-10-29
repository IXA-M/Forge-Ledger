import { describe, expect, it } from 'vitest';
import { emptyState, priceKey, type CatalogItem, type Project } from '../../domain';
import { calculateEnchantEstimate, enchantedProductId, enchantmentMaterialAmounts, enchantmentUnitsPerLevel, estimateReroll, foodMealsNeeded, mergeShoppingRows, qualityDistribution, recipeItemValue } from './calculations';
import { createDefaultEnchantDraft, createDefaultEnchantCraftState, mergeEnchantCraftState, migrateLegacyCalculatorData, normalizeEnchantCraftState, validateEnchantCraftState, validateEnchantDraft } from './validation';
import { draftFromForgeProject } from './EnchantCraftPage';

const options = (getQuote: (id: string, city: string) => { sell: number | null; sellAt: string | null; refreshedAt: string } | undefined = () => undefined) => ({
  priceCity: 'Martlock', freshMinutes: 15, now: Date.parse('2026-01-01T00:10:00.000Z'), getQuote,
});

describe('Enchant Craft estimates', () => {
  it('derives per-level enchantment quantities by equipment slot and accumulates each upgrade stage', () => {
    expect(enchantmentUnitsPerLevel({ id: 'T6_MAIN_SWORD', category: 'Weapons', tier: 6 })).toBe(288);
    expect(enchantmentUnitsPerLevel({ id: 'T6_2H_CLAYMORE', category: 'Weapons', tier: 6 })).toBe(384);
    expect(enchantmentUnitsPerLevel({ id: 'T6_ARMOR_LEATHER_DRAGON', category: 'Armor', tier: 6 })).toBe(192);
    expect(enchantmentUnitsPerLevel({ id: 'T6_BAG', category: 'Bags', tier: 6 })).toBe(192);
    expect(enchantmentUnitsPerLevel({ id: 'T6_HEAD_CLOTH', category: 'Headgear', tier: 6 })).toBe(96);
    expect(enchantmentUnitsPerLevel({ id: 'T6_FOOD', category: 'Consumables', tier: 6 })).toBeNull();
    expect(enchantmentMaterialAmounts(192, 0)).toEqual({ RUNE: 0, SOUL: 0, RELIC: 0 });
    expect(enchantmentMaterialAmounts(192, 1)).toEqual({ RUNE: 192, SOUL: 0, RELIC: 0 });
    expect(enchantmentMaterialAmounts(192, 2)).toEqual({ RUNE: 192, SOUL: 192, RELIC: 0 });
    expect(enchantmentMaterialAmounts(192, 3)).toEqual({ RUNE: 192, SOUL: 192, RELIC: 192 });
  });

  it('calculates material totals and cost over craft batches and recipe yield', () => {
    const draft = createDefaultEnchantDraft();
    draft.craftCount = 11; draft.outputCount = 5; draft.rerollItemValue = 0;
    draft.foodId = 'potato_0'; draft.foodPrice = 100; draft.craftsPerMeal = 2;
    draft.materials[0] = { ...draft.materials[0], name: 'Runes', quantityPerCraft: 3, priceMode: 'manual', manualPrice: 7 };
    const estimate = calculateEnchantEstimate(draft, options());
    expect(estimate.craftRuns).toBe(3);
    expect(estimate.materials[0]).toMatchObject({ quantity: 9, unitPrice: 7, cost: 63, priceStatus: 'MANUAL' });
    expect(estimate.materialsCost).toBe(63);
    expect(estimate.foodMeals).toBe(2);
    expect(estimate.foodCost).toBe(200);
  });

  it('always applies the fixed 15.2% Enchant Craft RRR despite stale saved rates', () => {
    const draft = createDefaultEnchantDraft();
    draft.craftCount = 1;
    draft.materials[0] = { ...draft.materials[0], name: 'Leather', quantityPerCraft: 10, returnable: true, priceMode: 'manual', manualPrice: 1 };
    draft.resourceReturnRatePercent = 15.2;
    const atDefault = calculateEnchantEstimate(draft, options());
    draft.resourceReturnRatePercent = 50;
    const changed = calculateEnchantEstimate(draft, options());
    expect(atDefault.materials[0].quantity).toBe(9);
    expect(changed.materials[0].quantity).toBe(9);
  });

  it('keeps blank, zero, invalid, and overflowing prices from becoming misleading costs', () => {
    const draft = createDefaultEnchantDraft(); draft.rerollItemValue = 0;
    draft.materials[0] = { ...draft.materials[0], name: 'Ore', quantityPerCraft: 1, priceMode: 'manual', manualPrice: null };
    expect(calculateEnchantEstimate(draft, options()).materialsCost).toBeNull();
    draft.materials[0].manualPrice = 0;
    expect(calculateEnchantEstimate(draft, options()).materialsCost).toBe(0);
    draft.materials[0].quantityPerCraft = Number.MAX_VALUE;
    expect(calculateEnchantEstimate(draft, options()).materialsCost).toBeNull();
    draft.craftCount = 0;
    expect(calculateEnchantEstimate(draft, options()).valid).toBe(false);
  });

  it('uses stale market quotes as estimates while labeling freshness, and handles missing and undated prices', () => {
    const draft = createDefaultEnchantDraft(); draft.rerollItemValue = 0;
    draft.materials = [{ ...draft.materials[0], materialId: 'T4_HIDE', name: 'Hide', quantityPerCraft: 2, priceMode: 'market' }];
    const fresh = calculateEnchantEstimate(draft, options(() => ({ sell: 12, sellAt: '2026-01-01T00:05:00.000Z', refreshedAt: '2026-01-01T00:05:00.000Z' })));
    expect(fresh.materials[0]).toMatchObject({ priceStatus: 'AUTO - FRESH', cost: 24, quoteCity: 'Martlock' });
    const stale = calculateEnchantEstimate(draft, options(() => ({ sell: 12, sellAt: '2025-12-31T00:00:00.000Z', refreshedAt: '2025-12-31T00:00:00.000Z' })));
    expect(stale.materials[0]).toMatchObject({ priceStatus: 'AUTO - STALE', unitPrice: 12, cost: 24 });
    const unknownTime = calculateEnchantEstimate(draft, options(() => ({ sell: 12, sellAt: null, refreshedAt: '' })));
    expect(unknownTime.materials[0].priceStatus).toBe('AUTO - UNVERIFIED');
    expect(calculateEnchantEstimate(draft, options()).materials[0].priceStatus).toBe('UNAVAILABLE');
  });

  it('applies expected RRR only to recipe materials marked returnable', () => {
    const draft = createDefaultEnchantDraft(); draft.craftCount = 3; draft.resourceReturnRatePercent = 35.7; draft.rerollItemValue = 0;
    draft.materials = [
      { ...draft.materials[0], name: 'Leather', quantityPerCraft: 16, returnable: true, priceMode: 'manual', manualPrice: 1 },
      { ...draft.materials[0], id: 'artifact', name: 'Artifact', quantityPerCraft: 1, returnable: false, priceMode: 'manual', manualPrice: 1 },
    ];
    const result = calculateEnchantEstimate(draft, options());
    expect(result.materials.map((row) => row.quantity)).toEqual([41, 3]);
    expect(result.materialsCost).toBe(44);
  });

  it('uses Brecilien rune tier quotes and includes source tier metadata', () => {
    const draft = createDefaultEnchantDraft(); draft.runeTier = 6; draft.rerollItemValue = 0;
    draft.materials = [{ ...draft.materials[1], quantityPerCraft: 2 }];
    const result = calculateEnchantEstimate(draft, options((id, city) => id === 'T6_RUNE' && city === 'Brecilien'
      ? { sell: 40, sellAt: '2026-01-01T00:05:00.000Z', refreshedAt: '2026-01-01T00:05:00.000Z' } : undefined));
    expect(result.materials[0]).toMatchObject({ quantity: 2, unitPrice: 40, quoteCity: 'Brecilien', quoteTier: 6, cost: 80 });
  });

  it('uses an automatic market sell quote for the finished enchanted item and permits manual override', () => {
    expect(enchantedProductId('T4_MAIN_SWORD', 2)).toBe('T4_MAIN_SWORD@2');
    const draft = createDefaultEnchantDraft();
    draft.itemId = 'T4_MAIN_SWORD'; draft.targetEnchantment = 2; draft.craftCount = 3;
    const quote = options((id, city) => id === 'T4_MAIN_SWORD@2' && city === 'Martlock'
      ? { sell: 2500, sellAt: '2026-01-01T00:05:00.000Z', refreshedAt: '2026-01-01T00:05:00.000Z' } : undefined);
    const automatic = calculateEnchantEstimate(draft, quote);
    expect(automatic).toMatchObject({ finishedPrice: 2500, finishedPriceSource: 'AUTO', revenue: 7500 });
    expect(automatic.finishedPriceStatus).toBe('AUTO - FRESH');
    draft.finishedPrice = 2200;
    expect(calculateEnchantEstimate(draft, quote)).toMatchObject({ finishedPrice: 2200, finishedPriceSource: 'MANUAL', revenue: 6600 });
  });

  it('reports a missing finished price when the market quote and manual value are unavailable', () => {
    const draft = createDefaultEnchantDraft(); draft.itemId = 'T4_MAIN_SWORD'; draft.craftCount = 1;
    const estimate = calculateEnchantEstimate(draft, options());
    expect(estimate).toMatchObject({ finishedPrice: null, finishedPriceSource: 'UNAVAILABLE', revenue: null });
    expect(estimate.missingInputs).toContain('finished item selling price');
  });

  it('derives reroll Item Value from the selected catalog recipe when no override is entered', () => {
    expect(recipeItemValue('T4_MAIN_SWORD', 'T4_MAIN_SWORD')).toBe(384);
    expect(recipeItemValue('T6_ARMOR_LEATHER_DRAGON', 'T6_ARMOR_LEATHER_DRAGON')).toBeGreaterThan(0);
    const draft = createDefaultEnchantDraft();
    draft.itemId = 'T4_MAIN_SWORD';
    draft.recipeId = 'T4_MAIN_SWORD';
    draft.craftCount = 2;
    draft.serverMultiplier = null;
    const estimate = calculateEnchantEstimate(draft, options());
    expect(estimate).toMatchObject({ rerollItemValue: 384, rerollItemValueSource: 'RECIPE' });
    expect(estimate.rerollPerItem).toBeGreaterThan(0);
    expect(estimate.rerollCost).toBeCloseTo(estimate.rerollPerItem! * 2);
  });

  it('preserves quality distributions, reroll target assumptions, food rounding, tax, and profit', () => {
    const distribution = qualityDistribution(0);
    expect(Object.values(distribution).reduce((sum, chance) => sum + chance, 0)).toBeCloseTo(1);
    expect(estimateReroll(100, 1, 'normal').targetChance).toBeGreaterThanOrEqual(0.99);
    expect(foodMealsNeeded(21, 10)).toBe(3);
    const draft = createDefaultEnchantDraft();
    draft.craftCount = 10; draft.rerollItemValue = 100; draft.serverMultiplier = 1;
    draft.materials[0] = { ...draft.materials[0], name: 'Ore', quantityPerCraft: 1, priceMode: 'manual', manualPrice: 10 };
    draft.foodId = 'potato_0'; draft.foodPrice = 20; draft.craftsPerMeal = 5;
    draft.finishedPrice = 100; draft.taxMode = 'premium';
    const estimate = calculateEnchantEstimate(draft, options());
    expect(estimate.foodMeals).toBe(2);
    expect(estimate.foodCost).toBe(40);
    expect(estimate.revenue).toBe(1000);
    expect(estimate.salesTax).toBe(65);
    expect(estimate.totalCost).not.toBeNull();
    expect(estimate.rerollCost).toBeGreaterThan(0);
    expect(estimate.totalCost).toBeCloseTo(estimate.materialsCost! + estimate.rerollCost! + estimate.foodCost!);
    expect(estimate.totalCostPerItem).toBeCloseTo(estimate.totalCost! / 10);
    expect(estimate.profit).toBeCloseTo(1000 - 65 - estimate.totalCost!);
    expect(estimate.profitMargin).toBeCloseTo(estimate.profit! / 1000 * 100);
    draft.taxMode = 'normal';
    expect(calculateEnchantEstimate(draft, options()).salesTax).toBe(100);
  });

  it('aggregates plan materials by shared item identity and propagates unknown costs', () => {
    const first = { id: 'a', materialId: 'T4_HIDE', name: 'Hide', quantity: 2, unitPrice: 5, cost: 10, priceStatus: 'MANUAL' as const, quote: null, quoteCity: null, quoteTier: null, priceTimestamp: null };
    const second = { ...first, id: 'b', quantity: 3, cost: null, unitPrice: null, priceStatus: 'UNKNOWN' as const };
    expect(mergeShoppingRows([first, second])[0]).toMatchObject({ quantity: 5, cost: null, unitPrice: null, unknownCount: 1 });
  });
});

describe('Enchant Craft persistence helpers and Forge handoff', () => {
  it('validates saved presets and plan estimates and migrates legacy estimates without claiming live prices', () => {
    const draft = createDefaultEnchantDraft();
    const migrated = migrateLegacyCalculatorData(createDefaultEnchantCraftState(), [{ name: 'Old Setup', craftAmount: 4, materials: [{ name: 'Leather', quantity: 2, price: 50 }, { name: 'Artifact', quantity: 1, price: 0 }] }], []);
    expect(validateEnchantCraftState(migrated)).toBe(true);
    expect(migrated.presets[0].draft.materials[0]).toMatchObject({ priceMode: 'manual', manualPrice: 50 });
    expect(migrated.presets[0].draft.materials[1]).toMatchObject({ priceMode: 'unknown', manualPrice: null });
    expect(draft.materials).toHaveLength(4);
    const duplicate = mergeEnchantCraftState(migrated, migrated);
    expect(duplicate.presets).toHaveLength(1);
    expect(duplicate.plan).toHaveLength(0);
  });

  it('persists safe blank in-progress fields without accepting invalid saved estimates', () => {
    const state = createDefaultEnchantCraftState();
    state.draft.name = '';
    state.draft.craftCount = null;
    state.draft.craftsPerMeal = null;
    expect(validateEnchantCraftState(state)).toBe(true);
    expect(validateEnchantDraft(state.draft).length).toBeGreaterThan(0);
    state.draft.materials[0].quantityPerCraft = -1;
    expect(validateEnchantCraftState(state)).toBe(false);
  });

  it('restores the last selected tax mode into the next calculator setup', () => {
    const state = createDefaultEnchantCraftState();
    state.draft.taxMode = 'premium';
    delete state.lastTaxMode;
    const normalized = normalizeEnchantCraftState(state) as typeof state;
    expect(normalized.lastTaxMode).toBe('premium');
  });

  it('forces catalog gear to yield one item per craft', () => {
    const draft = createDefaultEnchantDraft();
    draft.itemId = 'T4_GEAR';
    draft.outputCount = 2;
    expect(validateEnchantDraft(draft)).toContain('Gear crafting yield is fixed at one item per craft.');
  });

  it('creates a linked requirements snapshot without mutating Forge stock, purchases, or project state', () => {
    const item: CatalogItem = { id: 'T4_TEST', name: 'Test Item', category: 'Test', subcategory: 'Test', tier: 4, sourceType: 'test', recipes: [{ id: 'T4_TEST', label: 'Base', outputCount: 1, materials: [{ id: 'T4_MAT', name: 'Material', count: 2, returnable: true }] }] };
    const project: Project = { id: 'p', name: 'Test Project', itemId: item.id, recipeId: item.id, target: 5, crafted: 0, createdAt: '2026-01-01', deadline: '', notes: '', priority: 'Normal', dailyTarget: 0 };
    const state = emptyState(); state.projects.push(project);
    const before = structuredClone(state);
    const draft = draftFromForgeProject(state, project, [item]);
    expect(draft).toMatchObject({ linkedProjectId: 'p', projectSnapshotName: 'Test Project', craftCount: 5, resourceReturnRatePercent: 15.2 });
    expect(draft.materials[0]).toMatchObject({ materialId: 'T4_MAT', quantityPerCraft: 2, returnable: true });
    expect(state).toEqual(before);
    expect(state.prices[priceKey('T4_MAT', 'Martlock', 1)]).toBeUndefined();
  });

  it('reopens a Forge Enchant Craft project with its target and recipe material rows', () => {
    const item: CatalogItem = { id: 'T4_TEST_ARMOR', name: 'Test Armor', category: 'Armor', subcategory: 'Leather', tier: 4, sourceType: 'test', recipes: [{ id: 'T4_TEST_ARMOR', label: 'Base', outputCount: 1, materials: [{ id: 'T4_MAT', name: 'Material', count: 2, returnable: true }] }] };
    const project: Project = { id: 'p-enchant', name: 'Enchant Craft · Test Armor .2', itemId: item.id, recipeId: item.id, target: 5, crafted: 0, createdAt: '2026-01-01', deadline: '', notes: '', priority: 'Normal', dailyTarget: 0, returnRate: 35, enchantCraft: { targetEnchantment: 2, runeTier: 4, unitsPerLevel: 192 }, additionalMaterials: [{ id: 'T4_RUNE', name: 'T4 Rune', count: 192, returnable: false }, { id: 'T4_SOUL', name: 'T4 Soul', count: 192, returnable: false }] };
    const draft = draftFromForgeProject(emptyState(), project, [item]);
    expect(draft).toMatchObject({ linkedProjectId: project.id, targetEnchantment: 2, runeTier: 4, resourceReturnRatePercent: 15.2 });
    expect(draft.materials.map((row) => [row.materialId, row.quantityPerCraft])).toEqual([['T4_MAT', 2], ['T4_RUNE', 192], ['T4_SOUL', 192]]);
  });
});
