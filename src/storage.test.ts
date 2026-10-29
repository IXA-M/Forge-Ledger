import { afterEach, describe, expect, it, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { emptyState } from './domain';
import { createDailyBackup, listDailyBackups, loadState, STORAGE_KEY } from './storage';

describe('daily recovery backups', () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('forge-ledger-daily-backups');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Backup database remained open.'));
    });
  });

  it('stores a valid app snapshot per day and lists it for restore', async () => {
    vi.stubGlobal('indexedDB', indexedDB);
    const state = emptyState();
    state.projects.push({
      id: 'project-1', name: 'Adept’s Bag', itemId: 'T4_BAG', recipeId: 'default', target: 10,
      crafted: 0, createdAt: '2026-10-14', deadline: '', notes: '', priority: 'Normal', dailyTarget: 0,
    });

    await createDailyBackup(state, '2026-10-14');
    const backups = await listDailyBackups();

    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatchObject({ date: '2026-10-14', projectCount: 1 });
    expect(backups[0].state.projects[0].name).toBe('Adept’s Bag');
  });

  it('keeps the first snapshot made on a day as the recovery point', async () => {
    vi.stubGlobal('indexedDB', indexedDB);
    const original = emptyState();
    original.settings.priceCity = 'Martlock';
    const later = emptyState();
    later.settings.priceCity = 'Bridgewatch';

    await createDailyBackup(original, '2026-10-14');
    await createDailyBackup(later, '2026-10-14');

    expect((await listDailyBackups())[0].state.settings.priceCity).toBe('Martlock');
  });

  it('replaces an empty startup snapshot if project data is added later that day', async () => {
    vi.stubGlobal('indexedDB', indexedDB);
    const empty = emptyState();
    const populated = emptyState();
    populated.projects.push({
      id: 'project-1', name: 'Adept’s Bag', itemId: 'T4_BAG', recipeId: 'default', target: 10,
      crafted: 0, createdAt: '2026-10-14', deadline: '', notes: '', priority: 'Normal', dailyTarget: 0,
    });

    await createDailyBackup(empty, '2026-10-14');
    await createDailyBackup(populated, '2026-10-14');

    expect((await listDailyBackups())[0].projectCount).toBe(1);
  });
});

describe('Enchant Craft state migration', () => {
  afterEach(() => localStorage.clear());

  it('adds default calculator state to older Forge saves without changing project data', () => {
    const oldState = emptyState();
    oldState.projects.push({ id: 'p1', name: 'Existing', itemId: 'T4_BAG', recipeId: 'default', target: 3, crafted: 0, createdAt: '2026-01-01', deadline: '', notes: '', priority: 'Normal', dailyTarget: 0 });
    delete oldState.enchantCraft;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oldState));
    const loaded = loadState();
    expect(loaded.projects).toEqual(oldState.projects);
    expect(loaded.enchantCraft?.plan).toEqual([]);
  });

  it('imports same-origin legacy presets and plan snapshots without treating old prices as automatic quotes', () => {
    const forge = emptyState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(forge));
    localStorage.setItem('crafting-cost-calculator-items', JSON.stringify([{ name: 'Legacy Jacket', craftAmount: 2, materials: [{ name: 'Leather', quantity: 4, price: 80 }] }]));
    localStorage.setItem('crafting-cost-calculator-plan', JSON.stringify([{ name: 'Plan Jacket', craftAmount: 3, materials: [] }]));
    const loaded = loadState();
    expect(loaded.enchantCraft?.presets).toHaveLength(1);
    expect(loaded.enchantCraft?.presets[0].draft.materials[0]).toMatchObject({ priceMode: 'manual', manualPrice: 80 });
    expect(loaded.enchantCraft?.plan).toHaveLength(1);
    expect(loaded.enchantCraft?.legacyImportedAt).toBeTruthy();
    expect(localStorage.getItem('crafting-cost-calculator-items')).not.toBeNull();
  });

  it('keeps Forge projects when only the optional calculator payload is damaged', () => {
    const forge = emptyState();
    forge.projects.push({ id: 'p1', name: 'Existing', itemId: 'T4_BAG', recipeId: 'default', target: 3, crafted: 0, createdAt: '2026-01-01', deadline: '', notes: '', priority: 'Normal', dailyTarget: 0 });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...forge, enchantCraft: { draft: { broken: true }, presets: [], plan: [] } }));
    const loaded = loadState();
    expect(loaded.projects).toEqual(forge.projects);
    expect(loaded.enchantCraft?.draft.name).toBe('Untitled setup');
  });

  it('normalizes calculator drafts saved by the earlier integration version', () => {
    const forge = emptyState();
    const oldEnchant = structuredClone(forge.enchantCraft!);
    delete (oldEnchant.draft as Partial<typeof oldEnchant.draft>).targetEnchantment;
    delete (oldEnchant.draft as Partial<typeof oldEnchant.draft>).enchantmentUnitsPerLevel;
    delete (oldEnchant.draft as Partial<typeof oldEnchant.draft>).resourceReturnRatePercent;
    delete (oldEnchant.draft.materials[0] as Partial<typeof oldEnchant.draft.materials[number]>).returnable;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...forge, enchantCraft: oldEnchant }));

    const loaded = loadState();

    expect(loaded.enchantCraft?.draft).toMatchObject({ targetEnchantment: 0, enchantmentUnitsPerLevel: null, resourceReturnRatePercent: 15.2 });
    expect(loaded.enchantCraft?.draft.materials[0].returnable).toBe(false);
  });
});
