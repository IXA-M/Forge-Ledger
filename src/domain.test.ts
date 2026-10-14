import { describe, expect, it } from 'vitest';
import catalogData from './catalog.json';
import {
  batchRequirements, emptyState, expectedReturns, formatItemName, formatMaterialName, formatNumber, formatSilver, formatTier, getOrderStatus, getPriceFreshness, isProjectCompleted, journalPlan, manualPriceKey, markProjectCrafted, materialReadiness, materialShortageOverview, mergePriceSnapshot, priceKey, projectMaterialCost, projectMaterials,
  recipeRequirements, recordOrderReceipt, reverseOrderPurchase, setProjectMaterialBalance, sharedUnallocated, validateState, type AppState, type BuyOrder, type CatalogItem, type Project, type Recipe,
  resourceReturnRateFromProductionBonus,
} from './domain';

const recipeItem: CatalogItem = {
  id: 'T4_TEST_SWORD', name: 'Test Sword', category: 'Weapons', subcategory: 'Sword', tier: 4, sourceType: 'weapon',
  recipes: [{ id: 'T4_TEST_SWORD', label: 'Standard recipe', outputCount: 1, materials: [
    { id: 'T4_METALBAR', name: 'Metal Bar', count: 10, returnable: true },
    { id: 'T4_ARTIFACT', name: 'Artifact', count: 2, returnable: false },
  ] }],
};
const batchItem: CatalogItem = {
  ...recipeItem, id: 'T4_TEST_POTION', name: 'Test Potion',
  recipes: [{ id: 'T4_TEST_POTION', label: 'Standard recipe', outputCount: 5, materials: [{ id: 'T4_HERB', name: 'Herb', count: 8, returnable: true }] }],
};
const project: Project = { id: 'p1', name: 'Sword stock', itemId: recipeItem.id, recipeId: recipeItem.id, target: 10, crafted: 0, createdAt: '2026-01-01', deadline: '', notes: '', priority: 'Normal', dailyTarget: 2 };
const catalog: CatalogItem[] = [recipeItem, batchItem];
const gameCatalog = catalogData as CatalogItem[];
const makeOrder = (overrides: Partial<BuyOrder> = {}): BuyOrder => ({
  id: 'shortage-order', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch',
  unitPrice: 10, quantity: 100, fulfilled: 0, received: 0, placedAt: '2026-01-01', notes: '', mode: 'Active',
  cancelled: false, archived: false, ...overrides,
});

describe('readable item and price formatting', () => {
  it('shows enchanted item and material names with Albion decimal enchant notation', () => {
    expect(formatItemName("Adept's Assassin Jacket", 'T4_ARMOR_LEATHER_SET3@3')).toBe("Adept's Assassin Jacket .3");
    expect(formatMaterialName('T4_METALBAR_LEVEL3', 'Metalbar Level3', new Map([['T4_METALBAR', 'Steel Bar']]))).toBe('Steel Bar .3');
    expect(formatMaterialName('T4_METALBAR@3', 'Metalbar@3')).toBe('Metalbar .3');
    expect(formatMaterialName('T4_METALBAR', 'Enchantment 3')).toBe('.3');
  });

  it('groups large quantities and silver prices with commas while keeping cents', () => {
    expect(formatNumber(1234567.5)).toBe('1,234,567.5');
    expect(formatSilver(1234567.5)).toBe('1,234,567.5 silver');
  });

  it('includes item enchantment beside the tier in project labels', () => {
    expect(formatTier(6, 'T6_ARMOR_LEATHER_SET3@3')).toBe('Tier 6.3');
    expect(formatTier(6, 'T6_ARMOR_LEATHER_SET3')).toBe('Tier 6');
  });
});

describe('recipe requirement calculations', () => {
  it('multiplies actual recipe inputs for multiple items and preserves non-returnable artifacts', () => {
    const required = recipeRequirements(recipeItem.recipes[0], 4);
    expect(required.get('T4_METALBAR')?.count).toBe(40);
    expect(required.get('T4_ARTIFACT')?.count).toBe(8);
  });

  it('uses recipe yield when calculating stackable crafting batches', () => {
    expect(recipeRequirements(batchItem.recipes[0], 10).get('T4_HERB')?.count).toBe(16);
    expect(recipeRequirements(batchItem.recipes[0], 11).get('T4_HERB')?.count).toBe(24);
  });

  it('applies a configured return rate only to returnable ingredients', () => {
    const returned = recipeRequirements(recipeItem.recipes[0], 3, 0.2);
    expect(returned.get('T4_METALBAR')?.count).toBe(24);
    expect(returned.get('T4_ARTIFACT')?.count).toBe(6);
  });

  it('aggregates expected return rounding over a bulk craft and keeps exact base inputs', () => {
    const recipe = { ...recipeItem.recipes[0], materials: [{ id: 'ORE', name: 'Ore', count: 16, returnable: true }] };
    expect(recipeRequirements(recipe, 100).get('ORE')?.count).toBe(1600);
    expect(expectedReturns(recipe, 100, 0.3).get('ORE')).toBe(480);
    expect(recipeRequirements(recipe, 100, 0.3).get('ORE')?.count).toBe(1120);
    expect(recipeRequirements(recipe, 100, 0).get('ORE')?.count).toBe(1600);
  });

  it('keeps the first full craft input available even when expected net use is lower', () => {
    const recipe = { ...recipeItem.recipes[0], materials: [{ id: 'ORE', name: 'Ore', count: 16, returnable: true }] };
    expect(expectedReturns(recipe, 1, 0.3).get('ORE')).toBe(5);
    expect(recipeRequirements(recipe, 1, 0.3).get('ORE')?.count).toBe(12);
    expect(batchRequirements(recipe, 0, 1, 0.3).get('ORE')?.count).toBe(16);
  });

  it('converts Albion production bonus to effective RRR using the game formula', () => {
    expect(resourceReturnRateFromProductionBonus(18)).toBeCloseTo(18 / 118, 8);
    expect(resourceReturnRateFromProductionBonus(0)).toBe(0);
  });

  it('does not refund artifact inputs at any configured return rate', () => {
    const requirements = recipeRequirements(recipeItem.recipes[0], 100, 0.8);
    expect(requirements.get('T4_ARTIFACT')?.count).toBe(200);
  });
});

describe('project stock and progress', () => {
  it('calculates material readiness evenly by required quantity and caps excess stock', () => {
    const state = emptyState();
    state.projects = [{ ...project }];
    state.purchases = [{ id: 'bars', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', quantity: 1000, unitPrice: 10, date: '2026-01-01', notes: '' }];
    expect(materialReadiness(state, project, catalog)).toBe(83);
    state.purchases.push({ id: 'artifact', projectId: project.id, materialId: 'T4_ARTIFACT', materialName: 'Artifact', city: 'Bridgewatch', quantity: 20, unitPrice: 20, date: '2026-01-01', notes: '' });
    expect(materialReadiness(state, project, catalog)).toBe(100);
  });

  it('does not count outstanding buy orders as acquired materials, but counts confirmed inventory', () => {
    const state = emptyState();
    state.projects = [{ ...project }];
    state.orders = [{ id: 'order', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', unitPrice: 10, quantity: 100, fulfilled: 100, received: 0, placedAt: '2026-01-01', notes: '', mode: 'Active', cancelled: false, archived: false }];
    expect(materialReadiness(state, project, catalog)).toBe(0);
    state.purchases.push({ id: 'receipt', projectId: null, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', quantity: 100, unitPrice: 10, date: '2026-01-02', notes: '', orderId: 'order' });
    expect(materialReadiness(state, project, catalog)).toBe(83);
  });

  it('recalculates readiness for inventory, RRR, and recipe changes and exposes unavailable requirements', () => {
    const state = emptyState();
    state.projects = [{ ...project }];
    state.inventoryBalances = [{ id: 'stock', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', quantity: 50, updatedAt: '2026-01-01' }];
    expect(materialReadiness(state, project, catalog)).toBe(41);
    expect(materialReadiness(state, { ...project, returnRate: 50 }, catalog)).toBe(71);
    expect(materialReadiness(state, project, [])).toBeNull();
    const alternate = { id: 'T4_TEST_SWORD:alt', label: 'Alternative', outputCount: 1, materials: [{ id: 'ALT_MAT', name: 'Alternative Material', count: 5, returnable: true }] };
    const withAlternate = catalog.map((item) => item.id === recipeItem.id ? { ...item, recipes: [...item.recipes, alternate] } : item);
    const alternateProject = { ...project, recipeId: alternate.id };
    const alternateState = emptyState();
    alternateState.projects = [alternateProject];
    alternateState.inventoryBalances = [{ id: 'alt-stock', projectId: project.id, materialId: 'ALT_MAT', materialName: 'Alternative Material', quantity: 25, updatedAt: '2026-01-01' }];
    expect(projectMaterials(alternateState, alternateProject, withAlternate).find((row) => row.id === 'ALT_MAT')?.required).toBe(50);
    expect(materialReadiness(alternateState, alternateProject, withAlternate)).toBe(50);
  });

  it('estimates cost from confirmed weighted prices or a current price estimate', () => {
    const state = emptyState();
    state.projects = [{ ...project }];
    state.prices[priceKey('T4_METALBAR', state.settings.priceCity)] = { buy: 3, sell: 4, buyAt: null, sellAt: null, refreshedAt: '' };
    state.prices[priceKey('T4_ARTIFACT', state.settings.priceCity)] = { buy: 5, sell: 6, buyAt: null, sellAt: null, refreshedAt: '' };
    expect(projectMaterialCost(state, project, catalog)).toBe(400);
    state.settings.extraCostPercent = 10;
    expect(projectMaterialCost(state, project, catalog)).toBeCloseTo(440);
  });

  it('keeps crafting completion separate from readiness and detects legacy completed projects', () => {
    expect(isProjectCompleted({ ...project, completed: false, crafted: 10 })).toBe(false);
    expect(isProjectCompleted({ ...project, crafted: 10 })).toBe(true);
  });

  it('records confirmed completion once, consumes project stock, and closes active tasks', () => {
    const state = emptyState();
    state.projects = [{ ...project }];
    state.purchases = [
      { id: 'bars', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', quantity: 100, unitPrice: 10, date: '2026-01-01', notes: '' },
      { id: 'artifact', projectId: project.id, materialId: 'T4_ARTIFACT', materialName: 'Artifact', city: 'Bridgewatch', quantity: 20, unitPrice: 20, date: '2026-01-01', notes: '' },
    ];
    state.tasks = [{ id: 'task', projectId: project.id, title: 'Buy materials', description: '', notes: '', dueDate: '', priority: 'Normal', completed: false, createdAt: '2026-01-01' }];
    const completed = markProjectCrafted(state, project.id, catalog, '2026-03-01T12:00:00.000Z')!;
    expect(isProjectCompleted(completed.projects[0])).toBe(true);
    expect(completed.projects[0].completedAt).toBe('2026-03-01T12:00:00.000Z');
    expect(completed.projects[0].completionHistory).toHaveLength(1);
    expect(completed.projects[0].crafted).toBe(0);
    expect(completed.tasks[0].completed).toBe(true);
    expect(projectMaterials(completed, completed.projects[0], catalog).find((row) => row.id === 'T4_METALBAR')?.available).toBe(0);
    expect(markProjectCrafted(completed, project.id, catalog)).toBeNull();
  });

  it('recalculates material need after partial crafting and batched purchases', () => {
    const state = emptyState();
    state.projects = [{ ...project, crafted: 2 }];
    state.purchases = [
      { id: 'buy1', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', quantity: 12, unitPrice: 240, date: '2026-01-01', notes: '' },
      { id: 'buy2', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Martlock', quantity: 13, unitPrice: 260, date: '2026-01-02', notes: '' },
    ];
    const row = projectMaterials(state, state.projects[0], catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(row.required).toBe(100);
    expect(row.consumed).toBe(20);
    expect(row.acquired).toBe(25);
    expect(row.available).toBe(5);
    expect(row.missing).toBe(75);
  });

  it('uses only future material need when the target changes after progress', () => {
    const state = emptyState();
    const edited = { ...project, target: 5, crafted: 2 };
    state.purchases = [{ id: 'buy', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', quantity: 50, unitPrice: null, date: '2026-01-01', notes: '' }];
    const row = projectMaterials(state, edited, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(row.required).toBe(50);
    expect(row.consumed).toBe(20);
    expect(row.available).toBe(30);
    expect(row.missing).toBe(0);
  });

  it('recalculates project totals when the project RRR is edited', () => {
    const state = emptyState();
    const noReturns = projectMaterials(state, { ...project, returnRate: 0 }, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    const updatedRate = projectMaterials(state, { ...project, returnRate: 30 }, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(noReturns.required).toBe(100);
    expect(updatedRate.baseRequired).toBe(100);
    expect(updatedRate.estimatedReturns).toBe(30);
    expect(updatedRate.expectedRequired).toBe(70);
    expect(updatedRate.required).toBe(70);
  });

  it('does not treat a different enchantment variant in inventory as a recipe requirement', () => {
    const item: CatalogItem = { ...recipeItem, recipes: [
      { id: 'T6_ARMOR_LEATHER_DRAGON@2:fire-scales', label: 'Alternative: Fire Dragon Scales', outputCount: 1, materials: [
        { id: 'T6_LEATHER_LEVEL2@2', name: 'Hardened Leather .2', count: 16, returnable: true },
        { id: 'T6_SHARD_FIRE_DRAGON', name: 'T6 Fire Dragon Scale', count: 50, returnable: false },
      ] },
      { id: 'T6_ARMOR_LEATHER_DRAGON@3:fire-scales', label: 'Alternative: Fire Dragon Scales', outputCount: 1, materials: [
        { id: 'T6_LEATHER_LEVEL3@3', name: 'Hardened Leather .3', count: 16, returnable: true },
        { id: 'T6_SHARD_FIRE_DRAGON', name: 'T6 Fire Dragon Scale', count: 50, returnable: false },
      ] },
    ] };
    const enchantedProject = { ...project, itemId: item.id, recipeId: item.recipes[0].id, target: 20, returnRate: 35.7 };
    const state = emptyState();
    state.projects = [enchantedProject];
    state.purchases = [{ id: 'old-stock', projectId: project.id, materialId: 'T6_LEATHER_LEVEL3@3', materialName: 'Hardened Leather .3', city: 'Martlock', quantity: 6, unitPrice: 65000, date: '2026-10-14', notes: '' }];
    const rows = projectMaterials(state, enchantedProject, [item]);
    expect(rows.find((row) => row.id === 'T6_LEATHER_LEVEL2@2')).toMatchObject({ required: 206, missing: 206 });
    expect(rows.find((row) => row.id === 'T6_LEATHER_LEVEL3@3')).toMatchObject({ required: 0, missing: 0 });
  });

  it('does not show unrelated shared inventory or purchases in the project materials list', () => {
    const state = emptyState();
    state.projects = [{ ...project }];
    state.purchases = [{ id: 'shared-scale-purchase', projectId: null, materialId: 'T6_SHARD_FIRE_DRAGON', materialName: 'T6 Fire Dragon Scale', city: 'Martlock', quantity: 50, unitPrice: 4000, date: '2026-10-14', notes: '' }];
    state.inventoryBalances = [{ id: 'shared-leather', projectId: null, materialId: 'T6_LEATHER_LEVEL3@3', materialName: 'Hardened Leather .3', quantity: 6, updatedAt: '2026-10-14' }];

    const rows = projectMaterials(state, project, catalog);
    expect(rows.map((row) => row.id)).toEqual(['T4_METALBAR', 'T4_ARTIFACT']);
  });

  it('does not count consumed materials as available after the project is complete', () => {
    const state = emptyState();
    const complete = { ...project, target: 10, crafted: 10 };
    state.purchases = [{ id: 'buy', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', quantity: 100, unitPrice: 10, date: '2026-01-01', notes: '' }];
    const row = projectMaterials(state, complete, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(row.consumed).toBe(100);
    expect(row.available).toBe(0);
    expect(row.missing).toBe(0);
  });

  it('uses project-specific RRR values independently and applies actual session returns once', () => {
    const state = emptyState();
    state.projects = [
      { ...project, target: 10, crafted: 2, returnRate: 20 },
      { ...project, id: 'p2', target: 10, crafted: 2, returnRate: 0 },
    ];
    state.purchases = [{ id: 'buy', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', quantity: 25, unitPrice: null, date: '2026-01-01', notes: '' }];
    state.sessions = [{ id: 's1', projectId: project.id, quantity: 2, date: '2026-01-02', notes: '', returnRate: 15, actualReturns: { T4_METALBAR: 5 } }];
    const row = projectMaterials(state, state.projects[0], catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    const other = projectMaterials(state, state.projects[1], catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(row.actualReturns).toBe(5);
    expect(row.baseConsumed).toBe(20);
    expect(row.consumed).toBe(15);
    expect(row.available).toBe(10);
    expect(row.missing).toBe(54); // 8 remaining crafts at 20% => 64, minus 10 available
    expect(other.missing).toBe(80);
    // Recalculation reads the single session record; it never appends or re-adds the return.
    expect(projectMaterials(state, state.projects[0], catalog).find((entry) => entry.id === 'T4_METALBAR')?.available).toBe(10);
  });

  it('saves a manual owned quantity without creating a purchase and decreases it as a saved session consumes inputs', () => {
    const state = emptyState();
    const stocked = setProjectMaterialBalance(state, project, recipeItem.recipes[0].materials[0], 10, catalog);
    expect(stocked.purchases).toHaveLength(0);
    expect(projectMaterials(stocked, project, catalog).find((row) => row.id === 'T4_METALBAR')?.available).toBe(10);
    stocked.projects = [{ ...project, crafted: 1 }];
    stocked.sessions = [{ id: 'consume', projectId: project.id, quantity: 1, date: '2026-01-02', notes: '', recipeId: project.recipeId }];
    expect(projectMaterials(stocked, stocked.projects[0], catalog).find((row) => row.id === 'T4_METALBAR')?.available).toBe(0);
  });

  it('counts an explicit actual session return once on top of manually owned stock', () => {
    const state = emptyState();
    const stocked = setProjectMaterialBalance(state, project, recipeItem.recipes[0].materials[0], 10, catalog);
    stocked.projects = [{ ...project, crafted: 1 }];
    stocked.sessions = [{ id: 'return', projectId: project.id, quantity: 1, date: '2026-01-02', notes: '', recipeId: project.recipeId, actualReturns: { T4_METALBAR: 3 } }];
    const row = projectMaterials(stocked, stocked.projects[0], catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(row.actualReturns).toBe(3);
    expect(row.available).toBe(3);
  });

  it('preserves historical material use under the recorded recipe after changing project recipe', () => {
    const alternate = { id: 'T4_TEST_SWORD:alt', label: 'Alternative', outputCount: 1, materials: [{ id: 'ALT_MAT', name: 'Alt Material', count: 5, returnable: true }] };
    const item = { ...recipeItem, recipes: [...recipeItem.recipes, alternate] };
    const state = emptyState();
    const switched = { ...project, recipeId: alternate.id, crafted: 1 };
    state.sessions = [{ id: 'old-recipe', projectId: project.id, quantity: 1, date: '2026-01-02', notes: '', recipeId: recipeItem.recipes[0].id }];
    const rows = projectMaterials(state, switched, [item]);
    expect(rows.find((row) => row.id === 'T4_METALBAR')?.baseConsumed).toBe(10);
    expect(rows.find((row) => row.id === 'ALT_MAT')?.required).toBe(50);
  });

  it('calculates a weighted average from actual priced quantities only', () => {
    const state = emptyState();
    state.purchases = [
      { id: 'a', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', quantity: 500, unitPrice: 240, date: '2026-01-01', notes: '' },
      { id: 'b', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Martlock', quantity: 300, unitPrice: 260, date: '2026-01-02', notes: '' },
      { id: 'c', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Thetford', quantity: 200, unitPrice: null, date: '2026-01-03', notes: '' },
    ];
    const row = projectMaterials(state, project, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(row.weightedAverage).toBe(247.5);
  });
});

describe('material shortage and order progress overview', () => {
  const overviewRow = (state: AppState) => materialShortageOverview(state, catalog).find((row) => row.id === 'T4_METALBAR')!;

  it('reports an uncovered material shortage when there are no buy orders', () => {
    const state = emptyState();
    state.projects = [{ ...project }];
    expect(overviewRow(state)).toMatchObject({ required: 100, available: 0, stillNeeded: 100, onOrder: 0, notCovered: 100, orderCoveragePct: 0, acquisitionProgressPct: 0 });
  });

  it('counts an outstanding active order as coverage but not acquired inventory', () => {
    const state = emptyState();
    state.projects = [{ ...project }];
    state.orders = [makeOrder()];
    expect(overviewRow(state)).toMatchObject({ stillNeeded: 100, onOrder: 100, notCovered: 0, acquiredTowardRequirement: 0, orderCoveragePct: 100, acquisitionProgressPct: 0 });
  });

  it('shows partial receipts and aggregates orders from different cities and prices separately', () => {
    const state = emptyState();
    state.projects = [{ ...project }];
    state.orders = [makeOrder({ id: 'martlock', city: 'Martlock', unitPrice: 11, quantity: 70 }), makeOrder({ id: 'thetford', city: 'Thetford', unitPrice: 14, quantity: 50 })];
    const received = recordOrderReceipt(state, 'martlock', 20, 11, '2026-01-02', '', 'receipt-1')!;
    const row = overviewRow(received);
    expect(row).toMatchObject({ stillNeeded: 80, available: 20, onOrder: 100, notCovered: 0, acquiredTowardRequirement: 20, orderCoveragePct: 100, acquisitionProgressPct: 25 });
    expect(row.orders).toEqual(expect.arrayContaining([
      expect.objectContaining({ city: 'Martlock', unitPrice: 11, quantity: 70, acquired: 20, remaining: 50 }),
      expect.objectContaining({ city: 'Thetford', unitPrice: 14, quantity: 50, acquired: 0, remaining: 50 }),
    ]));
  });

  it('allocates shared inventory once across two projects requiring the same material', () => {
    const secondProject = { ...project, id: 'p2', name: 'Second sword', priority: 'Low' as const };
    const state = emptyState();
    state.projects = [{ ...project, priority: 'Urgent' }, secondProject];
    state.purchases = [{ id: 'shared-bars', projectId: null, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', quantity: 50, unitPrice: 10, date: '2026-01-01', notes: '' }];
    const row = overviewRow(state);
    expect(row.required).toBe(200);
    expect(row.available).toBe(50);
    expect(row.stillNeeded).toBe(150);
    expect(row.projects.reduce((sum, entry) => sum + entry.available, 0)).toBe(50);
  });

  it('excludes cancelled and fully fulfilled orders from outstanding coverage', () => {
    const cancelled = emptyState();
    cancelled.projects = [{ ...project }];
    cancelled.orders = [makeOrder({ cancelled: true, quantity: 100 })];
    expect(overviewRow(cancelled)).toMatchObject({ onOrder: 0, notCovered: 100 });

    const fulfilled = emptyState();
    fulfilled.projects = [{ ...project }];
    fulfilled.orders = [makeOrder({ fulfilled: 100, received: 100 })];
    fulfilled.purchases = [{ id: 'fulfilled-receipt', projectId: null, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', quantity: 100, unitPrice: 10, date: '2026-01-02', notes: '', orderId: 'shortage-order' }];
    expect(overviewRow(fulfilled)).toMatchObject({ stillNeeded: 0, onOrder: 0, notCovered: 0, acquiredTowardRequirement: 100, orderCoveragePct: null, acquisitionProgressPct: null });
    expect(overviewRow(fulfilled).orders[0].remaining).toBe(0);
  });

  it('updates acquisition progress from confirmed inventory once and reflects inventory edits', () => {
    const state = emptyState();
    state.projects = [{ ...project }];
    state.orders = [makeOrder({ quantity: 80 })];
    const received = recordOrderReceipt(state, 'shortage-order', 20, 10, '2026-01-02', '', 'unique-receipt')!;
    expect(overviewRow(received)).toMatchObject({ available: 20, stillNeeded: 80, acquiredTowardRequirement: 20, acquisitionProgressPct: 25 });
    expect(recordOrderReceipt(received, 'shortage-order', 20, 10, '2026-01-02', '', 'unique-receipt')).toBeNull();
    expect(overviewRow({ ...received, inventoryBalances: [{ id: 'shared-extra', projectId: null, materialId: 'T4_METALBAR', materialName: 'Metal Bar', quantity: 30, updatedAt: '2026-01-03' }] })).toMatchObject({ available: 50, stillNeeded: 50 });
  });

  it('recalculates changed project targets and excludes materials removed by recipe changes', () => {
    const state = emptyState();
    state.projects = [{ ...project }];
    expect(overviewRow(state)).toMatchObject({ required: 100, stillNeeded: 100 });
    state.projects = [{ ...project, target: 5 }];
    expect(overviewRow(state)).toMatchObject({ required: 50, stillNeeded: 50 });
    const alternate: Recipe = { id: 'alternate-recipe', label: 'Alternative', outputCount: 1, materials: [{ id: 'ALT_MAT', name: 'Alternative Material', count: 3, returnable: true }] };
    const alternateCatalog = [{ ...recipeItem, recipes: [...recipeItem.recipes, alternate] }];
    const changedProject = { ...project, recipeId: alternate.id };
    state.projects = [changedProject];
    const updated = materialShortageOverview(state, alternateCatalog);
    expect(updated.some((row) => row.id === 'T4_METALBAR')).toBe(false);
    expect(updated.find((row) => row.id === 'ALT_MAT')?.required).toBe(30);
  });
});

describe('market sources, order accounting, and persistence validation', () => {
  it('plans journals only when fame input and tier threshold data are both available', () => {
    expect(journalPlan({ ...project, journalFamePerItem: 360 }, { ...recipeItem, tier: 4 }, 10)?.journals).toBe(1);
    expect(journalPlan(project, { ...recipeItem, tier: 4 }, 10)).toBeNull();
    expect(journalPlan({ ...project, journalFamePerItem: 360 }, { ...recipeItem, tier: 1 }, 10)).toBeNull();
  });

  it('adds the Fire Dragon Scale alternative only to Dragonslayer leather armor slots', () => {
    const dragon = gameCatalog.filter((item) => /^T[4-8]_(?:ARMOR|HEAD|SHOES)_LEATHER_DRAGON$/.test(item.id));
    expect(dragon).toHaveLength(15);
    for (const item of dragon) {
      const alternatives = item.recipes.filter((recipe) => recipe.id.endsWith(':fire-scales'));
      expect(alternatives).toHaveLength(5);
      for (const recipe of alternatives) {
        const scale = recipe.materials.find((material) => material.id === `T${item.tier}_SHARD_FIRE_DRAGON`);
        expect(scale?.count).toBe(50);
        expect(scale?.returnable).toBe(false);
        expect(recipe.materials.some((material) => /_ARTEFACT_.*_DRAGON$/.test(material.id))).toBe(false);
      }
    }
    expect(gameCatalog.filter((item) => item.id.includes('DRAGON') && !/_LEATHER_DRAGON$/.test(item.id)).some((item) => item.recipes.some((recipe) => recipe.id.endsWith(':fire-scales')))).toBe(false);
  });

  it('does not apply RRR to Fire Dragon Scales in the Dragonslayer alternative recipe', () => {
    const jacket = gameCatalog.find((item) => item.id === 'T4_ARMOR_LEATHER_DRAGON')!;
    const recipe = jacket.recipes.find((entry) => entry.id === 'T4_ARMOR_LEATHER_DRAGON:fire-scales')!;
    const requirements = recipeRequirements(recipe, 1, 0.8);
    expect(requirements.get('T4_LEATHER')?.count).toBe(4);
    expect(requirements.get('T4_SHARD_FIRE_DRAGON')?.count).toBe(50);
  });

  it('persists inventory, recipe snapshots, and journal activity while still accepting older backups', () => {
    const state = emptyState();
    state.settings.sellingTaxPercent = 8;
    state.projects = [{ ...project, journalType: 'Fletcher', journalFamePerItem: 360, journalsOwned: 3, journalsFilled: 1, journalsInProgress: 1 }];
    state.inventoryBalances = [{ id: 'p1:T4_METALBAR', projectId: 'p1', materialId: 'T4_METALBAR', materialName: 'Metal Bar', quantity: 24, updatedAt: '2026-01-01' }];
    state.sessions = [{ id: 's1', projectId: 'p1', quantity: 1, date: '2026-01-01', notes: '', recipeId: 'T4_TEST_SWORD', journalsFilled: 1, journalsPartial: 1 }];
    expect(validateState(JSON.parse(JSON.stringify(state)))).toBe(true);
    const legacy = emptyState() as AppState & { inventoryBalances?: unknown };
    delete legacy.inventoryBalances;
    expect(validateState(legacy)).toBe(true);
    expect(validateState({ ...state, inventoryBalances: [{ id: 'bad', quantity: 'many' }] })).toBe(false);
    expect(validateState({ ...state, settings: { ...state.settings, sellingTaxPercent: 101 } })).toBe(false);
  });

  it('labels absent, stale, and undated automatic prices distinctly', () => {
    expect(getPriceFreshness(undefined, 15)).toBe('UNAVAILABLE');
    expect(getPriceFreshness({ buy: 200, sell: null, buyAt: null, sellAt: null, refreshedAt: '2026-01-01' }, 15)).toBe('AUTO — Unverified');
    expect(getPriceFreshness({ buy: 200, sell: null, buyAt: '2020-01-01T00:00:00Z', sellAt: null, refreshedAt: '2020-01-01' }, 15)).toBe('AUTO — Stale');
  });

  it('keeps the last known price visible but stale when a refresh reports no current price', () => {
    const now = Date.parse('2026-10-14T15:00:00Z');
    const old = { buy: 200, sell: null, buyAt: '2026-10-14T14:58:00Z', sellAt: null, refreshedAt: '2026-10-14T14:58:00Z' };
    const refreshed = mergePriceSnapshot(old, { buy: null, sell: 300, buyAt: null, sellAt: '2026-10-14T15:00:00Z', buyUnavailableAt: '2026-10-14T15:00:00Z', refreshedAt: '2026-10-14T15:00:00Z' });
    expect(refreshed.buy).toBe(200);
    expect(refreshed.buyAt).toBe(old.buyAt);
    expect(getPriceFreshness(refreshed, 15, now, 'buy')).toBe('AUTO — Stale');
    expect(getPriceFreshness(refreshed, 15, now, 'sell')).toBe('AUTO — Fresh');
  });

  it('uses manual estimates over city snapshots and switches cleanly back to automatic', () => {
    const state = emptyState();
    state.settings.priceCity = 'Martlock';
    state.prices[priceKey('T4_METALBAR', 'Martlock')] = { buy: 250, sell: 270, buyAt: null, sellAt: null, refreshedAt: '2026-01-01' };
    state.manualPrices[manualPriceKey(project.id, 'T4_METALBAR')] = { buy: 220, sell: null, updatedAt: '2026-01-01' };
    const manual = projectMaterials(state, project, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(manual.nextPurchaseEstimate).toBe(220);
    expect(manual.estimateSource).toBe('MANUAL');
    delete state.manualPrices[manualPriceKey(project.id, 'T4_METALBAR')];
    const automatic = projectMaterials(state, project, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(automatic.nextPurchaseEstimate).toBe(250);
    expect(automatic.estimateSource).toBe('AUTO');
  });

  it('keeps city price snapshots separate', () => {
    const state = emptyState();
    state.prices[priceKey('T4_METALBAR', 'Bridgewatch')] = { buy: 180, sell: 200, buyAt: null, sellAt: null, refreshedAt: '2026-01-01' };
    state.prices[priceKey('T4_METALBAR', 'Caerleon')] = { buy: 240, sell: 255, buyAt: null, sellAt: null, refreshedAt: '2026-01-01' };
    expect(state.prices[priceKey('T4_METALBAR', 'Bridgewatch')].buy).toBe(180);
    expect(state.prices[priceKey('T4_METALBAR', 'Caerleon')].buy).toBe(240);
  });

  it('keeps market prices and estimates separated by item quality', () => {
    const state = emptyState();
    state.settings.marketQuality = 2;
    state.prices[priceKey('T4_METALBAR', 'Bridgewatch', 1)] = { buy: 180, sell: 200, buyAt: null, sellAt: null, refreshedAt: '2026-01-01' };
    state.prices[priceKey('T4_METALBAR', 'Bridgewatch', 2)] = { buy: 220, sell: 250, buyAt: null, sellAt: null, refreshedAt: '2026-01-01' };
    const row = projectMaterials(state, project, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(row.nextPurchaseEstimate).toBe(220);
  });

  it('keeps distinct orders, excludes cancelled orders, and does not count fulfillment as stock', () => {
    const state = emptyState();
    const order: BuyOrder = { id: 'o1', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', unitPrice: 240, quantity: 50, fulfilled: 20, received: 0, placedAt: '2026-01-01', notes: '', mode: 'Active', cancelled: false, archived: false };
    const second = { ...order, id: 'o2', city: 'Martlock', unitPrice: 260, quantity: 30, fulfilled: 5 };
    state.orders = [order, second];
    let row = projectMaterials(state, project, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(row.ordered).toBe(80);
    expect(row.orderRemaining).toBe(55);
    expect(row.acquired).toBe(0);
    expect(getOrderStatus(order)).toBe('Active');
    state.orders[0].cancelled = true;
    row = projectMaterials(state, project, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(row.orderRemaining).toBe(25);
    expect(row.acquired).toBe(0);
    expect(getOrderStatus(state.orders[0])).toBe('Cancelled');
  });

  it('adds confirmed order receipts to acquired stock once and keeps the actual purchase price', () => {
    const state = emptyState();
    state.orders = [{ id: 'receipt-order', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Caerleon', unitPrice: 230, quantity: 40, fulfilled: 25, received: 0, placedAt: '2026-01-01', notes: '', mode: 'Active', cancelled: false, archived: false }];
    const received = recordOrderReceipt(state, 'receipt-order', 25, 245, '2026-01-02', 'Collected at the market');
    expect(received).not.toBeNull();
    const projectRow = projectMaterials(received!, project, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(projectRow.acquired).toBe(25);
    expect(projectRow.weightedAverage).toBe(230);
    expect(received!.purchases).toHaveLength(1);
    expect(received!.orders[0].received).toBe(25);
    expect(recordOrderReceipt(received!, 'receipt-order', 25, 245, '2026-01-02')).toBeNull();
    expect(projectMaterials(received!, project, catalog).find((entry) => entry.id === 'T4_METALBAR')?.acquired).toBe(25);
    received!.orders[0].fulfilled = 30;
    received!.orders[0].cancelled = true;
    const cancelledOrderReceipt = recordOrderReceipt(received!, 'receipt-order', 1, null, '2026-01-03');
    expect(cancelledOrderReceipt?.orders[0].received).toBe(26);
    expect(cancelledOrderReceipt?.purchases).toHaveLength(2);
  });

  it('keeps a newly created active order out of inventory until acquired quantity is confirmed', () => {
    const state = emptyState();
    state.orders = [{ id: 'new-order', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', unitPrice: 250, quantity: 40, fulfilled: 0, received: 0, placedAt: '2026-01-01', notes: '', mode: 'Active', cancelled: false, archived: false }];
    const row = projectMaterials(state, project, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(state.purchases).toHaveLength(0);
    expect(row.acquired).toBe(0);
    expect(row.missing).toBe(100);
    expect(row.orderRemaining).toBe(40);
    expect(row.notCovered).toBe(60);
  });

  it('records each partial confirmation once at the saved city and price, then completes the order', () => {
    const state = emptyState();
    state.orders = [{ id: 'partial-order', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Caerleon', unitPrice: 230, quantity: 40, fulfilled: 0, received: 0, placedAt: '2026-01-01', notes: '', mode: 'Active', cancelled: false, archived: false }];
    const first = recordOrderReceipt(state, 'partial-order', 15, 999, '2026-01-02', 'First collection', 'confirm-1')!;
    expect(first.purchases).toHaveLength(1);
    expect(first.purchases[0]).toMatchObject({ quantity: 15, unitPrice: 230, city: 'Caerleon', date: '2026-01-02', orderId: 'partial-order' });
    expect(first.orders[0].received).toBe(15);
    expect(first.orders[0].quantity - first.orders[0].received).toBe(25);
    expect(getOrderStatus(first.orders[0])).toBe('Partially Fulfilled');
    expect(recordOrderReceipt(first, 'partial-order', 15, 230, '2026-01-02', '', 'confirm-1')).toBeNull();
    expect(recordOrderReceipt(first, 'partial-order', 26, 230, '2026-01-03')).toBeNull();
    const completed = recordOrderReceipt(first, 'partial-order', 25, null, '2026-01-03', '', 'confirm-2')!;
    expect(completed.purchases).toHaveLength(2);
    expect(completed.orders[0].received).toBe(40);
    expect(getOrderStatus(completed.orders[0])).toBe('Fulfilled');
    const row = projectMaterials(completed, project, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(row.acquired).toBe(40);
    expect(row.orderAcquired).toBe(40);
    expect(row.missing).toBe(60);
    expect(row.weightedAverage).toBe(230);
    completed.orders[0].cancelled = true;
    expect(projectMaterials(completed, project, catalog).find((entry) => entry.id === 'T4_METALBAR')?.acquired).toBe(40);
  });

  it('reverses an acquired order quantity with an auditable transaction and restores the outstanding amount', () => {
    const state = emptyState();
    state.orders = [{ id: 'reverse-order', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Martlock', unitPrice: 260, quantity: 30, fulfilled: 0, received: 0, placedAt: '2026-01-01', notes: '', mode: 'Active', cancelled: false, archived: false }];
    const acquired = recordOrderReceipt(state, 'reverse-order', 12, 260, '2026-01-02', '', 'reverse-source')!;
    const corrected = reverseOrderPurchase(acquired, 'reverse-source', '2026-01-03');
    expect(corrected).not.toBeNull();
    expect(corrected!.purchases).toHaveLength(2);
    expect(corrected!.purchases[1]).toMatchObject({ quantity: 12, reversesPurchaseId: 'reverse-source', city: 'Martlock', unitPrice: 260 });
    expect(corrected!.orders[0].received).toBe(0);
    expect(corrected!.orders[0].fulfilled).toBe(0);
    expect(projectMaterials(corrected!, project, catalog).find((entry) => entry.id === 'T4_METALBAR')?.orderRemaining).toBe(30);
    expect(projectMaterials(corrected!, project, catalog).find((entry) => entry.id === 'T4_METALBAR')?.acquired).toBe(0);
    expect(projectMaterials(corrected!, project, catalog).find((entry) => entry.id === 'T4_METALBAR')?.orderAcquired).toBe(0);
    expect(reverseOrderPurchase(corrected!, 'reverse-source', '2026-01-04')).toBeNull();
    expect(validateState(corrected)).toBe(true);
  });

  it('includes only an explicitly configured extra cost in remaining cost estimates', () => {
    const state = emptyState();
    state.settings.priceCity = 'Bridgewatch';
    state.prices[priceKey('T4_METALBAR', 'Bridgewatch')] = { buy: 10, sell: 12, buyAt: null, sellAt: null, refreshedAt: '2026-01-01' };
    state.settings.extraCostPercent = 5;
    const row = projectMaterials(state, project, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(row.remainingEstimatedCost).toBe(1050);
  });

  it('preserves historical purchase costs when market snapshots change', () => {
    const state = emptyState();
    state.purchases = [{ id: 'actual', projectId: project.id, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', quantity: 10, unitPrice: 240, date: '2026-01-01', notes: '' }];
    const before = projectMaterials(state, project, catalog).find((entry) => entry.id === 'T4_METALBAR')!.weightedAverage;
    state.prices[priceKey('T4_METALBAR', 'Bridgewatch')] = { buy: 999, sell: 1000, buyAt: '2026-01-02T00:00:00Z', sellAt: '2026-01-02T00:00:00Z', refreshedAt: '2026-01-02' };
    const after = projectMaterials(state, project, catalog).find((entry) => entry.id === 'T4_METALBAR')!.weightedAverage;
    expect(after).toBe(before);
    expect(after).toBe(240);
  });

  it('combines explicit shared allocations with automatic project-priority allocation without oversubscription', () => {
    const state = emptyState();
    state.purchases = [{ id: 'shared', projectId: null, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', quantity: 30, unitPrice: null, date: '2026-01-01', notes: '' }];
    state.allocations = [{ id: 'allocation', materialId: 'T4_METALBAR', materialName: 'Metal Bar', projectId: project.id, quantity: 20, date: '2026-01-02', unitPriceAtAllocation: null }];
    expect(projectMaterials(state, project, catalog).find((entry) => entry.id === 'T4_METALBAR')?.acquired).toBe(30);
    expect(sharedUnallocated(state, 'T4_METALBAR')).toBe(10);
  });

  it('includes manually entered shared inventory in the reservable pool exactly once', () => {
    const state = emptyState();
    state.inventoryBalances = [{ id: 'shared-stock', projectId: null, materialId: 'T4_METALBAR', materialName: 'Metal Bar', quantity: 12, updatedAt: '2026-01-01' }];
    state.allocations = [{ id: 'reserved', materialId: 'T4_METALBAR', materialName: 'Metal Bar', projectId: project.id, quantity: 7, date: '2026-01-02', unitPriceAtAllocation: null }];
    expect(sharedUnallocated(state, 'T4_METALBAR')).toBe(5);
  });

  it('attributes a shared weighted purchase cost to a project allocation without duplicating the purchase', () => {
    const state = emptyState();
    state.purchases = [
      { id: 's1', projectId: null, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Bridgewatch', quantity: 500, unitPrice: 240, date: '2026-01-01', notes: '' },
      { id: 's2', projectId: null, materialId: 'T4_METALBAR', materialName: 'Metal Bar', city: 'Martlock', quantity: 300, unitPrice: 260, date: '2026-01-02', notes: '' },
    ];
    state.allocations = [{ id: 'a1', materialId: 'T4_METALBAR', materialName: 'Metal Bar', projectId: project.id, quantity: 100, date: '2026-01-03', unitPriceAtAllocation: 247.5 }];
    const row = projectMaterials(state, project, catalog).find((entry) => entry.id === 'T4_METALBAR')!;
    expect(row.acquired).toBe(100);
    expect(row.weightedAverage).toBe(247.5);
    expect(state.purchases).toHaveLength(2);
  });

  it('rejects malformed imported backups', () => {
    expect(validateState({ version: 1, projects: [] })).toBe(false);
    expect(validateState(emptyState())).toBe(true);
  });
});
