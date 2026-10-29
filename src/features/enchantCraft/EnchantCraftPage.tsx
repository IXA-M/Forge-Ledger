import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { ItemPicker } from '../../components/ItemPicker';
import { CopyableName, ItemIcon } from '../../components/SharedUi';
import { catalog, catalogById } from '../../data/catalog';
import { formatItemName, formatNumber, formatSilver, newId, priceKey, recipeFor, type AppState, type CatalogItem, type Project, type Recipe } from '../../domain';
import { downloadBlob } from '../../storage';
import { calculateEnchantEstimate, enchantedProductId, enchantmentMaterialAmounts, enchantmentUnitsPerLevel, mergeShoppingRows } from './calculations';
import { createDefaultEnchantDraft, createDefaultEnchantCraftState, createMaterial, mergeEnchantCraftState, migrateLegacyCalculatorData, normalizeEnchantCraftState, validateEnchantCraftState, validateEnchantDraft } from './validation';
import { ENCHANT_FOODS, type EnchantCraftDraft, type EnchantCraftState, type EnchantMaterial, type EnchantPlanEntry } from './types';

const amount = (value: number | null) => value == null ? '' : String(value);
const display = (value: number | null, suffix = '') => value == null || !Number.isFinite(value) ? 'Unavailable' : `${formatNumber(value)}${suffix}`;
const readAmount = (value: string, max = 1e15): number | null => value.trim() === '' ? null : Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max ? Number(value) : null;
const readInteger = (value: string, max = 1_000_000): number | null => { const parsed = readAmount(value, max); return parsed != null && Number.isSafeInteger(parsed) ? parsed : null; };
const draftDisplayName = (draft: EnchantCraftDraft) => {
  const item = draft.itemId ? catalogById.get(draft.itemId) : undefined;
  return item ? `${item.name} .0 → .${draft.targetEnchantment}` : draft.name || 'Untitled setup';
};
const craftedItemName = (draft: EnchantCraftDraft) => {
  const item = draft.itemId ? catalogById.get(draft.itemId) : undefined;
  return item ? `${item.name} .${draft.targetEnchantment}` : draft.name || 'Untitled setup';
};
const baseCraftRecipes = (item: CatalogItem) => {
  const unenchanted = item.recipes.filter((recipe) => !/@[1-4](?:#\d+)?$/.test(recipe.id));
  return unenchanted.length ? unenchanted : item.recipes.slice(0, 1);
};
const withEnchantMaterials = (rows: EnchantMaterial[], tier: number, target: 0 | 1 | 2 | 3, units: number | null) => {
  const amounts = enchantmentMaterialAmounts(units, target);
  return (['RUNE', 'SOUL', 'RELIC'] as const).map((kind) => {
    const existing = rows.find((row) => row.marketKind === kind);
    return {
      ...(existing || createMaterial()), marketKind: kind,
      name: `T${tier} ${kind[0]}${kind.slice(1).toLowerCase()}`,
      quantityPerCraft: amounts[kind], returnable: false, priceMode: existing?.priceMode || 'market',
    };
  });
};

export function draftFromForgeProject(state: AppState, project: Project, items: CatalogItem[] = catalog): EnchantCraftDraft {
  const item = items.find((entry) => entry.id === project.itemId);
  const recipe = recipeFor(project, items).recipe;
  if (project.enchantCraft && item && recipe) {
    const baseRecipe = item.recipes.find((entry) => entry.id === project.recipeId) || item.recipes[0];
    const draft = createDefaultEnchantDraft();
    draft.name = `${item.name} .0 → .${project.enchantCraft.targetEnchantment}`;
    draft.itemId = project.itemId;
    draft.recipeId = project.recipeId;
    draft.linkedProjectId = project.id;
    draft.projectSnapshotName = project.name;
    draft.recipeName = baseRecipe.label || item.name;
    draft.craftCount = project.target;
    draft.outputCount = 1;
    draft.targetEnchantment = project.enchantCraft.targetEnchantment;
    draft.enchantmentUnitsPerLevel = project.enchantCraft.unitsPerLevel;
    draft.runeTier = project.enchantCraft.runeTier as EnchantCraftDraft['runeTier'];
    draft.resourceReturnRatePercent = 15.2;
    draft.materials = baseRecipe.materials.map((material) => createMaterial({ materialId: material.id, name: material.name, quantityPerCraft: material.count, returnable: material.returnable, priceMode: 'market' }));
    for (const material of project.additionalMaterials || []) {
      const marketKind = material.id.match(/^T[4-8]_(RUNE|SOUL|RELIC)$/)?.[1] as 'RUNE' | 'SOUL' | 'RELIC' | undefined;
      draft.materials.push(createMaterial({ materialId: material.id, marketKind, name: material.name, quantityPerCraft: material.count, returnable: material.returnable, priceMode: 'market' }));
    }
    return draft;
  }
  const draft = createDefaultEnchantDraft();
  draft.name = item ? `${item.name} .0 → .0` : `${project.name} estimate`;
  draft.itemId = project.itemId;
  draft.recipeId = recipe?.id || project.recipeId;
  draft.linkedProjectId = project.id;
  draft.projectSnapshotName = project.name;
  draft.recipeName = recipe?.label || item?.name || project.name;
  draft.craftCount = project.target;
  draft.outputCount = 1;
  draft.targetEnchantment = 0;
  draft.enchantmentUnitsPerLevel = item ? enchantmentUnitsPerLevel(item) : null;
  if (item) draft.runeTier = Math.min(8, Math.max(4, item.tier)) as EnchantCraftDraft['runeTier'];
  draft.resourceReturnRatePercent = 15.2;
  const projectMaterialsRows = recipe?.materials.map((row) => createMaterial({ materialId: row.id, name: row.name, quantityPerCraft: row.count, returnable: row.returnable, priceMode: 'market' })) || [];
  draft.materials = [...projectMaterialsRows, ...withEnchantMaterials(draft.materials, item?.tier || draft.runeTier, 0, draft.enchantmentUnitsPerLevel)];
  if (recipe) {
    const ids = new Set(draft.materials.map((row) => row.materialId));
    recipe.materials.filter((row) => !ids.has(row.id)).forEach((row) => draft.materials.push(createMaterial({ materialId: row.id, name: row.name, quantityPerCraft: 0, priceMode: 'market' })));
  }
  return draft;
}

type Props = {
  state: AppState;
  onChange: (next: EnchantCraftState) => void;
  onRefresh: (ids: string[], cities: string[]) => void;
  refreshing: boolean;
  onOpenProject: (id: string) => void;
  onCreateProject: (project: Project) => void;
};

export function EnchantCraftPage({ state, onChange, onRefresh, refreshing, onOpenProject, onCreateProject }: Props) {
  const saved = state.enchantCraft || { draft: createDefaultEnchantDraft(), presets: [], plan: [], itemValues: [], lastTaxMode: 'normal' as const };
  const draft = saved.draft;
  const [notice, setNotice] = useState('');
  const item = draft.itemId ? catalogById.get(draft.itemId) : undefined;
  const savedItemValueFor = (candidate: EnchantCraftDraft) => {
    if (!candidate.itemId) return null;
    const candidateItem = catalogById.get(candidate.itemId);
    return candidateItem ? saved.itemValues.find((entry) => entry.itemId === candidate.itemId && entry.tier === candidateItem.tier)?.value ?? null : null;
  };
  const recipes = item ? baseCraftRecipes(item) : [];
  const selectedRecipe = recipes.find((recipe) => recipe.id === draft.recipeId) || recipes[0];
  const lastAutoRefreshKey = useRef('');
  const refreshRef = useRef(onRefresh);
  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);
  const estimate = useMemo(() => calculateEnchantEstimate(draft, {
    priceCity: state.settings.priceCity,
    freshMinutes: state.settings.freshMinutes,
    savedItemValue: savedItemValueFor(draft),
    getQuote: (id, city) => {
      const price = state.prices[priceKey(id, city, 1)];
      return price ? { sell: price.sell, sellAt: price.sellAt, refreshedAt: price.refreshedAt } : undefined;
    },
  }), [draft, saved.itemValues, state.prices, state.settings.priceCity, state.settings.freshMinutes]);
  const itemValueKnown = estimate.rerollItemValue != null && estimate.rerollItemValueSource !== 'UNAVAILABLE';
  const planEstimates = saved.plan.map((entry) => ({ entry, estimate: calculateEnchantEstimate(entry.draft, {
    priceCity: state.settings.priceCity, freshMinutes: state.settings.freshMinutes,
    savedItemValue: savedItemValueFor(entry.draft),
    getQuote: (id, city) => { const price = state.prices[priceKey(id, city, 1)]; return price ? { sell: price.sell, sellAt: price.sellAt, refreshedAt: price.refreshedAt } : undefined; },
  }) }));
  const combinedMaterials = mergeShoppingRows(planEstimates.flatMap(({ estimate: result }) => result.materials));
  const setDraft = (patch: Partial<EnchantCraftDraft>) => {
    const nextDraft = { ...draft, ...patch };
    onChange({ ...saved, draft: nextDraft, lastTaxMode: nextDraft.taxMode });
  };
  const saveItemValue = (rawValue: string) => {
    const value = readAmount(rawValue);
    if (!item) { setDraft({ rerollItemValue: value }); return; }
    const itemValues = saved.itemValues.filter((entry) => !(entry.itemId === item.id && entry.tier === item.tier));
    if (value != null) itemValues.push({ itemId: item.id, tier: item.tier, value });
    onChange({ ...saved, itemValues, draft: { ...draft, rerollItemValue: null } });
  };
  const updateMaterial = (id: string, patch: Partial<EnchantMaterial>) => setDraft({ materials: draft.materials.map((row) => row.id === id ? { ...row, ...patch } : row) });
  const chooseItem = (picked?: CatalogItem) => {
    if (!picked) { setDraft({ itemId: null, recipeId: null, linkedProjectId: null, projectSnapshotName: null, finishedPrice: null }); return; }
    const pickedRecipes = baseCraftRecipes(picked);
    const recipe = pickedRecipes[0];
    const market = draft.materials.filter((row) => row.marketKind);
    const enchantmentUnits = enchantmentUnitsPerLevel(picked);
    const enchantRows = withEnchantMaterials(market, picked.tier, draft.targetEnchantment, enchantmentUnits);
    const rows = recipe.materials.map((material) => createMaterial({ materialId: material.id, name: material.name, quantityPerCraft: material.count, returnable: material.returnable, priceMode: 'market' }));
    setDraft({ name: `${picked.name} .0 → .${draft.targetEnchantment}`, itemId: picked.id, recipeId: recipe.id, recipeName: recipe.label || picked.name, linkedProjectId: null, projectSnapshotName: null, finishedPrice: null, rerollItemValue: null, outputCount: 1, runeTier: Math.min(8, Math.max(4, picked.tier)) as EnchantCraftDraft['runeTier'], enchantmentUnitsPerLevel: enchantmentUnits, resourceReturnRatePercent: 15.2, materials: [...rows, ...enchantRows] });
  };
  const chooseRecipe = (recipe: Recipe) => {
    if (!item) return;
    const market = withEnchantMaterials(draft.materials.filter((row) => row.marketKind), item.tier, draft.targetEnchantment, draft.enchantmentUnitsPerLevel);
    setDraft({ recipeId: recipe.id, recipeName: recipe.label || item?.name || 'Recipe', outputCount: 1,
      materials: [...recipe.materials.map((material) => createMaterial({ materialId: material.id, name: material.name, quantityPerCraft: material.count, returnable: material.returnable, priceMode: 'market' })), ...market] });
  };
  const changeTargetEnchantment = (target: 0 | 1 | 2 | 3) => {
    const tier = item?.tier || draft.runeTier;
    setDraft({ name: item ? `${item.name} .0 → .${target}` : draft.name, targetEnchantment: target, finishedPrice: null, materials: [...draft.materials.filter((row) => !row.marketKind), ...withEnchantMaterials(draft.materials.filter((row) => row.marketKind), tier, target, draft.enchantmentUnitsPerLevel)] });
  };
  const addToPlan = () => { if (!itemValueKnown) { setNotice('Enter the item value before adding this Enchant Craft to the plan.'); return; } const errors = validateEnchantDraft(draft); if (errors.length) { setNotice(`Finish the setup before adding it: ${errors.join(' ')}`); return; } onChange({ ...saved, plan: [...saved.plan, { id: newId(), draft: structuredClone(draft), addedAt: new Date().toISOString() }] }); setNotice('Estimate added to the plan as a snapshot.'); };
  const createForgeProject = () => {
    if (!itemValueKnown) { setNotice('Enter the item value before creating this Enchant Craft project.'); return; }
    const errors = validateEnchantDraft(draft);
    if (errors.length || !item || !selectedRecipe || !draft.craftCount) { setNotice(`Choose a Forge catalog item and finish its project details first. ${errors.join(' ')}`); return; }
    const recipeMaterialIds = new Set(selectedRecipe.materials.map((material) => material.id));
    const additionalMaterials = draft.materials.filter((row) => !row.materialId || !recipeMaterialIds.has(row.materialId))
      .filter((row) => row.quantityPerCraft != null && row.quantityPerCraft > 0)
      .map((row) => ({ id: row.materialId || `CUSTOM_${row.id}`, name: row.name.trim(), count: row.quantityPerCraft!, returnable: row.marketKind ? false : row.returnable }));
    const productName = formatItemName(item.name, `${item.id}@${draft.targetEnchantment}`);
    onCreateProject({
      id: newId(), name: productName, itemId: item.id, recipeId: selectedRecipe.id,
      target: draft.craftCount, crafted: 0, createdAt: new Date().toISOString(), deadline: '', notes: `Created from Enchant Craft. Craft the .0 item, then enchant to .${draft.targetEnchantment}.`,
      priority: 'Normal', dailyTarget: 0, returnRate: 15.2, sellingPrice: draft.finishedPrice ?? estimate.finishedPrice,
      completed: false, completedAt: null, enchantCraft: { targetEnchantment: draft.targetEnchantment, runeTier: draft.runeTier, unitsPerLevel: draft.enchantmentUnitsPerLevel },
      additionalMaterials,
      journalType: item.journalType || undefined, journalFamePerItem: null,
    });
    setNotice(`Created ${productName} in Forge Projects. Its base recipe and enchantment materials are tracked together for inventory and buy orders.`);
  };
  const finishedMarketId = enchantedProductId(draft.itemId, draft.targetEnchantment);
  const marketIds = [...new Set([
    ...draft.materials.filter((row) => row.priceMode === 'market').map((row) => row.marketKind ? draft.targetEnchantment > 0 && (!item || item.tier >= 4) ? `T${draft.runeTier}_${row.marketKind}` : null : row.materialId),
    finishedMarketId,
  ].filter((id): id is string => !!id))];
  const autoRefreshKey = JSON.stringify([state.settings.server, state.settings.priceCity, draft.runeTier, marketIds]);
  useEffect(() => {
    if (!marketIds.length || lastAutoRefreshKey.current === autoRefreshKey) return;
    lastAutoRefreshKey.current = autoRefreshKey;
    void refreshRef.current(marketIds, [...new Set([state.settings.priceCity, 'Brecilien'])]);
  }, [autoRefreshKey]);
  const estimatedShopping = estimate.materials;
  const missingMaterialPrices = estimate.materials.filter((row) => row.quantity > 0 && row.unitPrice == null);
  const otherMissingInputs = estimate.missingInputs.filter((input) => input !== 'finished item selling price' && !missingMaterialPrices.some((row) => input === `${row.name || 'Unnamed material'} price`));
  const exportData = () => downloadBlob('forge-enchant-craft.json', JSON.stringify({ format: 'forge-enchant-craft', version: 1, enchantCraft: { draft, presets: saved.presets, plan: saved.plan, itemValues: saved.itemValues } }, null, 2));
  const importData = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const legacyEnvelope = parsed?.format === 'crafting-cost-calculator-legacy' || Array.isArray(parsed)
        || parsed && typeof parsed === 'object' && ('savedItems' in parsed || 'plannedItems' in parsed || 'crafting-cost-calculator-items' in parsed);
      const incoming = legacyEnvelope
        ? migrateLegacyCalculatorData(createDefaultEnchantCraftState(), Array.isArray(parsed) ? parsed : parsed.savedItems ?? parsed['crafting-cost-calculator-items'], parsed.plannedItems ?? parsed['crafting-cost-calculator-plan'])
        : parsed?.format === 'forge-enchant-craft' ? parsed.enchantCraft : parsed;
      const normalizedIncoming = normalizeEnchantCraftState(incoming);
      if (!validateEnchantCraftState(normalizedIncoming)) throw new Error('The file does not contain valid Enchant Craft data.');
      const merged = mergeEnchantCraftState(saved, normalizedIncoming);
      if (!legacyEnvelope && window.confirm('Load the imported current setup into the calculator form? This replaces only the current estimate; existing Forge projects and saved setups remain.')) {
        onChange({ ...merged, draft: structuredClone(normalizedIncoming.draft), lastTaxMode: normalizedIncoming.draft.taxMode });
      } else onChange(merged);
      setNotice(legacyEnvelope ? 'Legacy calculator setups imported as saved presets and plan entries. Existing data was preserved.' : 'Calculator data imported. Existing setups were preserved; matching IDs were skipped.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not import calculator data.'); }
  };

  return <div className="enchant-workspace">
    <section className="panel section-panel enchant-hero"><div><span className="eyebrow">CRAFTING ESTIMATE</span><h2>Enchant Craft</h2><p>Estimate recipe costs, market materials, food, rerolls, and sale profit. Estimates never record a purchase or change project inventory.</p></div><div className="enchant-actions"><button className="button button-outline" onClick={exportData}><Download size={14} /> Export</button><label className="button button-outline">Import<input type="file" accept="application/json,.json" hidden onChange={(event) => { void importData(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label></div></section>
    {notice && <div className="enchant-notice" role="status">{notice}<button className="icon-button small" aria-label="Dismiss" onClick={() => setNotice('')}><X size={14} /></button></div>}

    <div className="enchant-grid">
      <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">SETUP</span><h3>Recipe & materials</h3></div><div className="enchant-actions"><button className="button button-outline button-sm" onClick={() => onChange({ ...saved, draft: createDefaultEnchantDraft(saved.lastTaxMode || draft.taxMode), lastTaxMode: saved.lastTaxMode || draft.taxMode })}>New estimate</button><button className="button button-primary button-sm" disabled={!itemValueKnown} title={!itemValueKnown ? 'Enter the item value to continue.' : undefined} onClick={createForgeProject}>Create Forge project</button></div></div>
        <div className="enchant-form-grid"><div className="field"><span className="field-label">Enchant path</span><strong>{draftDisplayName(draft)}</strong></div><label className="field"><span className="field-label">Finished items</span><input type="number" min="1" max="1000000" step="1" value={amount(draft.craftCount)} onChange={(event) => setDraft({ craftCount: readInteger(event.target.value) })} /></label><label className="field"><span className="field-label">Target enchantment</span><select value={draft.targetEnchantment} onChange={(event) => changeTargetEnchantment(Number(event.target.value) as 0 | 1 | 2 | 3)}>{[0,1,2,3].map((level) => <option key={level} value={level}>.{level}</option>)}</select><small className="enchant-price-status">Levels are cumulative from .0: runes, then souls, then relics.</small></label><div className="field"><span className="field-label">Resource Return Rate</span><strong>15.2%</strong><small className="enchant-price-status">Fixed for Enchant Craft recipe materials. Enchantment materials never receive returns.</small></div></div>
        <ItemPicker value={draft.itemId || ''} onChange={chooseItem} selectedDisplayName={item ? craftedItemName(draft) : undefined} copySelected />
        {item && /_DRAGON/.test(item.id) && recipes.length > 1 && <label className="field enchant-recipe-picker"><span className="field-label">Dragonslayer recipe</span><select value={selectedRecipe?.id || ''} onChange={(event) => { const recipe = recipes.find((entry) => entry.id === event.target.value); if (recipe) chooseRecipe(recipe); }}>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.label || recipe.id}</option>)}</select></label>}
        {item && draft.targetEnchantment > 0 && draft.enchantmentUnitsPerLevel == null && <p className="enchant-missing">Automatic enchantment quantity is unavailable for this item category. Choose a supported equipment item or set the Rune, Soul, and Relic quantities manually.</p>}
        <div className="enchant-table-wrap"><table className="data-table enchant-table"><thead><tr><th>Material</th><th>RRR</th><th>Quantity / craft</th><th>Total after RRR</th><th>Price source</th><th>Unit price</th><th>Batch cost</th><th /></tr></thead><tbody>{draft.materials.map((row) => {
          const result = estimatedShopping.find((entry) => entry.id === row.id);
          const isMarket = !!row.marketKind;
          const iconId = row.materialId || (row.marketKind ? `T${draft.runeTier}_${row.marketKind}` : null);
          const autoPrice = result?.unitPrice;
          return <tr key={row.id} className={result?.quantity != null && result.quantity > 0 && result.unitPrice == null ? 'enchant-price-missing' : undefined}><td><div className="enchant-material-cell">{iconId && <ItemIcon id={iconId} size={28} />}<CopyableName name={row.name} /></div></td><td><input aria-label={`${row.name || 'Material'} RRR eligible`} type="checkbox" checked={row.returnable} disabled={!!draft.linkedProjectId} onChange={(event) => updateMaterial(row.id, { returnable: event.target.checked })} /></td>
            <td><input aria-label={`${row.name || 'Material'} quantity per craft`} type="number" min="0" max="1000000000" step="any" value={amount(row.quantityPerCraft)} onChange={(event) => updateMaterial(row.id, { quantityPerCraft: readAmount(event.target.value, 1e9) })} /></td><td>{row.marketKind && draft.targetEnchantment > 0 && draft.enchantmentUnitsPerLevel == null ? 'Unavailable' : display(result?.quantity ?? null)}</td>
            <td><select aria-label="Price source" value={row.priceMode} onChange={(event) => updateMaterial(row.id, { priceMode: event.target.value as EnchantMaterial['priceMode'] })}><option value="market">Automatic sell quote</option><option value="manual">Manual</option><option value="unknown">Unknown</option></select>{result?.priceStatus && <small className="enchant-price-status">{result.priceStatus}{result.quoteCity ? ` · ${result.quoteCity} T${result.quoteTier || ''}` : ''}{result.priceTimestamp ? ` · ${new Date(result.priceTimestamp).toLocaleString()}` : ''}</small>}</td>
            <td>{row.priceMode === 'manual' || (result?.quantity != null && result.quantity > 0 && (row.priceMode === 'unknown' || autoPrice == null)) ? <><input aria-label={`${row.name || 'Material'} manual unit price`} type="number" min="0" max="1000000000000000" step="any" placeholder={row.priceMode === 'market' ? 'No automatic quote - enter price' : 'Enter unit price'} value={amount(row.manualPrice)} onChange={(event) => updateMaterial(row.id, { priceMode: 'manual', manualPrice: readAmount(event.target.value) })} />{row.priceMode === 'market' && autoPrice == null && <small className="enchant-price-prompt">Automatic price unavailable. Enter a manual price.</small>}</> : <span>{autoPrice == null ? '-' : formatSilver(autoPrice)}</span>}</td><td>{result?.cost == null ? 'Unavailable' : formatSilver(result.cost)}</td><td>{!isMarket && <button className="icon-button danger" title="Remove material" onClick={() => setDraft({ materials: draft.materials.filter((entry) => entry.id !== row.id) })}><Trash2 size={14} /></button>}</td></tr>;
        })}</tbody></table></div>
        <div className="enchant-actions enchant-material-actions"><button className="button button-outline button-sm" onClick={() => { const name = window.prompt('Name this custom material:')?.trim(); if (name) setDraft({ materials: [...draft.materials, createMaterial({ name, quantityPerCraft: 1, priceMode: 'unknown' })] }); }}><Plus size={14} /> Add custom material</button>{item ? <span className="enchant-tier-note">Item tier T{item.tier} · enchant materials use this tier</span> : <label className="field inline-field"><span className="field-label">Rune / soul / relic tier</span><select value={draft.runeTier} onChange={(event) => setDraft({ runeTier: Number(event.target.value) as EnchantCraftDraft['runeTier'], materials: (withEnchantMaterials(draft.materials.filter((row) => row.marketKind), Number(event.target.value), draft.targetEnchantment, draft.enchantmentUnitsPerLevel) as EnchantMaterial[]).concat(draft.materials.filter((row) => !row.marketKind)) })}>{[4,5,6,7,8].map((tier) => <option key={tier} value={tier}>T{tier}</option>)}</select></label>}<button className="button button-outline button-sm" disabled={!marketIds.length || refreshing} onClick={() => onRefresh(marketIds, [...new Set([state.settings.priceCity, 'Brecilien'])])}><RefreshCw size={14} /> {refreshing ? 'Refreshing…' : 'Refresh automatic prices'}</button></div>
        {draft.linkedProjectId && <div className="enchant-project-ref">Snapshot from <strong>{draft.projectSnapshotName || 'Forge project'}</strong> · <button className="text-button" onClick={() => onOpenProject(draft.linkedProjectId!)}>Return to project</button></div>}
      </section>

      <aside className="enchant-side">
        <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">ESTIMATE</span><h3>Cost & sale</h3></div><button className="button button-primary button-sm" disabled={!itemValueKnown} title={!itemValueKnown ? 'Enter the item value to continue.' : undefined} onClick={addToPlan}><Plus size={14} /> Add to plan</button></div>
          <div className="enchant-form-grid"><label className="field"><span className="field-label">Finished item price (silver)</span><input aria-label="Finished item price" type="number" min="0" step="any" placeholder={estimate.finishedPriceSource === 'UNAVAILABLE' ? 'No market quote - enter manually' : 'Manual price override'} value={amount(draft.finishedPrice ?? estimate.finishedPrice)} onChange={(event) => setDraft({ finishedPrice: readAmount(event.target.value) })} /><small className="enchant-price-status">{estimate.finishedPriceSource === 'AUTO' ? `Automatic sell price · ${state.settings.priceCity} · ${estimate.finishedPriceStatus}${estimate.finishedPriceTimestamp ? ` · ${new Date(estimate.finishedPriceTimestamp).toLocaleString()}` : ''}` : estimate.finishedPriceSource === 'MANUAL' ? 'Manual price override' : 'Market price unavailable. Enter a selling price to calculate profit.'}</small></label><label className="field"><span className="field-label">Tax</span><select value={draft.taxMode} onChange={(event) => setDraft({ taxMode: event.target.value as EnchantCraftDraft['taxMode'] })}><option value="normal">Normal · 10%</option><option value="premium">Premium · 6.5%</option></select></label></div>
          {(item || estimate.rerollItemValueSource !== 'RECIPE') && <label className="field enchant-reroll-value"><span className="field-label">Item value for reroll fee (silver)</span><input aria-label="Item value for reroll fee" type="number" min="0" max="1000000000000000" step="any" placeholder="Enter this item's Albion Item Value" value={amount(draft.rerollItemValue ?? estimate.rerollItemValue)} onChange={(event) => saveItemValue(event.target.value)} /><small className="enchant-price-status">{estimate.rerollItemValueSource === 'SAVED' && item ? `Saved for ${item.name} T${item.tier}; reused for every enchantment level.` : estimate.rerollItemValueSource === 'RECIPE' && item ? `Recipe-derived value for ${item.name} T${item.tier}. Enter an override here to save and reuse it for every enchantment level.` : item ? `Enter once for ${item.name} T${item.tier}; Forge will save it for every enchantment level.` : "Enter the Albion Item Value required for reroll fees, not the market selling price."}</small></label>}
          <div className="enchant-totals" aria-live="polite"><div className="enchant-cost-group"><h4>Costs for {formatNumber(draft.craftCount || 0)} items</h4><div><span>Materials</span><strong>{display(estimate.materialsCost, ' silver')}</strong></div><div><span>Rerolls</span><strong>{display(estimate.rerollCost, ' silver')}</strong></div><div><span>Food</span><strong>{display(estimate.foodCost, ' silver')}</strong></div></div><div className="enchant-highlight"><span>Total cost</span><strong>{display(estimate.totalCost, ' silver')}</strong><small>{display(estimate.totalCostPerItem, ' silver')} per finished item</small></div><div className="enchant-cost-group"><h4>Sale estimate</h4><div><span>Revenue</span><strong>{display(estimate.revenue, ' silver')}</strong></div><div><span>Tax ({draft.taxMode === 'premium' ? '6.5% Premium' : '10% Normal'})</span><strong>{display(estimate.salesTax, ' silver')}</strong></div></div><div className="enchant-highlight"><span>Estimated profit</span><strong>{display(estimate.profit, ' silver')}</strong><small>Margin {display(estimate.profitMargin, '%')}</small></div></div>
          {!itemValueKnown && <p className="enchant-missing"><strong>Item Value required:</strong> Enter the Albion Item Value above before adding this estimate to your plan or creating its Forge project.</p>}
          {(estimate.errors.length > 0 || missingMaterialPrices.length > 0 || otherMissingInputs.length > 0) && <p className="enchant-missing"><strong>{estimate.errors.length ? 'Check estimate inputs:' : 'Estimate incomplete:'}</strong> {estimate.errors.join(' ')} {missingMaterialPrices.length > 0 && <>Missing material prices: {missingMaterialPrices.map((row) => row.name).join(', ')}. Enter them in the highlighted Unit price fields.</>} {otherMissingInputs.join(' ')}</p>}
        </section>


      </aside>
    </div>



    <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">MULTI-ITEM PLAN</span><h3>Plan estimates</h3><p>Snapshots for comparison and combined shopping. They are not purchases or inventory changes.</p></div><button className="button button-outline button-sm" disabled={!saved.plan.length} onClick={() => { if (window.confirm('Clear every estimate from this crafting plan?')) onChange({ ...saved, plan: [] }); }}>Clear plan</button></div>
      {saved.plan.map((entry: EnchantPlanEntry, index) => { const planRow = planEstimates[index]; return <div className="enchant-plan-row" key={entry.id}><div>{entry.draft.itemId && <ItemIcon id={entry.draft.itemId} size={34} />}<span><strong>{draftDisplayName(entry.draft)}</strong><small>{formatNumber(entry.draft.craftCount || 0)} items</small></span></div><span>Cost {formatSilver(planRow?.estimate.totalCost)}</span><span>Revenue {formatSilver(planRow?.estimate.revenue)}</span><strong>Profit {formatSilver(planRow?.estimate.profit)}</strong><button className="icon-button danger" aria-label="Remove from plan" onClick={() => onChange({ ...saved, plan: saved.plan.filter((row) => row.id !== entry.id) })}><Trash2 size={14} /></button></div>; })}
      {!saved.plan.length && <p className="muted-copy">Add the current estimate to begin a plan.</p>}
      {saved.plan.length > 0 && <div className="enchant-shopping-list">
        <h4>Combined materials</h4>
        {combinedMaterials.map((row) => <div key={row.key}><span>{row.name}</span><strong>{formatNumber(row.quantity)}</strong><span>{formatSilver(row.cost)}</span></div>)}
        <h4 className="enchant-food-heading">Food to buy</h4>
        {(() => {
          const foods = new Map<string, { name: string; meals: number; cost: number | null }>();
          for (const { entry, estimate: result } of planEstimates) {
            if (entry.draft.foodId === 'none') continue;
            const food = ENCHANT_FOODS[entry.draft.foodId as keyof typeof ENCHANT_FOODS];
            const current = foods.get(entry.draft.foodId) || { name: food.name, meals: 0, cost: 0 };
            current.meals += result.foodMeals || 0;
            current.cost = current.cost == null || result.foodCost == null ? null : current.cost + result.foodCost;
            foods.set(entry.draft.foodId, current);
          }
          return foods.size ? [...foods.entries()].map(([id, food]) => <div key={id}><span>{food.name}</span><strong>{formatNumber(food.meals)} meal(s)</strong><span>{formatSilver(food.cost)}</span></div>) : <p className="muted-copy">No food selected in the plan.</p>;
        })()}
        {(() => { const known = planEstimates.every(({ estimate: result }) => result.totalCost != null && result.revenue != null && result.profit != null); return <div className="enchant-plan-summary"><span>Plan total</span><strong>{known ? formatSilver(planEstimates.reduce((sum, row) => sum + row.estimate.totalCost!, 0)) : 'Incomplete estimates'}</strong><span>Revenue {known ? formatSilver(planEstimates.reduce((sum, row) => sum + row.estimate.revenue!, 0)) : 'Unavailable'}</span><b>Profit {known ? formatSilver(planEstimates.reduce((sum, row) => sum + row.estimate.profit!, 0)) : 'Unavailable'}</b></div>; })()}
      </div>}
    </section>
  </div>;
}
