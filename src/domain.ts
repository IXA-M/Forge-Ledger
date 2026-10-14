export type Material = { id: string; name: string; count: number; returnable: boolean };
export type Recipe = { id: string; label: string; outputCount: number; materials: Material[] };
export type CatalogItem = { id: string; name: string; category: string; subcategory: string; tier: number; sourceType: string; recipes: Recipe[]; journalType?: string | null; craftingFameFactor?: number | null };
export type Priority = 'Low' | 'Normal' | 'High' | 'Urgent';
export const BUY_ORDER_SETUP_FEE_RATE = 0.025;
export function calculateBuyOrderSetupFee(orderValue: number) {
  return Math.round(Math.max(0, orderValue) * BUY_ORDER_SETUP_FEE_RATE);
}
export type Project = {
  id: string; name: string; itemId: string; recipeId: string; target: number; crafted: number;
  createdAt: string; deadline: string; notes: string; priority: Priority; dailyTarget: number; returnRate?: number;
  completed?: boolean; completedAt?: string | null; completionHistory?: Array<{ completedAt: string; target: number; recipeId: string }>;
  completionMaterialConsumption?: Record<string, number>; sellingPrice?: number | null;
  journalType?: string; journalFamePerItem?: number | null; journalsOwned?: number; journalsFilled?: number; journalsInProgress?: number; journalsBought?: number; journalsSold?: number;
};
export type Purchase = {
  id: string; projectId: string | null; materialId: string; materialName: string; city: string;
  quantity: number; unitPrice: number | null; date: string; notes: string; orderId?: string; reversesPurchaseId?: string; zeroPriceConfirmed?: boolean; source?: 'market-listing';
};
export type MaterialAllocation = { id: string; materialId: string; materialName: string; projectId: string; quantity: number; date: string; unitPriceAtAllocation: number | null; zeroPriceConfirmed?: boolean };
export type BuyOrder = {
  id: string; projectId: string; materialId: string; materialName: string; city: string;
  unitPrice: number; quantity: number; fulfilled: number; received: number; placedAt: string;
  notes: string; mode: 'Planned' | 'Active'; cancelled: boolean; archived: boolean; zeroPriceConfirmed?: boolean; setupFees?: number;
};
export type CraftSession = { id: string; projectId: string; quantity: number; date: string; notes: string; returnRate?: number; actualReturns?: Record<string, number>; recipeId?: string; journalsFilled?: number; journalsPartial?: number };
export type InventoryBalance = { id: string; projectId: string | null; materialId: string; materialName: string; quantity: number; updatedAt: string };
export type Task = {
  id: string; projectId: string; title: string; description: string; notes: string; dueDate: string;
  priority: Priority; completed: boolean; createdAt: string;
};
export type AutoPrice = {
  buy: number | null; sell: number | null; buyAt: string | null; sellAt: string | null; refreshedAt: string;
  buyUnavailableAt?: string | null; sellUnavailableAt?: string | null;
};
export type ManualPrice = { buy: number | null; sell: number | null; updatedAt: string; zeroBuyConfirmed?: boolean; zeroSellConfirmed?: boolean };
export type Settings = {
  server: 'west' | 'east' | 'europe'; freshMinutes: number; autoRefresh: boolean;
  autoRefreshMinutes: number; applyReturnRate: boolean; returnRate: number; cities: string[]; priceCity: string;
  extraCostPercent: number; marketQuality: number; sellingTaxPercent?: number | null;
};
export type AppState = {
  version: 1; settings: Settings; projects: Project[]; purchases: Purchase[];
  allocations: MaterialAllocation[]; orders: BuyOrder[]; sessions: CraftSession[]; tasks: Task[]; inventoryBalances?: InventoryBalance[];
  prices: Record<string, AutoPrice>; manualPrices: Record<string, ManualPrice>;
};
export type MaterialSummary = Material & {
  required: number; baseRequired: number; estimatedReturns: number; expectedRequired: number;
  consumed: number; baseConsumed: number; actualReturns: number; acquired: number; available: number; missing: number;
  pricedAcquired: number; unpricedAcquired: number;
  autoAllocated: number;
  ordered: number; orderRemaining: number; weightedAverage: number | null;
  awaitingReceipt: number; orderAcquired: number; notCovered: number;
  nextPurchaseEstimate: number | null; estimateSource: 'MANUAL' | 'AUTO' | 'UNAVAILABLE';
  estimatePriceSide: 'manual' | 'buy' | 'sell' | null;
  remainingEstimatedCost: number | null;
};
export type MaterialShortageProject = { project: Project; required: number; available: number; stillNeeded: number };
export type MaterialShortageOrder = BuyOrder & { remaining: number; acquired: number; awaitingReceipt: number };
export type MaterialShortageSummary = Material & {
  required: number; available: number; stillNeeded: number; onOrder: number; notCovered: number;
  acquiredTowardRequirement: number; orderCoveragePct: number | null; acquisitionProgressPct: number | null;
  projects: MaterialShortageProject[]; orders: MaterialShortageOrder[];
};

export const CITY_OPTIONS = ['Bridgewatch', 'Caerleon', 'Fort Sterling', 'Lymhurst', 'Martlock', 'Thetford', 'Brecilien', 'Black Market'];
export const DEFAULT_SETTINGS: Settings = {
  server: 'europe', freshMinutes: 15, autoRefresh: false, autoRefreshMinutes: 30,
  applyReturnRate: true, returnRate: 0, cities: CITY_OPTIONS, priceCity: 'Bridgewatch', extraCostPercent: 0, marketQuality: 1, sellingTaxPercent: null,
};
export const newId = () => crypto.randomUUID();
export const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export const priceKey = (itemId: string, city: string, quality = 1) => `${itemId}::${city}::q${quality}`;
export const manualPriceKey = (projectId: string, itemId: string) => `${projectId}::${itemId}`;
export const formatNumber = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
export const formatSilver = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} silver`;
export const itemEnchantmentLevel = (variantId: string) => variantId.match(/@([1-4])/)?.[1];
export function formatTier(tier: number | string | null | undefined, variantId: string) {
  const enchantment = itemEnchantmentLevel(variantId);
  return `Tier ${tier ?? '—'}${enchantment ? `.${enchantment}` : ''}`;
}
export function formatItemName(name: string, variantId: string) {
  const enchantment = itemEnchantmentLevel(variantId);
  return `${name}${enchantment ? ` .${enchantment}` : ''}`;
}
export function formatMaterialName(id: string, name: string, baseNames: ReadonlyMap<string, string> = new Map()) {
  const dragonScaleTier = id.match(/^T([4-8])_SHARD_FIRE_DRAGON$/)?.[1];
  if (dragonScaleTier) return `T${dragonScaleTier} Fire Dragon Scale`;
  const level = id.match(/_LEVEL([1-4])(?:@[1-4])?$/)?.[1];
  const enchantment = level || itemEnchantmentLevel(id);
  if (!enchantment) return name.replace(/\bEnchantment\s*([1-4])\b/gi, '.$1').replace(/@([1-4])\b/g, '.$1');
  const baseId = id.replace(/_LEVEL[1-4](?:@[1-4])?$/, '').replace(/@[1-4]$/, '');
  const baseName = baseNames.get(baseId) || name.replace(/\s*(?:Level|Enchantment)\s*[1-4]\s*$/i, '').replace(/@[1-4]\b/g, '').trim();
  return `${baseName} .${enchantment}`;
}

export function isProjectCompleted(project: Project) {
  return project.completed ?? project.crafted >= project.target;
}

export function materialReadiness(state: AppState, project: Project, catalog: CatalogItem[]) {
  const materials = projectMaterials(state, project, catalog);
  const required = materials.reduce((sum, material) => sum + Math.max(0, material.required), 0);
  if (!materials.length || required <= 0) return null;
  const supplied = materials.reduce((sum, material) => sum + Math.min(Math.max(0, material.available), Math.max(0, material.required)), 0);
  return Math.min(100, Math.floor(supplied / required * 100));
}

export function projectMaterialCost(state: AppState, project: Project, catalog: CatalogItem[]) {
  const materials = projectMaterials(state, project, catalog).filter((material) => material.required > 0);
  if (!materials.length) return null;
  let total = 0;
  for (const material of materials) {
    const pricedAcquired = Math.min(material.required, Math.max(0, material.pricedAcquired));
    if (pricedAcquired > 0) {
      if (material.weightedAverage == null || !Number.isFinite(material.weightedAverage)) return null;
      total += pricedAcquired * material.weightedAverage;
    }

    const unpricedAcquired = Math.min(material.required - pricedAcquired, Math.max(0, material.unpricedAcquired));
    if (unpricedAcquired > 0) {
      if (material.nextPurchaseEstimate == null || !Number.isFinite(material.nextPurchaseEstimate)) return null;
      total += unpricedAcquired * material.nextPurchaseEstimate;
    }

    let remainingQuantity = material.required - pricedAcquired - unpricedAcquired;
    const orders = state.orders.filter((order) => order.projectId === project.id && order.materialId === material.id
      && (order.unitPrice > 0 || order.zeroPriceConfirmed)
      && ((!order.archived && !order.cancelled) || order.fulfilled > order.received))
      .sort((a, b) => a.placedAt.localeCompare(b.placedAt));
    for (const order of orders) {
      const orderQuantity = Math.max(0, ((order.cancelled || order.archived) ? order.fulfilled : order.quantity) - order.received);
      const coveredQuantity = Math.min(remainingQuantity, orderQuantity);
      total += coveredQuantity * order.unitPrice;
      remainingQuantity -= coveredQuantity;
      if (remainingQuantity <= 0) break;
    }

    if (remainingQuantity > 0) {
      if (material.nextPurchaseEstimate == null || !Number.isFinite(material.nextPurchaseEstimate)) return null;
      total += remainingQuantity * material.nextPurchaseEstimate;
    }
  }
  total += state.orders.filter((order) => order.projectId === project.id)
    .reduce((sum, order) => sum + Math.max(0, order.setupFees || 0), 0);
  return total * (1 + Math.max(0, state.settings.extraCostPercent) / 100);
}

export function markProjectCrafted(state: AppState, projectId: string, catalog: CatalogItem[], completedAt = new Date().toISOString()): AppState | null {
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project || isProjectCompleted(project)) return null;
  const recipe = recipeFor(project, catalog).recipe;
  if (!recipe) return null;
  const rows = projectMaterials(state, project, catalog);
  const required = recipeRequirements(recipe, project.target, projectReturnRate(state, project));
  const allocations = rows.filter((row) => row.autoAllocated > 0).map((row) => ({
    id: newId(), materialId: row.id, materialName: row.name, projectId: project.id, quantity: row.autoAllocated,
    date: completedAt.slice(0, 10), unitPriceAtAllocation: row.weightedAverage, zeroPriceConfirmed: row.weightedAverage === 0,
  }));
  return {
    ...state,
    allocations: [...state.allocations, ...allocations],
    projects: state.projects.map((entry) => entry.id === projectId ? {
      ...entry, completed: true, completedAt,
      completionHistory: [...(entry.completionHistory || []), { completedAt, target: entry.target, recipeId: entry.recipeId }],
      completionMaterialConsumption: { ...(entry.completionMaterialConsumption || {}), ...Object.fromEntries([...required].map(([id, material]) => {
        const priorCompletionUse = entry.completionMaterialConsumption?.[id] || 0;
        const nonCompletionUse = Math.max(0, (rows.find((row) => row.id === id)?.baseConsumed || 0) - priorCompletionUse);
        return [id, priorCompletionUse + Math.max(0, material.count - nonCompletionUse)];
      })) },
    } : entry),
    tasks: state.tasks.map((task) => task.projectId === projectId && !task.completed ? { ...task, completed: true } : task),
  };
}

export function emptyState(): AppState {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, cities: [...DEFAULT_SETTINGS.cities] },
    projects: [], purchases: [], allocations: [], orders: [], sessions: [], tasks: [], inventoryBalances: [], prices: {}, manualPrices: {},
  };
}

export function recipeFor(project: Project, catalog: CatalogItem[]) {
  const item = catalog.find((entry) => entry.id === project.itemId);
  return { item, recipe: item?.recipes.find((entry) => entry.id === project.recipeId) || item?.recipes[0] };
}

export function recipeRequirements(recipe: Recipe, quantity: number, returnRate = 0): Map<string, Material> {
  const needed = new Map<string, Material>();
  if (quantity <= 0) return needed;
  const craftRuns = Math.ceil(quantity / Math.max(1, recipe.outputCount));
  for (const material of recipe.materials) {
    const raw = material.count * craftRuns;
    const rate = material.returnable ? Math.min(1, Math.max(0, returnRate)) : 0;
    // Round once across the requested craft runs. This is an expected average,
    // not a promise about the discrete refund the game will actually award.
    const count = Math.ceil(raw * (1 - rate));
    const current = needed.get(material.id);
    needed.set(material.id, { ...material, count: (current?.count || 0) + count });
  }
  return needed;
}

export function projectReturnRate(state: AppState, project: Project) {
  return (project.returnRate ?? (state.settings.applyReturnRate ? state.settings.returnRate : 0)) / 100;
}

export function resourceReturnRateFromProductionBonus(bonusPercent: number) {
  const bonus = Math.max(0, Number.isFinite(bonusPercent) ? bonusPercent : 0);
  return bonus / (100 + bonus);
}

export function expectedReturns(recipe: Recipe, quantity: number, returnRate: number) {
  const base = recipeRequirements(recipe, quantity);
  const rate = Math.min(1, Math.max(0, returnRate));
  // Round the expected batch return once, rather than rounding each recipe run.
  return new Map([...base.entries()].map(([id, material]) => [id,
    material.returnable ? Math.round(material.count * rate) : 0]));
}

function priorityValue(priority: Priority) {
  return priority === 'Urgent' ? 4 : priority === 'High' ? 3 : priority === 'Normal' ? 2 : 1;
}

function sharedStockBeforeAutomaticReservation(state: AppState, materialId: string) {
  const sharedPurchases = state.purchases.filter((purchase) => purchase.projectId == null && purchase.materialId === materialId)
    .reduce((sum, purchase) => sum + purchase.quantity * (purchase.reversesPurchaseId ? -1 : 1), 0);
  const sharedInventory = (state.inventoryBalances || []).filter((entry) => entry.projectId == null && entry.materialId === materialId)
    .reduce((sum, entry) => sum + Math.max(0, entry.quantity), 0);
  const reserved = state.allocations.filter((entry) => entry.materialId === materialId).reduce((sum, entry) => sum + entry.quantity, 0);
  return Math.max(0, sharedPurchases + sharedInventory - reserved);
}

function automaticSharedAllocations(state: AppState, materialId: string, catalog: CatalogItem[]) {
  let remaining = sharedStockBeforeAutomaticReservation(state, materialId);
  const allocations = new Map<string, number>();
  const projects = [...state.projects].sort((a, b) => priorityValue(b.priority) - priorityValue(a.priority)
    || (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.createdAt.localeCompare(b.createdAt));
  for (const project of projects) {
    if (remaining <= 0) break;
    const row = projectMaterials(state, project, catalog, false).find((entry) => entry.id === materialId);
    if (!row?.missing) continue;
    const quantity = Math.min(remaining, row.missing);
    allocations.set(project.id, quantity);
    remaining -= quantity;
  }
  return allocations;
}

export function projectMaterials(state: AppState, project: Project, catalog: CatalogItem[], includeSharedInventory = true): MaterialSummary[] {
  const { recipe } = recipeFor(project, catalog);
  if (!recipe) return [];
  const rate = projectReturnRate(state, project);
  const projectNeeds = recipeRequirements(recipe, project.target, rate);
  const baseNeeds = recipeRequirements(recipe, project.target);
  const estimatedReturns = expectedReturns(recipe, project.target, rate);
  const allocationState = state.projects.some((entry) => entry.id === project.id) ? state : { ...state, projects: [...state.projects, project] };
  const projectSessions = state.sessions.filter((entry) => entry.projectId === project.id);
  const sessionCrafted = projectSessions.reduce((sum, session) => sum + session.quantity, 0);
  const consumedByRecipe = new Map<string, number>();
  for (const session of projectSessions) {
    const sessionRecipe = session.recipeId
      ? catalog.find((item) => item.id === project.itemId)?.recipes.find((entry) => entry.id === session.recipeId) || recipe
      : recipe;
    for (const [id, material] of recipeRequirements(sessionRecipe, session.quantity)) {
      consumedByRecipe.set(id, (consumedByRecipe.get(id) || 0) + material.count);
    }
  }
  for (const [id, count] of Object.entries(project.completionMaterialConsumption || {})) {
    consumedByRecipe.set(id, (consumedByRecipe.get(id) || 0) + count);
  }
  const unrecordedCrafted = Math.max(0, project.crafted - sessionCrafted);
  for (const [id, material] of recipeRequirements(recipe, unrecordedCrafted)) {
    consumedByRecipe.set(id, (consumedByRecipe.get(id) || 0) + material.count);
  }
  const recordedReturns = new Map<string, number>();
  for (const session of state.sessions.filter((entry) => entry.projectId === project.id)) {
    for (const [id, count] of Object.entries(session.actualReturns || {})) recordedReturns.set(id, (recordedReturns.get(id) || 0) + count);
  }
  const materialIds = new Set([...projectNeeds.keys(), ...consumedByRecipe.keys(), ...state.purchases.filter((entry) => entry.projectId === project.id).map((entry) => entry.materialId), ...state.allocations.filter((entry) => entry.projectId === project.id).map((entry) => entry.materialId), ...(state.inventoryBalances || []).filter((entry) => entry.projectId === project.id).map((entry) => entry.materialId), ...recordedReturns.keys()]);
  return [...materialIds].map((materialId) => {
    const material = projectNeeds.get(materialId) || recipe.materials.find((entry) => entry.id === materialId)
      || catalog.find((entry) => entry.id === project.itemId)?.recipes.flatMap((entry) => entry.materials).find((entry) => entry.id === materialId)
      || state.purchases.find((entry) => entry.materialId === materialId)?.materialName && { id: materialId, name: state.purchases.find((entry) => entry.materialId === materialId)!.materialName, count: 0, returnable: false }
      || state.allocations.find((entry) => entry.materialId === materialId)?.materialName && { id: materialId, name: state.allocations.find((entry) => entry.materialId === materialId)!.materialName, count: 0, returnable: false }
      || (state.inventoryBalances || []).find((entry) => entry.projectId === project.id && entry.materialId === materialId) && { id: materialId, name: (state.inventoryBalances || []).find((entry) => entry.projectId === project.id && entry.materialId === materialId)!.materialName, count: 0, returnable: false };
    if (!material) return null;
    const baseConsumed = consumedByRecipe.get(material.id) || 0;
    const actualReturns = Math.min(baseConsumed, recordedReturns.get(material.id) || 0);
    const consumed = Math.max(0, baseConsumed - actualReturns);
    const directlyAcquired = state.purchases
      .filter((purchase) => purchase.projectId === project.id && purchase.materialId === material.id)
      .reduce((sum, purchase) => sum + purchase.quantity * (purchase.reversesPurchaseId ? -1 : 1), 0);
    const allocated = state.allocations
      .filter((allocation) => allocation.projectId === project.id && allocation.materialId === material.id)
      .reduce((sum, allocation) => sum + allocation.quantity, 0);
    const automaticAllocation = includeSharedInventory ? automaticSharedAllocations(allocationState, material.id, catalog).get(project.id) || 0 : 0;
    const acquired = directlyAcquired + allocated + automaticAllocation;
    const savedBalance = (state.inventoryBalances || []).find((entry) => entry.projectId === project.id && entry.materialId === material.id)?.quantity || 0;
    const balance = savedBalance;
    const available = Math.max(0, acquired - baseConsumed + actualReturns + balance);
    const alreadyExpected = recipeRequirements(recipe, project.crafted, rate).get(material.id)?.count || 0;
    const remainingNet = Math.max(0, (projectNeeds.get(material.id)?.count || 0) - alreadyExpected);
    const firstCraftInputs = project.target > project.crafted
      ? recipeRequirements(recipe, Math.min(Math.max(1, recipe.outputCount), project.target - project.crafted)).get(material.id)?.count || 0
      : 0;
    const expectedRemaining = isProjectCompleted(project) ? 0 : Math.max(remainingNet, firstCraftInputs);
    const missing = Math.max(0, expectedRemaining - available);
    const purchases = state.purchases.filter((purchase) => purchase.projectId === project.id && purchase.materialId === material.id
      && purchase.unitPrice != null && (purchase.unitPrice > 0 || purchase.zeroPriceConfirmed));
    const allocatedPurchases = state.allocations.filter((allocation) => allocation.projectId === project.id && allocation.materialId === material.id
      && allocation.unitPriceAtAllocation != null && (allocation.unitPriceAtAllocation > 0 || allocation.zeroPriceConfirmed));
    const sharedPricedPurchases = state.purchases.filter((purchase) => purchase.projectId == null && purchase.materialId === material.id
      && purchase.unitPrice != null && (purchase.unitPrice > 0 || purchase.zeroPriceConfirmed));
    const sharedPricedQuantity = Math.max(0, sharedPricedPurchases.reduce((sum, purchase) => sum + purchase.quantity * (purchase.reversesPurchaseId ? -1 : 1), 0));
    const automaticPricedQuantity = Math.min(automaticAllocation, sharedPricedQuantity);
    const sharedPricedCost = sharedPricedPurchases.reduce((sum, purchase) => sum + purchase.quantity * (purchase.unitPrice || 0) * (purchase.reversesPurchaseId ? -1 : 1), 0);
    const automaticAllocatedCost = sharedPricedQuantity ? automaticPricedQuantity * sharedPricedCost / sharedPricedQuantity : 0;
    const purchasedQuantity = purchases.reduce((sum, purchase) => sum + purchase.quantity * (purchase.reversesPurchaseId ? -1 : 1), 0)
      + allocatedPurchases.reduce((sum, allocation) => sum + allocation.quantity, 0) + automaticPricedQuantity;
    const weightedAverage = purchasedQuantity > 0 ? (purchases.reduce((sum, purchase) => sum + purchase.quantity * (purchase.unitPrice || 0) * (purchase.reversesPurchaseId ? -1 : 1), 0)
      + allocatedPurchases.reduce((sum, allocation) => sum + allocation.quantity * (allocation.unitPriceAtAllocation || 0), 0) + automaticAllocatedCost) / purchasedQuantity : null;
    const pricedAcquired = Math.min(Math.max(0, acquired), Math.max(0, purchasedQuantity));
    const unpricedAcquired = Math.max(0, acquired - pricedAcquired) + Math.max(0, balance);
    const allOrderRecords = state.orders.filter((order) => order.projectId === project.id && order.materialId === material.id);
    const orderRecords = allOrderRecords.filter((order) => !order.cancelled && !order.archived);
    const ordered = orderRecords.reduce((sum, order) => sum + order.quantity, 0);
    const orderRemaining = orderRecords.reduce((sum, order) => sum + Math.max(0, order.quantity - order.fulfilled), 0);
    const awaitingReceipt = allOrderRecords.reduce((sum, order) => sum + Math.max(0, order.fulfilled - order.received), 0);
    const orderAcquired = state.purchases.filter((purchase) => purchase.materialId === material.id && purchase.orderId
      && state.orders.some((order) => order.id === purchase.orderId && order.projectId === project.id))
      .reduce((sum, purchase) => sum + purchase.quantity * (purchase.reversesPurchaseId ? -1 : 1), 0);
    const notCovered = Math.max(0, missing - orderRemaining - awaitingReceipt);
    const manual = state.manualPrices[manualPriceKey(project.id, material.id)];
    const auto = state.prices[priceKey(material.id, state.settings.priceCity, state.settings.marketQuality)];
    const manualBuy = manual?.buy === 0 && !manual.zeroBuyConfirmed ? null : manual?.buy;
    const automaticBuy = auto?.buy != null && auto.buy > 0 ? auto.buy : null;
    const automaticSell = auto?.sell != null && auto.sell > 0 ? auto.sell : null;
    const nextPurchaseEstimate = manualBuy ?? automaticBuy ?? automaticSell ?? null;
    const estimatePriceSide = manualBuy != null ? 'manual' : automaticBuy != null ? 'buy' : automaticSell != null ? 'sell' : null;
    const estimateSource = estimatePriceSide === 'manual' ? 'MANUAL' : estimatePriceSide ? 'AUTO' : 'UNAVAILABLE';
    return {
      ...material, required: projectNeeds.get(material.id)?.count || 0, baseRequired: baseNeeds.get(material.id)?.count || 0,
      estimatedReturns: estimatedReturns.get(material.id) || 0,
      expectedRequired: Math.max(0, (baseNeeds.get(material.id)?.count || 0) - (estimatedReturns.get(material.id) || 0)),
      consumed, baseConsumed, actualReturns, acquired, available, missing, pricedAcquired, unpricedAcquired, autoAllocated: automaticAllocation, ordered, orderRemaining, awaitingReceipt, orderAcquired, notCovered,
      weightedAverage, nextPurchaseEstimate, estimateSource, estimatePriceSide,
      remainingEstimatedCost: nextPurchaseEstimate == null ? null : missing * nextPurchaseEstimate * (1 + Math.max(0, state.settings.extraCostPercent) / 100),
    };
  }).filter((row): row is MaterialSummary => row != null);
}

/** Aggregate active-project shortages after priority-based shared stock allocation. */
export function materialShortageOverview(state: AppState, catalog: CatalogItem[]): MaterialShortageSummary[] {
  const activeProjects = state.projects.filter((project) => !isProjectCompleted(project));
  const activeProjectIds = new Set(activeProjects.map((project) => project.id));
  const projectRows = activeProjects.flatMap((project) => projectMaterials(state, project, catalog)
    .filter((row) => row.required > 0)
    .map((row) => ({ project, row })));
  const grouped = new Map<string, Array<{ project: Project; row: MaterialSummary }>>();
  for (const entry of projectRows) {
    const group = grouped.get(entry.row.id) || [];
    group.push(entry);
    grouped.set(entry.row.id, group);
  }

  const receiptByOrder = new Map<string, number>();
  for (const purchase of state.purchases) {
    if (!purchase.orderId) continue;
    receiptByOrder.set(purchase.orderId, (receiptByOrder.get(purchase.orderId) || 0) + purchase.quantity * (purchase.reversesPurchaseId ? -1 : 1));
  }

  return [...grouped.entries()].map(([materialId, entries]) => {
    const first = entries[0].row;
    const required = entries.reduce((sum, { row }) => sum + row.required, 0);
    const available = entries.reduce((sum, { row }) => sum + row.available, 0);
    const stillNeeded = entries.reduce((sum, { row }) => sum + row.missing, 0);
    const neededProjectIds = new Set(entries.map(({ project }) => project.id));
    const relatedOrders = state.orders.filter((order) => order.materialId === materialId && neededProjectIds.has(order.projectId));
    const orders: MaterialShortageOrder[] = relatedOrders.map((order) => ({
      ...order,
      remaining: Math.max(0, order.quantity - order.fulfilled),
      acquired: Math.max(0, receiptByOrder.get(order.id) || 0),
      awaitingReceipt: Math.max(0, order.fulfilled - order.received),
    }));
    const outstandingOrders = orders.filter((order) => !order.cancelled && !order.archived
      && (getOrderStatus(order) === 'Active' || getOrderStatus(order) === 'Partially Fulfilled'));
    const onOrder = outstandingOrders.reduce((sum, order) => sum + order.remaining, 0);
    const notCovered = Math.max(0, stillNeeded - onOrder);
    const confirmedOrderAcquisitions = orders.filter((order) => activeProjectIds.has(order.projectId))
      .reduce((sum, order) => sum + order.acquired, 0);
    // Receipts enter shared inventory. Cap them by currently available stock and demand
    // so an order receipt is not counted twice or treated as available after consumption.
    const acquiredTowardRequirement = Math.min(required, available, confirmedOrderAcquisitions);
    return {
      id: materialId, name: first.name, count: first.count, returnable: first.returnable,
      required, available, stillNeeded, onOrder, notCovered, acquiredTowardRequirement,
      orderCoveragePct: stillNeeded > 0 ? Math.min(onOrder, stillNeeded) / stillNeeded * 100 : null,
      acquisitionProgressPct: stillNeeded > 0 ? Math.min(acquiredTowardRequirement, stillNeeded) / stillNeeded * 100 : null,
      projects: entries.map(({ project, row }) => ({ project, required: row.required, available: row.available, stillNeeded: row.missing })),
      orders,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Set the project's current on-hand count without creating a purchase record. */
export function setProjectMaterialBalance(state: AppState, project: Project, material: Material, desiredAvailable: number, catalog: CatalogItem[]): AppState {
  if (!Number.isInteger(desiredAvailable) || desiredAvailable < 0) return state;
  const current = projectMaterials(state, project, catalog).find((row) => row.id === material.id);
  const base = current ? current.acquired - current.baseConsumed + current.actualReturns : 0;
  const quantity = desiredAvailable - base;
  const balances = (state.inventoryBalances || []).filter((entry) => !(entry.projectId === project.id && entry.materialId === material.id));
  balances.push({ id: `${project.id}:${material.id}`, projectId: project.id, materialId: material.id, materialName: material.name, quantity, updatedAt: new Date().toISOString() });
  return { ...state, inventoryBalances: balances };
}

export function batchRequirements(recipe: Recipe, craftedBefore: number, batch: number, returnRate = 0) {
  const after = recipeRequirements(recipe, craftedBefore + batch, returnRate);
  const before = recipeRequirements(recipe, craftedBefore, returnRate);
  const firstCraft = recipeRequirements(recipe, Math.min(Math.max(1, recipe.outputCount), batch));
  return new Map([...after.entries()].map(([id, material]) => [id, {
    ...material, count: Math.max(material.count - (before.get(id)?.count || 0), firstCraft.get(id)?.count || 0),
  }]));
}

export function missingForBatch(state: AppState, project: Project, catalog: CatalogItem[], batch: number, returnRate = projectReturnRate(state, project)) {
  const { recipe } = recipeFor(project, catalog);
  if (!recipe || batch <= 0) return [];
  const requirements = batchRequirements(recipe, project.crafted, batch, returnRate);
  const summary = new Map(projectMaterials(state, project, catalog).map((material) => [material.id, material]));
  return [...requirements.values()].map((material) => {
    const available = summary.get(material.id)?.available || 0;
    return { ...material, missing: Math.max(0, material.count - available) };
  }).filter((material) => material.missing > 0);
}

export function maxCraftable(state: AppState, project: Project, catalog: CatalogItem[]) {
  const remaining = Math.max(0, project.target - project.crafted);
  if (remaining === 0) return 0;
  let low = 0;
  let high = remaining;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (missingForBatch(state, project, catalog, mid).length === 0) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function getOrderStatus(order: BuyOrder): 'Planned' | 'Active' | 'Partially Fulfilled' | 'Fulfilled' | 'Cancelled' | 'Archived' {
  if (order.archived) return 'Archived';
  if (order.cancelled) return 'Cancelled';
  if (order.received >= order.quantity) return 'Fulfilled';
  if (order.received > 0) return 'Partially Fulfilled';
  return order.mode;
}

export function getPriceFreshness(price: AutoPrice | undefined, freshnessMinutes: number, now = Date.now(), side: 'buy' | 'sell' | 'either' = 'either'): 'AUTO — Fresh' | 'AUTO — Stale' | 'AUTO — Unverified' | 'UNAVAILABLE' {
  if (!price) return 'UNAVAILABLE';
  const entries: Array<[number | null, string | null]> = side === 'buy' ? [[price.buy, price.buyAt]] : side === 'sell' ? [[price.sell, price.sellAt]] : [[price.buy, price.buyAt], [price.sell, price.sellAt]];
  const available = entries.filter(([value]) => value != null && value > 0);
  if (!available.length) return 'UNAVAILABLE';
  if ((side !== 'sell' && price.buy != null && price.buyUnavailableAt) || (side !== 'buy' && price.sell != null && price.sellUnavailableAt)
    || (side === 'buy' && price.buyUnavailableAt) || (side === 'sell' && price.sellUnavailableAt)) return 'AUTO — Stale';
  const timestamps = available.map(([, date]) => date ? Date.parse(date) : NaN);
  if (timestamps.some((timestamp) => !Number.isFinite(timestamp))) return 'AUTO — Unverified';
  const oldest = Math.min(...timestamps);
  const age = now - oldest;
  if (age < 0) return 'AUTO — Unverified';
  return age <= freshnessMinutes * 60_000 ? 'AUTO — Fresh' : 'AUTO — Stale';
}

export function mergePriceSnapshot(previous: AutoPrice | undefined, incoming: AutoPrice): AutoPrice {
  const buyUnavailable = incoming.buy == null && previous?.buy != null;
  const sellUnavailable = incoming.sell == null && previous?.sell != null;
  return {
    buy: incoming.buy ?? previous?.buy ?? null,
    sell: incoming.sell ?? previous?.sell ?? null,
    buyAt: incoming.buy != null ? incoming.buyAt : previous?.buyAt ?? null,
    sellAt: incoming.sell != null ? incoming.sellAt : previous?.sellAt ?? null,
    buyUnavailableAt: incoming.buy != null ? null : buyUnavailable ? incoming.refreshedAt : incoming.buyUnavailableAt ?? null,
    sellUnavailableAt: incoming.sell != null ? null : sellUnavailable ? incoming.refreshedAt : incoming.sellUnavailableAt ?? null,
    refreshedAt: incoming.refreshedAt,
  };
}

export function nextBatchTarget(project: Project) {
  const left = Math.max(0, project.target - project.crafted);
  return Math.min(left, project.dailyTarget > 0 ? project.dailyTarget : left);
}

export const JOURNAL_FAME_BY_TIER: Record<number, number> = { 2: 900, 3: 1800, 4: 3600, 5: 7200, 6: 14400, 7: 28380, 8: 58590 };

export function journalPlan(project: Project, item: CatalogItem | undefined, quantity: number) {
  const fame = project.journalFamePerItem;
  const threshold = item ? JOURNAL_FAME_BY_TIER[item.tier] : undefined;
  if (!fame || fame <= 0 || !threshold || quantity <= 0) return null;
  const totalFame = quantity * fame;
  const journals = Math.ceil(totalFame / threshold);
  return { journals, fullyFillable: Math.floor(totalFame / threshold), partialFame: totalFame % threshold, estimate: true as const };
}

export function sharedUnallocated(state: AppState, materialId: string, catalog?: CatalogItem[]) {
  const physicalUnallocated = sharedStockBeforeAutomaticReservation(state, materialId);
  if (!catalog || physicalUnallocated <= 0) return physicalUnallocated;
  const automaticallyReserved = [...automaticSharedAllocations(state, materialId, catalog).values()].reduce((sum, quantity) => sum + quantity, 0);
  return Math.max(0, physicalUnallocated - automaticallyReserved);
}

export function recordOrderReceipt(state: AppState, orderId: string, quantity: number, _unitPrice: number | null, date: string, notes = '', confirmationId: string = newId()): AppState | null {
  const order = state.orders.find((entry) => entry.id === orderId);
  const outstanding = order ? order.quantity - order.received : 0;
  const cancelledPendingFill = order?.cancelled && order.fulfilled > order.received;
  if (!order || !Number.isInteger(quantity) || quantity <= 0 || quantity > outstanding
    || state.purchases.some((purchase) => purchase.id === confirmationId)
    || order.archived || (order.cancelled ? !cancelledPendingFill : order.mode !== 'Active' && order.received === 0 && order.fulfilled <= order.received)) return null;
  const nextReceived = order.received + quantity;
  const purchase: Purchase = {
    id: confirmationId, projectId: null, materialId: order.materialId, materialName: order.materialName,
    city: order.city, quantity, unitPrice: order.unitPrice, date, notes, orderId: order.id, zeroPriceConfirmed: order.zeroPriceConfirmed,
  };
  return {
    ...state,
    purchases: [...state.purchases, purchase],
    orders: state.orders.map((entry) => entry.id === order.id ? { ...entry, received: nextReceived, fulfilled: Math.max(entry.fulfilled, nextReceived) } : entry),
  };
}

export function reverseOrderPurchase(state: AppState, purchaseId: string, date: string, notes = 'Acquisition reversed') {
  const purchase = state.purchases.find((entry) => entry.id === purchaseId && entry.orderId && !entry.reversesPurchaseId);
  const order = purchase ? state.orders.find((entry) => entry.id === purchase.orderId) : undefined;
  if (!purchase || !order) return null;
  const alreadyReversed = state.purchases.filter((entry) => entry.reversesPurchaseId === purchase.id).reduce((sum, entry) => sum + entry.quantity, 0);
  const quantity = purchase.quantity - alreadyReversed;
  if (quantity <= 0 || order.received < quantity) return null;
  const reversal: Purchase = { ...purchase, id: newId(), quantity, date, notes, reversesPurchaseId: purchase.id };
  return {
    ...state, purchases: [...state.purchases, reversal],
    orders: state.orders.map((entry) => entry.id === order.id ? {
      ...entry, received: entry.received - quantity, fulfilled: Math.max(0, entry.received - quantity, entry.fulfilled - quantity),
    } : entry),
  };
}

export function validateState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as AppState;
  const object = (entry: unknown): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry);
  const nonnegative = (entry: unknown) => typeof entry === 'number' && Number.isFinite(entry) && entry >= 0;
  const positiveInt = (entry: unknown) => Number.isInteger(entry) && Number(entry) > 0;
  const maybePrice = (entry: unknown) => entry == null || nonnegative(entry);
  if (candidate.version !== 1 || !object(candidate.settings) || !Array.isArray(candidate.projects)
    || !Array.isArray(candidate.purchases) || !Array.isArray(candidate.allocations)
    || !Array.isArray(candidate.orders) || !Array.isArray(candidate.sessions) || !Array.isArray(candidate.tasks)
    || !object(candidate.prices) || !object(candidate.manualPrices)) return false;
  const settings = candidate.settings;
  if (!['west', 'east', 'europe'].includes(settings.server) || !Array.isArray(settings.cities)
    || settings.cities.length === 0 || !settings.cities.every((city) => typeof city === 'string' && city.trim().length > 0)
    || typeof settings.priceCity !== 'string' || !settings.cities.includes(settings.priceCity)
    || !Number.isInteger(settings.marketQuality) || Number(settings.marketQuality) < 1 || Number(settings.marketQuality) > 5
    || !Number.isInteger(settings.freshMinutes) || Number(settings.freshMinutes) < 1
    || !Number.isInteger(settings.autoRefreshMinutes) || Number(settings.autoRefreshMinutes) < 5
    || typeof settings.autoRefresh !== 'boolean' || typeof settings.applyReturnRate !== 'boolean'
    || !nonnegative(settings.returnRate) || Number(settings.returnRate) > 100
    || (settings.sellingTaxPercent != null && (!nonnegative(settings.sellingTaxPercent) || Number(settings.sellingTaxPercent) > 100))
    || !nonnegative(settings.extraCostPercent) || Number(settings.extraCostPercent) > 100) return false;
  if (!candidate.projects.every((entry) => object(entry) && typeof entry.id === 'string' && typeof entry.name === 'string'
    && typeof entry.itemId === 'string' && typeof entry.recipeId === 'string' && positiveInt(entry.target)
    && Number.isInteger(entry.crafted) && Number(entry.crafted) >= 0 && Number(entry.crafted) <= Number(entry.target)
    && (entry.completed == null || typeof entry.completed === 'boolean')
    && (entry.completedAt == null || typeof entry.completedAt === 'string')
    && (entry.completionHistory == null || Array.isArray(entry.completionHistory) && entry.completionHistory.every((record) => object(record)
      && typeof record.completedAt === 'string' && positiveInt(record.target) && typeof record.recipeId === 'string'))
    && (entry.completionMaterialConsumption == null || object(entry.completionMaterialConsumption)
      && Object.values(entry.completionMaterialConsumption).every((count) => nonnegative(count)))
    && (entry.sellingPrice == null || nonnegative(entry.sellingPrice))
    && Number.isInteger(entry.dailyTarget) && Number(entry.dailyTarget) >= 0
    && (entry.returnRate == null || (nonnegative(entry.returnRate) && Number(entry.returnRate) <= 100))
    && (entry.journalType == null || typeof entry.journalType === 'string')
    && (entry.journalFamePerItem == null || nonnegative(entry.journalFamePerItem))
    && (['journalsOwned', 'journalsFilled', 'journalsInProgress', 'journalsBought', 'journalsSold'] as const).every((key) => entry[key] == null || (Number.isInteger(entry[key]) && Number(entry[key]) >= 0))
    && ['Low', 'Normal', 'High', 'Urgent'].includes(String(entry.priority)))) return false;
  if (!candidate.purchases.every((entry) => object(entry) && typeof entry.id === 'string'
    && (entry.projectId == null || typeof entry.projectId === 'string') && typeof entry.materialId === 'string'
    && typeof entry.materialName === 'string' && typeof entry.city === 'string' && positiveInt(entry.quantity)
    && maybePrice(entry.unitPrice) && typeof entry.date === 'string'
    && (entry.orderId == null || typeof entry.orderId === 'string')
    && (entry.reversesPurchaseId == null || typeof entry.reversesPurchaseId === 'string'))) return false;
  if (new Set(candidate.purchases.map((entry) => entry.id)).size !== candidate.purchases.length) return false;
  for (const reversal of candidate.purchases.filter((entry) => entry.reversesPurchaseId)) {
    const original = candidate.purchases.find((entry) => entry.id === reversal.reversesPurchaseId);
    const totalReversed = candidate.purchases.filter((entry) => entry.reversesPurchaseId === reversal.reversesPurchaseId).reduce((sum, entry) => sum + entry.quantity, 0);
    if (!original || original.reversesPurchaseId || !original.orderId || reversal.orderId !== original.orderId || totalReversed > original.quantity) return false;
  }
  if (!candidate.allocations.every((entry) => object(entry) && typeof entry.id === 'string'
    && typeof entry.materialId === 'string' && typeof entry.materialName === 'string'
    && typeof entry.projectId === 'string' && positiveInt(entry.quantity) && typeof entry.date === 'string'
    && maybePrice(entry.unitPriceAtAllocation))) return false;
  if (!candidate.orders.every((entry) => object(entry) && typeof entry.id === 'string' && typeof entry.projectId === 'string'
    && typeof entry.materialId === 'string' && typeof entry.materialName === 'string' && typeof entry.city === 'string'
    && positiveInt(entry.quantity) && nonnegative(entry.unitPrice) && Number.isInteger(entry.fulfilled)
    && Number(entry.fulfilled) >= 0 && Number(entry.fulfilled) <= Number(entry.quantity)
    && Number.isInteger(entry.received) && Number(entry.received) >= 0 && Number(entry.received) <= Number(entry.fulfilled)
    && (entry.setupFees == null || nonnegative(entry.setupFees))
    && typeof entry.cancelled === 'boolean' && typeof entry.archived === 'boolean')) return false;
  if (!candidate.sessions.every((entry) => object(entry) && typeof entry.id === 'string'
    && typeof entry.projectId === 'string' && positiveInt(entry.quantity) && typeof entry.date === 'string'
    && (entry.returnRate == null || (nonnegative(entry.returnRate) && Number(entry.returnRate) <= 100))
    && (entry.actualReturns == null || (object(entry.actualReturns) && Object.values(entry.actualReturns).every((count) => Number.isInteger(count) && Number(count) >= 0)))
    && (entry.recipeId == null || typeof entry.recipeId === 'string')
    && (['journalsFilled', 'journalsPartial'] as const).every((key) => entry[key] == null || (Number.isInteger(entry[key]) && Number(entry[key]) >= 0)))) return false;
  if (new Set(candidate.sessions.map((entry) => entry.id)).size !== candidate.sessions.length) return false;
  if (candidate.inventoryBalances != null && (!Array.isArray(candidate.inventoryBalances) || !candidate.inventoryBalances.every((entry) => object(entry)
    && typeof entry.id === 'string' && (entry.projectId == null || typeof entry.projectId === 'string')
    && typeof entry.materialId === 'string' && typeof entry.materialName === 'string'
    && typeof entry.quantity === 'number' && Number.isFinite(entry.quantity) && typeof entry.updatedAt === 'string'))) return false;
  if (!candidate.tasks.every((entry) => object(entry) && typeof entry.id === 'string'
    && typeof entry.projectId === 'string' && typeof entry.title === 'string' && typeof entry.completed === 'boolean'
    && ['Low', 'Normal', 'High', 'Urgent'].includes(String(entry.priority)))) return false;
  if (!Object.values(candidate.prices).every((entry) => object(entry) && maybePrice(entry.buy) && maybePrice(entry.sell)
    && (entry.buyAt == null || typeof entry.buyAt === 'string') && (entry.sellAt == null || typeof entry.sellAt === 'string')
    && (entry.buyUnavailableAt == null || typeof entry.buyUnavailableAt === 'string')
    && (entry.sellUnavailableAt == null || typeof entry.sellUnavailableAt === 'string')
    && typeof entry.refreshedAt === 'string')) return false;
  if (!Object.values(candidate.manualPrices).every((entry) => object(entry) && maybePrice(entry.buy)
    && maybePrice(entry.sell) && typeof entry.updatedAt === 'string')) return false;
  return true;
}
