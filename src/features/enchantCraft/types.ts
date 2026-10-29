export type EnchantMaterialMode = 'market' | 'manual' | 'unknown';
export type EnchantMaterial = {
  id: string;
  materialId: string | null;
  marketKind: 'RUNE' | 'SOUL' | 'RELIC' | null;
  name: string;
  quantityPerCraft: number | null;
  returnable: boolean;
  priceMode: EnchantMaterialMode;
  manualPrice: number | null;
};

export type EnchantCraftDraft = {
  name: string;
  itemId: string | null;
  recipeId: string | null;
  linkedProjectId: string | null;
  projectSnapshotName: string | null;
  recipeName: string;
  craftCount: number | null;
  outputCount: number;
  targetEnchantment: 0 | 1 | 2 | 3;
  enchantmentUnitsPerLevel: number | null;
  resourceReturnRatePercent: number;
  runeTier: 4 | 5 | 6 | 7 | 8;
  materials: EnchantMaterial[];
  rerollItemValue: number | null;
  serverMultiplier: number | null;
  otherQualityBonus: number | null;
  foodId: string;
  foodPrice: number | null;
  craftsPerMeal: number | null;
  finishedPrice: number | null;
  taxMode: 'normal' | 'premium';
};

export type EnchantPreset = { id: string; name: string; draft: EnchantCraftDraft; updatedAt: string };
export type EnchantPlanEntry = { id: string; draft: EnchantCraftDraft; addedAt: string };
export type EnchantItemValue = { itemId: string; tier: number; value: number };
export type EnchantCraftState = {
  draft: EnchantCraftDraft;
  presets: EnchantPreset[];
  plan: EnchantPlanEntry[];
  itemValues: EnchantItemValue[];
  lastTaxMode?: EnchantCraftDraft['taxMode'];
  legacyImportedAt?: string | null;
};

export type LegacyCalculatorItem = {
  id?: string; name?: string; craftAmount?: number; runeTier?: number; rerollItemValue?: number;
  rerollMultiplier?: number; otherQualityBonus?: number; craftFood?: string; craftFoodPrice?: number;
  craftsPerMeal?: number; premiumTax?: boolean; finishedPrice?: number;
  materials?: Array<{ name?: string; price?: number; quantity?: number }>;
};

export type PriceQuote = {
  sell: number | null;
  sellAt: string | null;
  refreshedAt: string;
};

export type EnchantMaterialEstimate = {
  id: string;
  materialId: string | null;
  name: string;
  quantity: number;
  unitPrice: number | null;
  cost: number | null;
  priceStatus: 'MANUAL' | 'AUTO - FRESH' | 'AUTO - STALE' | 'AUTO - UNVERIFIED' | 'UNKNOWN' | 'UNAVAILABLE';
  quote: PriceQuote | null;
  quoteCity: string | null;
  quoteTier: number | null;
  priceTimestamp: string | null;
};

export type EnchantCraftEstimate = {
  valid: boolean;
  errors: string[];
  craftRuns: number | null;
  materials: EnchantMaterialEstimate[];
  materialsCost: number | null;
  rerollItemValue: number | null;
  rerollItemValueSource: 'MANUAL' | 'SAVED' | 'RECIPE' | 'UNAVAILABLE';
  rerollPerItem: number | null;
  rerollCost: number | null;
  rerollAttempts: number | null;
  initialExcellentChance: number | null;
  postRerollExcellentChance: number | null;
  qualityDistribution: Record<string, number> | null;
  foodMeals: number | null;
  foodCost: number | null;
  foodNetBenefit: number | null;
  taxRate: number;
  finishedPrice: number | null;
  finishedPriceSource: 'MANUAL' | 'AUTO' | 'UNAVAILABLE';
  finishedPriceStatus: EnchantMaterialEstimate['priceStatus'];
  finishedPriceTimestamp: string | null;
  revenue: number | null;
  salesTax: number | null;
  totalCost: number | null;
  totalCostPerItem: number | null;
  profit: number | null;
  profitMargin: number | null;
  missingInputs: string[];
};

export const ENCHANT_FOODS = {
  none: { name: 'No food', bonus: 0 },
  potato_0: { name: 'Potato Salad .0', bonus: 99 },
  potato_1: { name: 'Potato Salad .1', bonus: 116 },
  potato_2: { name: 'Potato Salad .2', bonus: 132 },
  potato_3: { name: 'Potato Salad .3', bonus: 149 },
  kraken_0: { name: 'Deep Kraken Salad .0', bonus: 149 },
  kraken_1: { name: 'Deep Kraken Salad .1', bonus: 173 },
  kraken_2: { name: 'Deep Kraken Salad .2', bonus: 198 },
  kraken_3: { name: 'Deep Kraken Salad .3', bonus: 223 },
} as const;

export type EnchantFoodId = keyof typeof ENCHANT_FOODS;
