import { validateEnchantDraft } from './validation';
import { ENCHANT_FOODS, type EnchantCraftDraft, type EnchantCraftEstimate, type EnchantMaterialEstimate, type PriceQuote } from './types';
import type { CatalogItem } from '../../domain';
import { catalogById } from '../../data/catalog';
import itemValues from '../../data/itemValues.json';

const QUALITY_NAMES = ['normal', 'good', 'outstanding', 'excellent', 'masterpiece'] as const;
const INITIAL_QUALITY = [0.689, 0.25, 0.05, 0.01, 0.001];
const REROLL_MULTIPLIER: Record<string, number> = { normal: 4.4, good: 5.5, outstanding: 6.6 };
const REROLL_RESULTS: Record<string, Record<string, number>> = {
  normal: { good: 0.80, outstanding: 0.15, excellent: 0.0495, masterpiece: 0.0005 },
  good: { good: 0.30, outstanding: 0.60, excellent: 0.09925, masterpiece: 0.00075 },
  outstanding: { outstanding: 0.50, excellent: 0.499, masterpiece: 0.001 },
};
const finiteProduct = (...values: number[]) => {
  const result = values.reduce((product, value) => product * value, 1);
  return Number.isFinite(result) ? result : null;
};

const gameItemValues = itemValues as Record<string, number>;

/** Derive Albion's fixed Item Value from the selected recipe when metadata has no direct value. */
export function recipeItemValue(itemId: string | null, recipeId: string | null, visited = new Set<string>()): number | null {
  if (!itemId) return null;
  const directValue = gameItemValues[itemId.replace(/@\d+$/, '')];
  // Zero means missing metadata in the bundled item-value source. Falling back
  // to the selected recipe avoids suppressing a calculable positive value.
  if (directValue != null && Number.isFinite(directValue) && directValue > 0) return directValue;
  if (visited.has(itemId)) return null;
  const item = catalogById.get(itemId);
  const recipe = item?.recipes.find((row) => row.id === recipeId)
    || item?.recipes.find((row) => !/@[1-4](?:#\d+)?$/.test(row.id));
  if (!recipe || !recipe.materials.length) return null;
  const nextVisited = new Set(visited).add(itemId);
  let value = 0;
  for (const material of recipe.materials) {
    const materialValue = recipeItemValue(material.id, null, nextVisited);
    if (materialValue == null) return null;
    value += materialValue * material.count;
    if (!Number.isFinite(value)) return null;
  }
  return recipe.outputCount > 0 ? value / recipe.outputCount : null;
}

export function enchantmentUnitsPerLevel(item: Pick<CatalogItem, 'id' | 'category' | 'tier'>): number | null {
  if (item.tier < 4 || item.tier > 8) return null;
  if (item.category === 'Weapons') return /(?:^|_)2H_/.test(item.id) ? 384 : 288;
  if (item.category === 'Armor' || item.category === 'Bags') return 192;
  if (['Headgear', 'Footwear', 'Capes', 'Off-hand'].includes(item.category)) return 96;
  return null;
}

export function enchantedProductId(itemId: string | null, target: number) {
  return itemId ? `${itemId.replace(/@[1-4]$/, '')}${target > 0 ? `@${target}` : ''}` : null;
}

export function enchantmentMaterialAmounts(unitsPerLevel: number | null, target: 0 | 1 | 2 | 3) {
  if (target === 0) return { RUNE: 0, SOUL: 0, RELIC: 0 };
  if (unitsPerLevel == null) return { RUNE: null, SOUL: null, RELIC: null };
  return {
    RUNE: target >= 1 ? unitsPerLevel : 0,
    SOUL: target >= 2 ? unitsPerLevel : 0,
    RELIC: target >= 3 ? unitsPerLevel : 0,
  };
}

export function qualityDistribution(qualityBonus: number) {
  const guaranteedRolls = 1 + Math.floor(qualityBonus / 100);
  const extraRollChance = (qualityBonus % 100) / 100;
  const bestOfRolls = (rolls: number) => {
    let cumulative = 0;
    let previousBest = 0;
    const distribution: Record<string, number> = {};
    INITIAL_QUALITY.forEach((probability, index) => {
      cumulative += probability;
      const bestChance = Math.pow(cumulative, rolls);
      distribution[QUALITY_NAMES[index]] = bestChance - previousBest;
      previousBest = bestChance;
    });
    return distribution;
  };
  const base = bestOfRolls(guaranteedRolls);
  if (extraRollChance === 0) return base;
  const extra = bestOfRolls(guaranteedRolls + 1);
  return Object.fromEntries(QUALITY_NAMES.map((quality) => [
    quality,
    base[quality] * (1 - extraRollChance) + extra[quality] * extraRollChance,
  ]));
}

export function estimateReroll(itemValue: number, serverMultiplier: number, startingQuality: string) {
  if (startingQuality === 'excellent' || startingQuality === 'masterpiece') return { cost: 0, attempts: 0, targetChance: 1 };
  let active: Record<string, number> = { [startingQuality]: 1 };
  let targetChance = 0;
  let cost = 0;
  let attempts = 0;
  while (targetChance < 0.99 && attempts < 100) {
    const next: Record<string, number> = {};
    for (const [quality, probability] of Object.entries(active)) {
      cost += probability * itemValue * serverMultiplier * (REROLL_MULTIPLIER[quality] || 0);
      for (const [result, chance] of Object.entries(REROLL_RESULTS[quality] || {})) {
        const resultProbability = probability * chance;
        if (result === 'excellent' || result === 'masterpiece') targetChance += resultProbability;
        else next[result] = (next[result] || 0) + resultProbability;
      }
    }
    active = next;
    attempts++;
  }
  return { cost, attempts, targetChance };
}

export function estimateCraftReroll(itemValue: number, serverMultiplier: number, qualityBonus: number) {
  const distribution = qualityDistribution(qualityBonus);
  let cost = 0;
  let expectedAttempts = 0;
  let needsReroll = false;
  let afterChance = 0;
  for (const [quality, probability] of Object.entries(distribution)) {
    if (probability <= 0) continue;
    const estimate = estimateReroll(itemValue, serverMultiplier, quality);
    cost += probability * estimate.cost;
    expectedAttempts += probability * estimate.attempts;
    afterChance += probability * estimate.targetChance;
    if (estimate.attempts > 0) needsReroll = true;
  }
  return { cost, expectedAttempts, afterChance, needsReroll, distribution };
}

export const foodMealsNeeded = (crafts: number, craftsPerMeal: number) => crafts <= 0 ? 0 : Math.ceil(crafts / craftsPerMeal);

export type MarketPriceLookup = (itemId: string, city: string) => PriceQuote | undefined;
export type EstimateOptions = { priceCity: string; freshMinutes: number; now?: number; savedItemValue?: number | null; getQuote: MarketPriceLookup };

function marketStatus(quote: PriceQuote | undefined, freshMinutes: number, now: number): EnchantMaterialEstimate['priceStatus'] {
  if (!quote || quote.sell == null || !Number.isFinite(quote.sell) || quote.sell <= 0) return 'UNAVAILABLE';
  if (!quote.sellAt || !Number.isFinite(Date.parse(quote.sellAt))) return 'AUTO - UNVERIFIED';
  const age = now - Date.parse(quote.sellAt);
  if (age < -5 * 60_000) return 'AUTO - UNVERIFIED';
  return age <= freshMinutes * 60_000 ? 'AUTO - FRESH' : 'AUTO - STALE';
}

function quoteId(material: EnchantCraftDraft['materials'][number], tier: number) {
  return material.marketKind ? `T${tier}_${material.marketKind}` : material.materialId;
}

export function calculateEnchantEstimate(draft: EnchantCraftDraft, options: EstimateOptions): EnchantCraftEstimate {
  const validation = validateEnchantDraft(draft);
  const errors = [...validation];
  const missingInputs: string[] = [];
  const count = draft.craftCount;
  const runs = count != null && Number.isSafeInteger(count) && count > 0 && draft.outputCount > 0
    ? Math.ceil(count / draft.outputCount) : null;
  const now = options.now ?? Date.now();
  let materialsCost = 0;
  const materials: EnchantMaterialEstimate[] = draft.materials.map((material) => {
    const quantityPerCraft = material.quantityPerCraft;
    const quantityMultiplier = material.marketKind ? count : runs;
    const rawQuantity = quantityMultiplier != null && quantityPerCraft != null && Number.isFinite(quantityPerCraft)
      ? finiteProduct(quantityPerCraft, quantityMultiplier) : 0;
    const rate = material.returnable ? 0.152 : 0;
    const calculatedQuantity = rawQuantity == null ? null : rate > 0 ? Math.ceil(rawQuantity * (1 - rate) - 1e-9) : rawQuantity;
    const quantity = calculatedQuantity ?? Number.NaN;
    const itemId = quoteId(material, draft.runeTier);
    const quoteCity = material.marketKind ? 'Brecilien' : material.materialId ? options.priceCity : null;
    const quote = itemId && quoteCity ? options.getQuote(itemId, quoteCity) : undefined;
    const status = material.priceMode === 'manual'
      ? (material.manualPrice == null ? 'UNKNOWN' : 'MANUAL')
      : material.priceMode === 'unknown' ? 'UNKNOWN'
        : marketStatus(quote, options.freshMinutes, now);
    // Old but valid AODP sell quotes still provide a useful estimate. Keep
    // their stale status visible, but do not discard the price from totals.
    const unitPrice = material.priceMode === 'manual' ? material.manualPrice
      : material.priceMode === 'market' && status !== 'UNAVAILABLE'
        ? quote?.sell ?? null : null;
    const cost = quantity <= 0 ? 0 : unitPrice == null ? null : finiteProduct(quantity, unitPrice);
    if (quantity > 0 && !material.name.trim()) errors.push('Every used material needs a name.');
    if (quantity > 0 && unitPrice == null) missingInputs.push(`${material.name || 'Unnamed material'} price`);
    if (cost != null) materialsCost += cost;
    return {
      id: material.id, materialId: material.materialId, name: material.name.trim(), quantity,
      unitPrice, cost, priceStatus: status, quote: quote || null, quoteCity,
      quoteTier: material.marketKind ? draft.runeTier : null,
      priceTimestamp: material.priceMode === 'market' ? quote?.sellAt || null : null,
    };
  });
  if (runs == null) missingInputs.push('valid item quantity and recipe yield');
  const materialsKnown = materials.every((material) => material.cost != null) && Number.isFinite(materialsCost);
  const requiredEnchantKinds = draft.targetEnchantment >= 1 ? ['RUNE'] : [];
  if (draft.targetEnchantment >= 2) requiredEnchantKinds.push('SOUL');
  if (draft.targetEnchantment >= 3) requiredEnchantKinds.push('RELIC');
  const enchantmentQuantityKnown = requiredEnchantKinds.every((kind) => draft.materials.some((material) => material.marketKind === kind && material.quantityPerCraft != null));
  if (!enchantmentQuantityKnown) missingInputs.push('known enchantment material requirement for this item type');
  if (!Number.isFinite(materialsCost)) errors.push('Combined material cost exceeds the safe numeric range.');

  const food = ENCHANT_FOODS[draft.foodId as keyof typeof ENCHANT_FOODS] || ENCHANT_FOODS.none;
  const validCrafts = count != null && Number.isSafeInteger(count) && count > 0;
  const validCoverage = draft.craftsPerMeal != null && Number.isSafeInteger(draft.craftsPerMeal) && draft.craftsPerMeal > 0;
  const foodMeals = food.bonus === 0 ? 0 : validCrafts && validCoverage && runs != null
    ? foodMealsNeeded(runs, draft.craftsPerMeal || 1) : null;
  const foodCost = food.bonus === 0 ? 0 : foodMeals != null && draft.foodPrice != null ? finiteProduct(foodMeals, draft.foodPrice) : null;
  if (food.bonus > 0 && draft.foodPrice == null) missingInputs.push(`${food.name} price`);
  if (food.bonus > 0 && !validCoverage) missingInputs.push('valid crafts per meal');

  const bonus = draft.otherQualityBonus;
  const automaticItemValue = recipeItemValue(draft.itemId, draft.recipeId);
  const itemValue = draft.rerollItemValue ?? options.savedItemValue ?? automaticItemValue;
  const itemValueSource: EnchantCraftEstimate['rerollItemValueSource'] = draft.rerollItemValue != null
    ? 'MANUAL' : options.savedItemValue != null ? 'SAVED' : automaticItemValue != null ? 'RECIPE' : 'UNAVAILABLE';
  const multiplier = draft.serverMultiplier ?? 1;
  const rerollNeedsPrice = bonus != null && Number.isFinite(bonus)
    ? estimateCraftReroll(1, 1, bonus + food.bonus).needsReroll : true;
  const rerollKnown = !rerollNeedsPrice || itemValue != null && multiplier != null;
  const reroll = bonus != null && Number.isFinite(bonus) && rerollKnown
    ? estimateCraftReroll(itemValue ?? 0, multiplier ?? 1, bonus + food.bonus) : null;
  const baselineReroll = bonus != null && Number.isFinite(bonus) && rerollKnown
    ? estimateCraftReroll(itemValue ?? 0, multiplier ?? 1, bonus) : null;
  const rerollPerItem = reroll?.cost ?? null;
  const rerollCost = validCrafts && rerollPerItem != null ? finiteProduct(rerollPerItem, count!) : null;
  if (rerollNeedsPrice && itemValue == null) missingInputs.push('item value for reroll fees (enter an override if the selected recipe cannot provide it)');
  const initialExcellentChance = reroll ? (reroll.distribution.excellent + reroll.distribution.masterpiece) * 100 : null;
  const foodSavings = food.bonus > 0 && reroll && baselineReroll && validCrafts
    ? finiteProduct(baselineReroll.cost - reroll.cost, count!) : null;
  const foodNetBenefit = food.bonus > 0 && foodSavings != null && foodCost != null
    ? foodSavings - foodCost : food.bonus === 0 ? 0 : null;
  const finishedItemId = enchantedProductId(draft.itemId, draft.targetEnchantment);
  const finishedQuote = finishedItemId ? options.getQuote(finishedItemId, options.priceCity) : undefined;
  const finishedQuoteStatus = marketStatus(finishedQuote, options.freshMinutes, now);
  const automaticFinishedPrice = finishedQuoteStatus === 'UNAVAILABLE' ? null : finishedQuote?.sell ?? null;
  const finishedPrice = draft.finishedPrice ?? automaticFinishedPrice;
  const finishedPriceSource: EnchantCraftEstimate['finishedPriceSource'] = draft.finishedPrice != null
    ? 'MANUAL' : automaticFinishedPrice != null ? 'AUTO' : 'UNAVAILABLE';
  const finishedPriceStatus = draft.finishedPrice != null ? 'MANUAL' : finishedQuoteStatus;
  const revenue = validCrafts && finishedPrice != null ? finiteProduct(count!, finishedPrice) : null;
  if (finishedPrice == null) missingInputs.push('finished item selling price');
  const taxRate = draft.taxMode === 'premium' ? 0.065 : 0.10;
  const salesTax = revenue == null ? null : revenue * taxRate;
  const totalCostRaw = materialsKnown && rerollCost != null && foodCost != null
    ? materialsCost + rerollCost + foodCost : null;
  const totalCost = totalCostRaw != null && Number.isFinite(totalCostRaw) ? totalCostRaw : null;
  const totalCostPerItem = totalCost != null && validCrafts ? totalCost / count! : null;
  const profit = totalCost != null && salesTax != null && revenue != null
    ? revenue - salesTax - totalCost : null;
  const profitMargin = profit == null || revenue == null || revenue <= 0 ? null : profit / revenue * 100;

  if (runs != null && materials.some((material) => !Number.isFinite(material.quantity))) errors.push('Material quantities are too large to calculate safely.');
  return {
    valid: errors.length === 0 && runs != null,
    errors: [...new Set(errors)], craftRuns: runs, materials,
    materialsCost: materialsKnown && enchantmentQuantityKnown && errors.length === 0 ? materialsCost : null,
    rerollPerItem, rerollCost, rerollItemValue: itemValue, rerollItemValueSource: itemValueSource, rerollAttempts: reroll?.expectedAttempts ?? null,
    initialExcellentChance, qualityDistribution: reroll?.distribution ?? null,
    postRerollExcellentChance: reroll ? reroll.afterChance * 100 : null,
    foodMeals, foodCost, foodNetBenefit, taxRate, finishedPrice, finishedPriceSource, finishedPriceStatus,
    finishedPriceTimestamp: finishedPriceSource === 'AUTO' ? finishedQuote?.sellAt ?? null : null,
    revenue, salesTax, totalCost, totalCostPerItem, profit, profitMargin,
    missingInputs: [...new Set(missingInputs)],
  };
}

export function mergeShoppingRows(rows: EnchantMaterialEstimate[]) {
  const merged = new Map<string, { key: string; name: string; quantity: number; cost: number | null; unitPrice: number | null; unknownCount: number }>();
  for (const row of rows) {
    if (!Number.isFinite(row.quantity) || row.quantity <= 0 || !row.name) continue;
    const key = row.materialId || row.name.trim().toLocaleLowerCase();
    const previous = merged.get(key) || { key, name: row.name, quantity: 0, cost: 0, unitPrice: null, unknownCount: 0 };
    previous.quantity += row.quantity;
    if (row.cost == null) { previous.cost = null; previous.unknownCount++; }
    else if (previous.cost != null) previous.cost += row.cost;
    previous.unitPrice = previous.cost == null ? null : previous.cost / previous.quantity;
    merged.set(key, previous);
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}
