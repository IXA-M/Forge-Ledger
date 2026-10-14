import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Archive, ArrowDownToLine, ArrowLeft, ArrowUpRight, BadgeCheck, Boxes, CalendarDays,
  Check, CheckCircle2, ChevronDown, CircleHelp, ClipboardList, Clock3, Coins, Download, ExternalLink,
  FileDown, Filter, Hammer, ListTodo, MapPin, PackageCheck, PackagePlus, Plus, RefreshCw, Search, Settings2,
  ShieldCheck, ShoppingCart, Sparkles, Target, Trash2, TrendingUp, Upload, Wallet, X,
} from 'lucide-react';
import catalogData from './catalog.json';
import craftingFameFactors from './craftingFameFactors.json';
import {
  batchRequirements, CITY_OPTIONS, emptyState, formatItemName, formatMaterialName, formatNumber, formatSilver, formatTier, getOrderStatus, getPriceFreshness, itemEnchantmentLevel,
  manualPriceKey, materialShortageOverview, mergePriceSnapshot, newId, priceKey, projectMaterials,
  calculateBuyOrderSetupFee, isProjectCompleted, journalPlan, markProjectCrafted, materialReadiness, projectMaterialCost, projectReturnRate, recipeFor, recipeRequirements, recordOrderReceipt, reverseOrderPurchase, setProjectMaterialBalance, sharedUnallocated, today, validateState,
  type AppState, type AutoPrice, type BuyOrder, type CatalogItem, type CraftSession, type InventoryBalance, type ManualPrice,
  type Material, type MaterialAllocation, type MaterialShortageSummary, type MaterialSummary, type Priority, type Project, type Purchase, type Recipe, type Task,
} from './domain';
import { fetchMarketPrices } from './market';
import { downloadBlob, exportPurchasesCsv, loadState, saveState } from './storage';
import './styles.css';

const sourceCatalog = catalogData as CatalogItem[];
const legacyGeneratedTasks = new Map([
  ['Acquire missing materials', 'Record material batches as they arrive.'],
  ['Place or check buy orders', 'Keep city, price, and remaining order quantities up to date.'],
  ['Collect fulfilled materials', 'Confirm order fulfillment only after the items are received.'],
  ['Craft next batch', 'Check the ready quantity before logging a crafting session.'],
  ['Review project progress', 'Review remaining items, due date, and material estimates.'],
  ['Complete this project', 'Close out the project after the target is reached.'],
]);
const isLegacyGeneratedTask = (task: Task) => legacyGeneratedTasks.get(task.title) === task.description;
const sourceMaterialNames = new Map<string, string>();
for (const entry of sourceCatalog) for (const recipe of entry.recipes) for (const material of recipe.materials) {
  if (!/_LEVEL[1-4](?:@[1-4])?$/.test(material.id)) sourceMaterialNames.set(material.id.replace(/@[1-4]$/, ''), material.name);
}
const displayMaterialName = (id: string, name: string) => formatMaterialName(id, name, sourceMaterialNames);
const catalog = sourceCatalog.map((entry) => ({
  ...entry,
  craftingFameFactor: entry.craftingFameFactor ?? (craftingFameFactors as Record<string, number>)[entry.id] ?? 1,
  recipes: entry.recipes.map((recipe) => ({ ...recipe, materials: recipe.materials.map((material) => ({ ...material, name: displayMaterialName(material.id, material.name) })) })),
}));
const CATALOG_BY_ID = new Map(catalog.map((item) => [item.id, item]));
type Screen = 'Dashboard' | 'Projects' | 'Materials' | 'Buy Orders' | 'Tasks' | 'Settings';
type ModalState = { kind: 'project'; projectId?: string } | { kind: 'purchase'; projectId?: string; material?: Material; marketListing?: boolean } | { kind: 'order'; projectId?: string; material?: Material; orderId?: string; repeatOrderId?: string } | { kind: 'receive'; orderId: string } | { kind: 'orderCheck'; orderId: string } | { kind: 'task'; projectId?: string; taskId?: string } | { kind: 'prices'; projectId: string; material: Material } | { kind: 'allocation'; materialId: string; materialName: string; projectId?: string } | { kind: 'inventory'; projectId?: string };

const IconForScreen = ({ screen }: { screen: Screen }) => {
  const props = { size: 17, strokeWidth: 1.8 };
  if (screen === 'Dashboard') return <Target {...props} />;
  if (screen === 'Projects') return <ClipboardList {...props} />;
  if (screen === 'Materials') return <Boxes {...props} />;
  if (screen === 'Buy Orders') return <ShoppingCart {...props} />;
  if (screen === 'Tasks') return <ListTodo {...props} />;
  return <Settings2 {...props} />;
};

function ItemIcon({ id, size = 38 }: { id: string; size?: number }) {
  const iconId = id.split('#')[0];
  return <img className="item-icon" width={size} height={size} src={`https://render.albiononline.com/v1/item/${encodeURIComponent(iconId)}.png?quality=1&size=${size}`} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />;
}

function updatedLabel(date: string | null | undefined) {
  return date ? new Date(date).toLocaleString() : 'Unknown update time';
}

function groupPriceText(value: string) {
  if (!value) return '';
  const [integer, decimal] = value.replaceAll(',', '').split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal === undefined ? grouped : `${grouped}.${decimal}`;
}

function PriceInput({ value, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & { value: string; onChange: (value: string) => void }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => groupPriceText(value));
  useEffect(() => { if (!focused) setDraft(groupPriceText(value)); }, [focused, value]);
  return <input {...props} type="text" inputMode="decimal" value={draft} onFocus={() => { setFocused(true); setDraft(value.replaceAll(',', '')); }} onChange={(event) => { const raw = event.target.value.replaceAll(',', '').replace(/[^\d.]/g, ''); setDraft(raw); onChange(raw); }} onBlur={() => { setFocused(false); setDraft(groupPriceText(draft)); }} />;
}

function qualityLabel(quality: number) {
  return ['Normal', 'Good', 'Outstanding', 'Excellent', 'Masterpiece'][quality - 1] || `Quality ${quality}`;
}

function StatusBadge({ value }: { value: string }) {
  const tone = value === 'MANUAL' ? 'manual' : value.includes('PARTIALLY FULFILLED') ? 'partial' : value === 'ACTIVE' ? 'fresh' : value === 'FULFILLED' ? 'ready' : value === 'CANCELLED' ? 'stale' : value.includes('Fresh') ? 'fresh' : value.includes('Stale') ? 'stale' : value.includes('Unverified') ? 'unverified' : value === 'UNAVAILABLE' ? 'unavailable' : value === 'READY TO CRAFT' ? 'ready' : 'neutral';
  return <span className={`status-badge ${tone}`}>{value}</span>;
}

function Progress({ value, tone = 'green' }: { value: number; tone?: 'green' | 'gold' }) {
  return <div className={`progress-track ${tone}`}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function ModalShell({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
    {children}
  </section></div>;
}

function ItemPicker({ value, onChange, disabled = false }: { value: string; onChange: (item: CatalogItem | undefined) => void; disabled?: boolean }) {
  const selected = CATALOG_BY_ID.get(value);
  const [query, setQuery] = useState(selected ? formatItemName(selected.name, selected.id) : '');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog.slice(0, 24);
    return catalog.filter((item) => `${item.name} ${item.id} ${item.category} ${item.subcategory}`.toLowerCase().includes(needle)).slice(0, 40);
  }, [query]);
  return <div className="picker-wrap">
    <label className="field-label">Craftable item <span className="required-star">*</span></label>
    <div className="picker-input"><Search size={16} /><input value={query} disabled={disabled} placeholder={`Search ${catalog.length.toLocaleString()} craftable items…`} onChange={(event) => { setQuery(event.target.value); setOpen(true); if (value) onChange(undefined); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 130)} /><ChevronDown size={15} /></div>
    {open && <div className="picker-results">{results.length ? results.map((item) => <button type="button" className="picker-option" key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(formatItemName(item.name, item.id)); setOpen(false); onChange(item); }}>
      <ItemIcon id={item.id} size={38} /><span className="picker-option-title"><strong>{formatItemName(item.name, item.id)}</strong><small>{item.category} · {formatTier(item.tier, item.id)}</small></span><span className="item-id">{item.id}</span>
    </button>) : <div className="picker-empty">No craftable items found in the current catalog.</div>}</div>}
    {selected && <div className="selected-item"><ItemIcon id={selected.id} /><span><strong>{formatItemName(selected.name, selected.id)}</strong><small>{selected.category} · {formatTier(selected.tier, selected.id)}</small></span></div>}
  </div>;
}

function ProjectModal({ state, project, onClose, onSave }: { state: AppState; project?: Project; onClose: () => void; onSave: (project: Project) => void }) {
  const [item, setItem] = useState<CatalogItem | undefined>(project ? CATALOG_BY_ID.get(project.itemId) : undefined);
  const [recipeId, setRecipeId] = useState(project?.recipeId || '');
  const [enchantment, setEnchantment] = useState(itemEnchantmentLevel(project?.recipeId || '') || '0');
  const [name, setName] = useState(project?.name || '');
  const [target, setTarget] = useState(String(project?.target ?? 100));
  const [sellingPrice, setSellingPrice] = useState(project?.sellingPrice == null ? '' : String(project.sellingPrice));
  const [returnRate, setReturnRate] = useState(String(project?.returnRate ?? (state.settings.applyReturnRate ? state.settings.returnRate : 0)));
  const [priority, setPriority] = useState<Priority>(project?.priority || 'Normal');
  const [deadline, setDeadline] = useState(project?.deadline || '');
  const [notes, setNotes] = useState(project?.notes || '');
  const existingRecords = project ? project.crafted > 0 || state.purchases.some((entry) => entry.projectId === project.id) || state.allocations.some((entry) => entry.projectId === project.id) || state.orders.some((entry) => entry.projectId === project.id) || state.sessions.some((entry) => entry.projectId === project.id) : false;
  const dragonSlayer = !!item && /dragonslayer/i.test(item.name);
  const enchantmentLevels = [...new Set(item?.recipes.map((recipe) => itemEnchantmentLevel(recipe.id) || '0') || [])]
    .sort((a, b) => Number(a) - Number(b));
  const recipesAtEnchantment = item?.recipes.filter((recipe) => (itemEnchantmentLevel(recipe.id) || '0') === enchantment) || [];
  const currentRecipe = recipesAtEnchantment.find((recipe) => recipe.id === recipeId)
    || recipesAtEnchantment.find((recipe) => !/fire dragon scales/i.test(recipe.label))
    || recipesAtEnchantment[0];
  const chosenRecipe = currentRecipe ? { ...currentRecipe, outputCount: 1 } : undefined;
  const previewRequirements = chosenRecipe ? recipeRequirements(chosenRecipe, Math.max(0, Number(target) || 0), Math.min(100, Math.max(0, Number(returnRate) || 0)) / 100) : new Map<string, Material>();
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Math.floor(Number(target));
    if (!item || !chosenRecipe || !Number.isFinite(amount) || amount <= 0) return;
    const price = sellingPrice.trim() === '' ? null : Number(sellingPrice);
    if (price != null && (!Number.isFinite(price) || price < 0)) return;
    onSave({
      id: project?.id || newId(), name: name.trim() || formatItemName(item.name, chosenRecipe.id), itemId: item.id, recipeId: chosenRecipe.id,
      target: amount, crafted: project?.crafted || 0, createdAt: project?.createdAt || new Date().toISOString(),
      deadline, notes: notes.trim(), priority, dailyTarget: project?.dailyTarget || 0, returnRate: Math.min(100, Math.max(0, Number(returnRate) || 0)),
      sellingPrice: price, completed: project ? (project.completed ?? project.crafted >= project.target) : false, completedAt: project?.completedAt, completionHistory: project?.completionHistory,
      completionMaterialConsumption: project?.completionMaterialConsumption,
      journalType: project?.journalType || item.journalType || undefined, journalFamePerItem: project?.recipeId === chosenRecipe.id ? project?.journalFamePerItem : null,
      journalsOwned: project?.journalsOwned, journalsFilled: project?.journalsFilled, journalsInProgress: project?.journalsInProgress,
      journalsBought: project?.journalsBought, journalsSold: project?.journalsSold,
    });
  };
  return <ModalShell title={project ? 'Edit crafting project' : 'Plan a crafting project'} subtitle="Start with an item from the game recipe catalog." onClose={onClose} wide>
    <form onSubmit={save} className="form-body">
    <div className="form-grid"><ItemPicker value={item?.id || ''} disabled={existingRecords} onChange={(selected) => { if (existingRecords) return; const oldAutoName = item ? formatItemName(item.name, recipeId || item.id) : ''; const nextLevel = selected ? itemEnchantmentLevel(selected.recipes[0]?.id || '') || '0' : '0'; const nextRecipes = selected?.recipes.filter((recipe) => (itemEnchantmentLevel(recipe.id) || '0') === nextLevel) || []; const nextRecipe = nextRecipes.find((recipe) => !/fire dragon scales/i.test(recipe.label)) || nextRecipes[0]; setItem(selected); setEnchantment(nextLevel); setRecipeId(nextRecipe?.id || ''); if (selected) setName((current) => !current || current === oldAutoName ? formatItemName(selected.name, nextRecipe?.id || selected.id) : current); }} />
        <div className="field"><label className="field-label">Project name</label><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Season 27 gear stock" maxLength={80} /></div>
        <div className="field"><label className="field-label">Enchantment</label><select value={enchantment} disabled={!item} onChange={(event) => { const nextLevel = event.target.value; const previousName = item && currentRecipe ? formatItemName(item.name, currentRecipe.id) : ''; const nextOptions = item?.recipes.filter((recipe) => (itemEnchantmentLevel(recipe.id) || '0') === nextLevel) || []; const keepScaleVariant = !!currentRecipe && /fire dragon scales/i.test(currentRecipe.label); const sameVariant = nextOptions.find((recipe) => dragonSlayer && /fire dragon scales/i.test(recipe.label) === keepScaleVariant); const nextRecipe = sameVariant || nextOptions.find((recipe) => !/fire dragon scales/i.test(recipe.label)) || nextOptions[0]; setEnchantment(nextLevel); setRecipeId(nextRecipe?.id || ''); if (item && nextRecipe) setName((current) => current === previousName ? formatItemName(item.name, nextRecipe.id) : current); }}>{enchantmentLevels.map((level) => <option key={level} value={level}>{level === '0' ? 'No enchantment (.0)' : `.${level}`}</option>)}</select><small className="field-help">Choose the item enchantment level.</small></div>
        {dragonSlayer && <div className="field"><label className="field-label">Recipe option</label><select value={chosenRecipe?.id || ''} onChange={(event) => setRecipeId(event.target.value)} disabled={!item}>{recipesAtEnchantment.map((recipe) => <option key={recipe.id} value={recipe.id}>{/fire dragon scales/i.test(recipe.label) ? 'Fire Dragon Scales' : 'Standard materials'} · yields 1</option>)}</select><small className="field-help">Choose which Dragon Slayer material recipe to use.</small></div>}
        <div className="field"><label className="field-label">Target quantity</label><input type="number" min="1" step="1" required value={target} onChange={(event) => setTarget(event.target.value)} /><small className="field-help">Recipe resource totals update with this target.</small></div>
        <div className="field"><label className="field-label">Selling price per item <span className="optional-label">Optional</span></label><PriceInput value={sellingPrice} onChange={setSellingPrice} placeholder="Enter expected price" /></div>
        <div className="field"><label className="field-label">Project RRR estimate</label><div className="input-suffix"><input type="number" min="0" max="100" step="0.1" value={returnRate} onChange={(event) => setReturnRate(event.target.value)} /><span>%</span></div><small className="field-help">This project rate is independent of the application default.</small></div>
        <div className="field"><label className="field-label">Priority</label><select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{['Low', 'Normal', 'High', 'Urgent'].map((value) => <option key={value}>{value}</option>)}</select></div>
        <div className="field"><label className="field-label">Deadline <span className="optional-label">Optional</span></label><input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></div>
        <div className="field full-field"><label className="field-label">Notes <span className="optional-label">Optional</span></label><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add a goal, location, or other context…" /></div>
      </div>
      {chosenRecipe && <div className="recipe-preview"><strong>Selected: {recipeName(chosenRecipe, item?.name)} · one item per craft; ingredients for this target; RRR applies to returnable inputs</strong><div>{chosenRecipe.materials.map((material) => <span key={material.id}><ItemIcon id={material.id} size={25} />{material.name}: {formatNumber(material.count)} per item · {formatNumber(previewRequirements.get(material.id)?.count || 0)} total{!material.returnable ? ' · no returns' : ''}</span>)}</div></div>}
      {project && <p className="helper-note"><CircleHelp size={15} /> Material purchases and recipe history are preserved when you change the target. {existingRecords && 'The item stays fixed after progress or transactions exist; recipe changes affect future planning only.'}</p>}
      <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!item}>{project ? 'Save changes' : 'Create project'}<ArrowUpRight size={15} /></button></div>
    </form>
  </ModalShell>;
}

function ProjectRrrInput({ value, onSave }: { value: number; onSave: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <input aria-label="Project resource return rate" type="number" min="0" max="100" step="0.1" value={draft}
    onChange={(event) => {
      const nextDraft = event.target.value;
      setDraft(nextDraft);
      if (nextDraft !== '' && Number.isFinite(Number(nextDraft))) onSave(Math.min(100, Math.max(0, Number(nextDraft))));
    }}
    onBlur={() => { const parsed = Number(draft); const next = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : value; setDraft(String(next)); onSave(next); }} />;
}

function recipeName(recipe: Recipe, itemName?: string) {
  const enchant = itemEnchantmentLevel(recipe.id);
  const variant = recipe.id.match(/#(\d+)$/)?.[1];
  const productName = itemName ? formatItemName(itemName, recipe.id) : '';
  if (/Fire Dragon Scales/i.test(recipe.label)) return `${productName ? `${productName} · ` : ''}Fire Dragon Scales${variant ? ` · Recipe ${variant}` : ''}`;
  if (variant) return `${productName ? `${productName} · ` : ''}Recipe ${variant}`;
  if (enchant) return productName || `.${enchant}`;
  return itemName || recipe.label;
}

function projectProductName(project: Project, item?: CatalogItem) {
  return formatItemName(item?.name || project.itemId, project.recipeId);
}

function projectDisplayName(project: Project, item?: CatalogItem) {
  const productName = projectProductName(project, item || CATALOG_BY_ID.get(project.itemId));
  const baseName = (item || CATALOG_BY_ID.get(project.itemId))?.name;
  if (!project.name || project.name === baseName || project.name === productName || project.name.endsWith(` · ${productName}`)) return productName;
  return `${project.name} · ${productName}`;
}

function projectProductIcon(project: Project) {
  const enchant = itemEnchantmentLevel(project.recipeId);
  return `${project.itemId}${enchant ? `@${enchant}` : ''}`;
}

function materialDefaultPrice(state: AppState, materialId: string) {
  const pricedPurchases = state.purchases.filter((purchase) => purchase.materialId === materialId && !purchase.reversesPurchaseId && purchase.unitPrice != null && purchase.unitPrice > 0);
  const purchaseQuantity = pricedPurchases.reduce((sum, purchase) => sum + purchase.quantity, 0);
  if (purchaseQuantity > 0) return pricedPurchases.reduce((sum, purchase) => sum + purchase.quantity * purchase.unitPrice!, 0) / purchaseQuantity;
  const pricedOrders = state.orders.filter((order) => order.materialId === materialId && order.unitPrice > 0 && (!order.archived && !order.cancelled || order.fulfilled > order.received));
  const orderQuantity = pricedOrders.reduce((sum, order) => sum + Math.max(0, ((order.archived || order.cancelled) ? order.fulfilled : order.quantity) - order.received), 0);
  if (orderQuantity > 0) return pricedOrders.reduce((sum, order) => sum + Math.max(0, ((order.archived || order.cancelled) ? order.fulfilled : order.quantity) - order.received) * order.unitPrice, 0) / orderQuantity;
  const estimates = Object.entries(state.manualPrices).filter(([key, value]) => key.endsWith(`::${materialId}`) && value.buy != null && value.buy > 0).map(([, value]) => value.buy!);
  if (estimates.length) return estimates.reduce((sum, value) => sum + value, 0) / estimates.length;
  const marketPrices = Object.entries(state.prices).filter(([key, value]) => key.startsWith(`${materialId}::`) && value.buy != null && value.buy > 0).map(([, value]) => value.buy!);
  return marketPrices.length ? marketPrices.reduce((sum, value) => sum + value, 0) / marketPrices.length : null;
}

function materialUnpricedCount(state: AppState, materialId: string) {
  return state.purchases.filter((purchase) => purchase.materialId === materialId && (purchase.unitPrice == null || purchase.unitPrice === 0 && !purchase.zeroPriceConfirmed)).length
    + state.orders.filter((order) => order.materialId === materialId && order.unitPrice === 0 && !order.zeroPriceConfirmed).length
    + state.allocations.filter((allocation) => allocation.materialId === materialId && (allocation.unitPriceAtAllocation == null || allocation.unitPriceAtAllocation === 0 && !allocation.zeroPriceConfirmed)).length;
}

function hasUsableManualBuy(manual: ManualPrice | undefined) {
  return manual?.buy != null && (manual.buy !== 0 || manual.zeroBuyConfirmed === true);
}

function reviewMaterialPrice(state: AppState, materialId: string, enteredPrice: number | null, materialName: string) {
  const defaultPrice = materialDefaultPrice(state, materialId);
  const unpricedCount = materialUnpricedCount(state, materialId);
  if (enteredPrice === 0) {
    if (window.confirm(`${materialName} has a zero price. Is this intentional? Choose OK to keep zero, or Cancel to enter a default price.`)) return { price: 0, applyToUnpriced: false };
    const input = window.prompt(`Enter the default unit price for ${materialName}. It will also fill its existing zero or unknown prices.`, defaultPrice == null ? '' : String(defaultPrice));
    if (input == null) return null;
    const replacement = Number(input);
    if (!Number.isFinite(replacement) || replacement <= 0) {
      window.alert('Enter a default price greater than zero.');
      return null;
    }
    return { price: replacement, applyToUnpriced: true };
  }
  if (enteredPrice == null && defaultPrice != null) {
    if (window.confirm(`${materialName} already has priced quantities. Use ${formatSilver(defaultPrice)} as the default for this batch${unpricedCount ? ` and ${unpricedCount} existing zero or unknown price record${unpricedCount === 1 ? '' : 's'}` : ''}?`)) return { price: defaultPrice, applyToUnpriced: true };
  } else if (enteredPrice != null && enteredPrice > 0 && unpricedCount > 0) {
    if (window.confirm(`${materialName} has ${unpricedCount} existing zero or unknown price record${unpricedCount === 1 ? '' : 's'}. Use ${formatSilver(enteredPrice)} as the default for those records too?`)) return { price: enteredPrice, applyToUnpriced: true };
  }
  return { price: enteredPrice, applyToUnpriced: false };
}

function reviewZeroEstimate(value: number | null, label: string, suggestedDefault: number | null) {
  if (value !== 0) return value;
  if (window.confirm(`${label} is zero. Is this intentional? Choose OK to keep zero, or Cancel to enter a default price.`)) return 0;
  const input = window.prompt(`Enter a default ${label.toLowerCase()} greater than zero.`, suggestedDefault == null ? '' : String(suggestedDefault));
  if (input == null) return undefined;
  const replacement = Number(input);
  if (!Number.isFinite(replacement) || replacement <= 0) {
    window.alert('Enter a default price greater than zero.');
    return undefined;
  }
  return replacement;
}

function fillUnpricedMaterialRecords(state: AppState, materialId: string, price: number): AppState {
  return {
    ...state,
    purchases: state.purchases.map((purchase) => purchase.materialId === materialId && (purchase.unitPrice == null || purchase.unitPrice === 0 && !purchase.zeroPriceConfirmed) ? { ...purchase, unitPrice: price, zeroPriceConfirmed: false } : purchase),
    orders: state.orders.map((order) => order.materialId === materialId && order.unitPrice === 0 && !order.zeroPriceConfirmed ? { ...order, unitPrice: price, zeroPriceConfirmed: false } : order),
    allocations: state.allocations.map((allocation) => allocation.materialId === materialId && (allocation.unitPriceAtAllocation == null || allocation.unitPriceAtAllocation === 0 && !allocation.zeroPriceConfirmed) ? { ...allocation, unitPriceAtAllocation: price, zeroPriceConfirmed: false } : allocation),
  };
}

function TaskModal({ state, task, projectId, onClose, onSave }: { state: AppState; task?: Task; projectId?: string; onClose: () => void; onSave: (task: Task) => void }) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [notes, setNotes] = useState(task?.notes || '');
  const [dueDate, setDueDate] = useState(task?.dueDate || '');
  const [priority, setPriority] = useState<Priority>(task?.priority || 'Normal');
  const [selectedProject, setSelectedProject] = useState(projectId || task?.projectId || state.projects[0]?.id || '');
  return <ModalShell title={task ? 'Edit task' : 'Add a task'} onClose={onClose}><form className="form-body" onSubmit={(event) => { event.preventDefault(); if (!title.trim() || !selectedProject) return; onSave({ id: task?.id || newId(), projectId: selectedProject, title: title.trim(), description: description.trim(), notes: notes.trim(), dueDate, priority, completed: task?.completed || false, createdAt: task?.createdAt || new Date().toISOString() }); }}>
    <div className="field"><label className="field-label">Task title <span className="required-star">*</span></label><input autoFocus required value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to get done?" /></div>
    <div className="field"><label className="field-label">Project</label><select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}>{state.projects.map((project) => <option key={project.id} value={project.id}>{projectDisplayName(project)}</option>)}</select></div>
    <div className="field"><label className="field-label">Description</label><textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
    <div className="form-grid"><div className="field"><label className="field-label">Due date</label><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div><div className="field"><label className="field-label">Priority</label><select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{['Low', 'Normal', 'High', 'Urgent'].map((value) => <option key={value}>{value}</option>)}</select></div></div>
    <div className="field"><label className="field-label">Notes</label><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!state.projects.length}>{task ? 'Save task' : 'Add task'}</button></div>
  </form></ModalShell>;
}

function PurchaseModal({ state, projects, projectId, material, marketListing = false, onClose, onSave }: { state: AppState; projects: Project[]; projectId?: string; material?: Material; marketListing?: boolean; onClose: () => void; onSave: (purchase: Purchase) => void }) {
  const options = useMemo(() => uniqueMaterials(state, projects), [state, projects]);
  const [selectedProject, setSelectedProject] = useState(projectId ?? 'shared');
  const [materialId, setMaterialId] = useState(material?.id || options[0]?.id || '');
  const [materialQuery, setMaterialQuery] = useState(material?.name || options.find((entry) => entry.id === (material?.id || options[0]?.id))?.name || '');
  const [materialSearchOpen, setMaterialSearchOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [city, setCity] = useState(state.settings.cities[0] || 'Bridgewatch');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const selectedMaterial = options.find((entry) => entry.id === materialId) || material;
  const materialMatches = options.filter((entry) => `${entry.name} ${entry.id}`.toLowerCase().includes(materialQuery.trim().toLowerCase())).slice(0, 60);
  const totalCost = quantity && price ? Number(quantity) * Number(price) : 0;
  return <ModalShell title={marketListing ? 'Buy from a market listing' : 'Record an acquired batch'} subtitle={marketListing ? 'Record items bought immediately from a sell listing. This adds them to inventory without creating a buy order.' : 'Actual purchases stay separate from estimates and buy orders.'} onClose={onClose}><form className="form-body" onSubmit={(event) => { event.preventDefault(); const count = Number(quantity); const actual = price === '' ? null : Number(price); if (!selectedMaterial || !Number.isInteger(count) || count <= 0 || (marketListing && actual == null) || (actual != null && (!Number.isFinite(actual) || actual < 0))) return; onSave({ id: newId(), projectId: selectedProject === 'shared' ? null : selectedProject, materialId: selectedMaterial.id, materialName: displayMaterialName(selectedMaterial.id, selectedMaterial.name), city, quantity: count, unitPrice: actual, date, notes: notes.trim(), ...(marketListing ? { source: 'market-listing' as const } : {}) }); }}>
    <div className="field"><label className="field-label">Assign materials to</label><select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}><option value="shared">Shared inventory</option>{projects.map((project) => <option key={project.id} value={project.id}>{projectDisplayName(project)}</option>)}</select></div>
    <div className="field"><label className="field-label">Search item</label><div className="picker-wrap inventory-material-picker"><div className="picker-input"><Search size={16} /><input type="search" role="combobox" aria-expanded={materialSearchOpen} aria-controls="purchase-material-results" aria-label="Search purchase items" autoComplete="off" value={materialQuery} placeholder="Type an item name or ID" onChange={(event) => { setMaterialQuery(event.target.value); setMaterialId(''); setMaterialSearchOpen(true); }} onFocus={() => setMaterialSearchOpen(true)} onBlur={() => setTimeout(() => setMaterialSearchOpen(false), 130)} /><ChevronDown size={15} /></div>{materialSearchOpen && <div className="picker-results" id="purchase-material-results">{materialMatches.length ? materialMatches.map((entry) => <button type="button" className="picker-option" key={entry.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setMaterialId(entry.id); setMaterialQuery(entry.name); setMaterialSearchOpen(false); }}><ItemIcon id={entry.id} size={34} /><span className="picker-option-title"><strong>{entry.name}</strong><small>{entry.id}</small></span></button>) : <div className="picker-empty">No matching items found.</div>}</div>}</div>{selectedMaterial && <div className="selected-item"><ItemIcon id={selectedMaterial.id} /><span><strong>{selectedMaterial.name}</strong><small>{selectedMaterial.id}</small></span></div>}</div>
    <div className="form-grid"><div className="field"><label className="field-label">Quantity {marketListing ? 'to buy' : 'acquired'}</label><input type="number" min="1" step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div><div className="field"><label className="field-label">{marketListing ? 'Listing price per item' : 'Actual unit price'} <span className="optional-label">{marketListing ? 'Required' : 'Optional'}</span></label><PriceInput value={price} onChange={setPrice} placeholder={marketListing ? 'Silver per item' : 'Leave blank if unknown'} required={marketListing} /><small className="field-help">{marketListing ? `Total purchase: ${formatSilver(totalCost)}` : 'For a buy order receipt, use its Record receipt action so fulfillment stays linked.'}</small></div><div className="field"><label className="field-label">City</label><select value={city} onChange={(event) => setCity(event.target.value)}>{state.settings.cities.map((name) => <option key={name}>{name}</option>)}</select></div><div className="field"><label className="field-label">Purchase date</label><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></div></div>
    <div className="field"><label className="field-label">Notes</label><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary">{marketListing ? 'Record market purchase' : 'Save purchase'}</button></div>
  </form></ModalShell>;
}

function uniqueMaterials(state: AppState, projects: Project[]) {
  const found = new Map<string, Material>();
  for (const item of catalog) {
    found.set(item.id, { id: item.id, name: displayMaterialName(item.id, item.name), count: 0, returnable: false });
    for (const recipe of item.recipes) for (const entry of recipe.materials) found.set(entry.id, { ...entry, name: displayMaterialName(entry.id, entry.name) });
  }
  for (const project of projects) for (const material of projectMaterials(state, project, catalog)) found.set(material.id, { ...material, name: displayMaterialName(material.id, material.name) });
  for (const purchase of state.purchases) if (!found.has(purchase.materialId)) found.set(purchase.materialId, { id: purchase.materialId, name: displayMaterialName(purchase.materialId, purchase.materialName), count: 0, returnable: true });
  for (const balance of state.inventoryBalances || []) if (!found.has(balance.materialId)) found.set(balance.materialId, { id: balance.materialId, name: balance.materialName, count: 0, returnable: true });
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function OrderModal({ state, projects, project, material, order, repeatFrom, onClose, onSave }: { state: AppState; projects: Project[]; project?: Project; material?: Material; order?: BuyOrder; repeatFrom?: BuyOrder; onClose: () => void; onSave: (order: BuyOrder) => void }) {
  const [selectedProjectId, setSelectedProjectId] = useState(project?.id || order?.projectId || repeatFrom?.projectId || '');
  const selectedProject = projects.find((entry) => entry.id === selectedProjectId);
  const options = selectedProject ? projectMaterials(state, selectedProject, catalog).filter((entry) => entry.required > 0 || entry.id === order?.materialId || entry.id === repeatFrom?.materialId) : [];
  const [materialId, setMaterialId] = useState(order?.materialId || repeatFrom?.materialId || material?.id || '');
  const selectedMaterial = options.find((entry) => entry.id === materialId) || (material?.id === materialId ? material : undefined);
  const fixedProject = !!project || !!order || !!repeatFrom;
  const showOrderFields = !!selectedProject && !!selectedMaterial;
  const [city, setCity] = useState(order?.city || repeatFrom?.city || state.settings.cities[0] || 'Bridgewatch');
  const [unitPrice, setUnitPrice] = useState(String(order?.unitPrice ?? repeatFrom?.unitPrice ?? ''));
  const [quantity, setQuantity] = useState(String(order?.quantity ?? repeatFrom?.quantity ?? ''));
  const [placedAt, setPlacedAt] = useState(order?.placedAt || today());
  const [notes, setNotes] = useState(order?.notes || repeatFrom?.notes || '');
  const orderValue = Math.max(0, Number(unitPrice) || 0) * Math.max(0, Math.floor(Number(quantity) || 0));
  const setupFeePreview = (!order || order.unitPrice !== Number(unitPrice)) ? calculateBuyOrderSetupFee(orderValue) : 0;
  const cumulativeSetupFeesPreview = (order?.setupFees || 0) + setupFeePreview;
  return <ModalShell title={order ? 'Update buy order' : repeatFrom ? 'Repeat buy order' : 'Create buy order'} subtitle={`${selectedProject ? `${projectDisplayName(selectedProject)} · ` : ''}This records your in-game order for tracking. It does not submit anything to Albion or add stock.`} onClose={onClose}><form className="form-body" onSubmit={(event) => { event.preventDefault(); const count = Math.floor(Number(quantity)); const price = Number(unitPrice); if (!selectedProject || !selectedMaterial || !Number.isInteger(count) || count <= 0 || !Number.isFinite(price) || price < 0 || count < (order?.received || 0) || count < (order?.fulfilled || 0)) return; onSave({ id: order?.id || newId(), projectId: selectedProject.id, materialId: selectedMaterial.id, materialName: displayMaterialName(selectedMaterial.id, selectedMaterial.name), city, unitPrice: price, quantity: count, fulfilled: order?.fulfilled || 0, received: order?.received || 0, placedAt, notes: notes.trim(), mode: order?.mode || 'Active', cancelled: order?.cancelled || false, archived: order?.archived || false, setupFees: order?.setupFees || 0 }); }}>
    {!fixedProject && <div className="field"><label className="field-label">Project</label><select required value={selectedProjectId} onChange={(event) => { setSelectedProjectId(event.target.value); setMaterialId(''); setUnitPrice(''); setQuantity(''); }}><option value="">Select a project</option>{projects.map((entry) => <option key={entry.id} value={entry.id}>{projectDisplayName(entry)}</option>)}</select></div>}
    {selectedProject && <div className="field"><label className="field-label">Material</label><select required value={materialId} onChange={(event) => { setMaterialId(event.target.value); setUnitPrice(''); setQuantity(''); }}><option value="">Select a required material</option>{options.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>{!options.length && <small className="field-help">This project has no calculated recipe materials.</small>}</div>}
    {showOrderFields && <>
      <div className="form-grid"><div className="field"><label className="field-label">City</label><select value={city} onChange={(event) => setCity(event.target.value)}>{state.settings.cities.map((name) => <option key={name}>{name}</option>)}</select></div><div className="field"><label className="field-label">Buy order price / unit</label><PriceInput required value={unitPrice} onChange={setUnitPrice} /></div><div className="field"><label className="field-label">Quantity requested</label><input type="number" min={Math.max(1, order?.received || 0, order?.fulfilled || 0)} step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div><div className="field"><label className="field-label">Placement date</label><input type="date" value={placedAt} onChange={(event) => setPlacedAt(event.target.value)} /></div></div>
      <div className="order-value-preview"><span>Requested order value</span><strong>{formatSilver(orderValue)}</strong><span>{order && order.unitPrice !== Number(unitPrice) ? 'Price change setup fee (2.5%)' : 'Setup fee charged now (2.5%)'}</span><strong>{formatSilver(setupFeePreview)}</strong><span>Cumulative setup fees</span><strong>{formatSilver(cumulativeSetupFeesPreview)}</strong><span>Total including setup fees</span><strong>{formatSilver(orderValue + cumulativeSetupFeesPreview)}</strong><small>{order && order.unitPrice === Number(unitPrice) ? 'The setup fee is charged when this order is first created.' : 'A 2.5% setup fee is charged for creating the order or changing its price.'} Confirmed acquisitions enter shared inventory at this order's price and city.</small></div>
      <div className="field"><label className="field-label">Notes</label><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
    </>}
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>{showOrderFields && <button className="button button-primary">{order ? 'Save order' : 'Create order'}</button>}</div>
  </form></ModalShell>;
}

function ReceiveModal({ order, onClose, onSave }: { order: BuyOrder; onClose: () => void; onSave: (quantity: number, unitPrice: number, date: string, notes: string, confirmationId: string) => void }) {
  const remaining = Math.max(0, order.quantity - order.received);
  const [remainingInput, setRemainingInput] = useState(String(remaining));
  const [unitPrice, setUnitPrice] = useState(String(order.unitPrice));
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmationId] = useState(newId());
  const remainingAfterCheck = Number(remainingInput);
  const boughtSinceLastCheck = Number.isInteger(remainingAfterCheck) && remainingAfterCheck >= 0 && remainingAfterCheck <= remaining ? remaining - remainingAfterCheck : -1;
  const parsedPrice = Number(unitPrice);
  const priceValid = Number.isFinite(parsedPrice) && parsedPrice >= 0;
  const priceChanged = priceValid && parsedPrice !== order.unitPrice;
  const setupFeeAdded = priceChanged ? calculateBuyOrderSetupFee(order.quantity * parsedPrice) : 0;
  const canSave = !submitting && remainingInput.trim() !== '' && unitPrice.trim() !== '' && boughtSinceLastCheck >= 0 && priceValid && (boughtSinceLastCheck > 0 || priceChanged);
  const confirm = (acquired: number) => {
    if (!canSave || submitting) return;
    setSubmitting(true);
    onSave(acquired, parsedPrice, date, notes.trim(), confirmationId);
  };
  return <ModalShell title="Add bought quantity" subtitle={`${displayMaterialName(order.materialId, order.materialName)} ? ${order.city}`} onClose={onClose} wide><div className="form-body">
    <div className="receipt-order-facts"><span>Original order<strong>{formatNumber(order.quantity)}</strong></span><span>Previously bought<strong>{formatNumber(order.received)}</strong></span><span>Locally remaining<strong>{formatNumber(remaining)}</strong></span></div>
    <div className="field"><label className="field-label">How many units remain in the buy order?</label><input type="number" min="0" max={remaining} step="1" required value={remainingInput} onChange={(event) => setRemainingInput(event.target.value)} /><small className="field-help">Enter the current remaining quantity shown in Albion. The planner will calculate how many were bought since the last check.</small></div>
    <div className="receipt-order-facts receipt-check-result"><span>Bought since last check<strong className={boughtSinceLastCheck > 0 ? 'qty-available' : ''}>{boughtSinceLastCheck < 0 ? '?' : formatNumber(boughtSinceLastCheck)}</strong></span></div>
    <div className="form-grid"><div className="field"><label className="field-label">Buy order price / unit</label><PriceInput required value={unitPrice} onChange={setUnitPrice} /><small className="field-help">Changing the price charges a 2.5% setup fee on the order value.</small></div><div className="field"><label className="field-label">Acquisition date</label><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></div><div className="field"><label className="field-label">Notes</label><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" /></div></div>
    <div className="order-value-preview"><span>Price change setup fee</span><strong>{formatSilver(setupFeeAdded)}</strong><small>{priceChanged ? `A new ${formatSilver(setupFeeAdded)} fee will be added because the price changed.` : 'No new setup fee; the buy order price is unchanged.'} A new order also has a 2.5% setup fee.</small></div>
    <div className="helper-note"><PackageCheck size={15} /> Recording adds {formatNumber(Math.max(0, boughtSinceLastCheck))} units to shared inventory at {formatSilver(priceValid ? parsedPrice : order.unitPrice)} per unit. Unbought units are not added to stock.</div>
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="button" className="button button-primary" disabled={!canSave} onClick={() => confirm(boughtSinceLastCheck)}>{boughtSinceLastCheck > 0 ? `Add ${formatNumber(boughtSinceLastCheck)} bought units` : 'Save order check'}</button></div>
  </div></ModalShell>;
}

function PriceModal({ state, project, material, onClose, onRefresh, onSaveManual, refreshing }: { state: AppState; project: Project; material: Material; onClose: () => void; onRefresh: (ids?: string[]) => void; onSaveManual: (value: ManualPrice | null) => void; refreshing: boolean }) {
  const key = manualPriceKey(project.id, material.id);
  const manual = state.manualPrices[key];
  const [buy, setBuy] = useState(manual?.buy == null ? '' : String(manual.buy));
  const [sell, setSell] = useState(manual?.sell == null ? '' : String(manual.sell));
  const [cityFilter, setCityFilter] = useState('All cities');
  const cities = cityFilter === 'All cities' ? state.settings.cities : [cityFilter];
  return <ModalShell title={`${material.name} prices`} subtitle={`${material.name} - ${qualityLabel(state.settings.marketQuality)} quality · compare city snapshots and your manual estimate.`} onClose={onClose} wide><div className="price-modal-body">
    <div className="price-modal-toolbar"><label className="field compact-field"><span className="field-label">City filter</span><select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}><option>All cities</option>{state.settings.cities.map((city) => <option key={city}>{city}</option>)}</select></label><button className="button button-outline" onClick={() => onRefresh([material.id])} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /> Refresh city snapshots</button></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>City</th><th>Top buy order</th><th>Lowest sell listing</th><th>Manual estimate</th><th>Snapshot timestamps</th></tr></thead><tbody>{cities.map((city) => { const price = state.prices[priceKey(material.id, city, state.settings.marketQuality)]; const buyFreshness = getPriceFreshness(price, state.settings.freshMinutes, Date.now(), 'buy'); const sellFreshness = getPriceFreshness(price, state.settings.freshMinutes, Date.now(), 'sell'); return <tr key={city}><td><strong>{city}</strong></td><td><div className="price-cell"><strong>{price?.buy == null || price.buy <= 0 ? 'Unavailable' : formatSilver(price.buy)}</strong><StatusBadge value={buyFreshness} /></div></td><td><div className="price-cell"><strong>{price?.sell == null || price.sell <= 0 ? 'Unavailable' : formatSilver(price.sell)}</strong><StatusBadge value={sellFreshness} /></div></td><td><div className="price-cell">{manual?.buy == null && manual?.sell == null ? <><strong>Not entered</strong><StatusBadge value="UNAVAILABLE" /></> : <><strong>Buy: {manual?.buy == null || manual.buy === 0 && !manual.zeroBuyConfirmed ? 'Unavailable' : formatSilver(manual.buy)}</strong><strong>Sell: {manual?.sell == null || manual.sell === 0 && !manual.zeroSellConfirmed ? 'Unavailable' : formatSilver(manual.sell)}</strong><StatusBadge value="MANUAL" /><small className="cell-sub">Updated {updatedLabel(manual.updatedAt)}</small></>}</div></td><td><span className="timestamp-line">Buy · {updatedLabel(price?.buyAt)}</span><span className="timestamp-line">Sell · {updatedLabel(price?.sellAt)}</span></td></tr>; })}</tbody></table></div>
    <div className="manual-price-box"><div className="manual-price-heading"><div><h3>Manual estimate</h3><p>Used for future purchase estimates. Actual purchase records remain unchanged.</p></div><div className="manual-price-state">{manual && <><StatusBadge value="MANUAL" /><small>Updated {updatedLabel(manual.updatedAt)}</small></>}</div></div><div className="form-grid"><div className="field"><label className="field-label">Estimated buy price / unit</label><PriceInput value={buy} onChange={setBuy} placeholder="Automatic price used when blank" />{manual?.buy === 0 && !manual.zeroBuyConfirmed && <small className="price-warning">Zero estimate needs review before it is used in costs.</small>}</div><div className="field"><label className="field-label">Estimated sell price / unit <span className="optional-label">Optional</span></label><PriceInput value={sell} onChange={setSell} />{manual?.sell === 0 && !manual.zeroSellConfirmed && <small className="price-warning">Zero estimate needs review.</small>}</div></div><div className="manual-price-actions"><button className="button button-quiet" onClick={() => { onSaveManual(null); setBuy(''); setSell(''); }}>Use automatic price</button><button className="button button-primary" disabled={buy === '' && sell === ''} onClick={() => { const nextBuy = buy === '' ? null : Number(buy); const nextSell = sell === '' ? null : Number(sell); if ((nextBuy != null && (!Number.isFinite(nextBuy) || nextBuy < 0)) || (nextSell != null && (!Number.isFinite(nextSell) || nextSell < 0))) return; const reviewedBuy = nextBuy === 0 && manual?.zeroBuyConfirmed ? 0 : reviewZeroEstimate(nextBuy, 'Estimated buy price', materialDefaultPrice(state, material.id)); if (reviewedBuy === undefined) return; const reviewedSell = nextSell === 0 && manual?.zeroSellConfirmed ? 0 : reviewZeroEstimate(nextSell, 'Estimated sell price', null); if (reviewedSell === undefined) return; setBuy(reviewedBuy == null ? '' : String(reviewedBuy)); setSell(reviewedSell == null ? '' : String(reviewedSell)); onSaveManual({ buy: reviewedBuy, sell: reviewedSell, zeroBuyConfirmed: reviewedBuy === 0, zeroSellConfirmed: reviewedSell === 0, updatedAt: new Date().toISOString() }); }}>Save manual estimate</button></div></div>
    <p className="market-footnote"><CircleHelp size={14} /> Albion Online Data Project prices are community-submitted market snapshots. The timestamp shows the last order update in the feed; it does not guarantee current availability or final cost.</p>
  </div></ModalShell>;
}

function AllocationModal({ state, materialId, materialName, preferredProjectId, onClose, onSave }: { state: AppState; materialId: string; materialName: string; preferredProjectId?: string; onClose: () => void; onSave: (allocation: MaterialAllocation) => void }) {
  const eligibleProjects = state.projects.filter((project) => projectMaterials(state, project, catalog).some((material) => material.id === materialId));
  const [projectId, setProjectId] = useState(eligibleProjects.find((project) => project.id === preferredProjectId)?.id || eligibleProjects[0]?.id || '');
  const [quantity, setQuantity] = useState('');
  const available = sharedUnallocated(state, materialId, catalog);
  const eligible = eligibleProjects;
  const poolPurchases = state.purchases.filter((purchase) => purchase.projectId == null && purchase.materialId === materialId);
  const poolUnits = poolPurchases.reduce((sum, purchase) => sum + purchase.quantity, 0);
  const hasManualSharedStock = (state.inventoryBalances || []).some((entry) => entry.projectId == null && entry.materialId === materialId && entry.quantity > 0);
  const allPoolPricesKnown = !hasManualSharedStock && poolPurchases.length > 0 && poolPurchases.every((purchase) => purchase.unitPrice != null && (purchase.unitPrice > 0 || purchase.zeroPriceConfirmed));
  const unitPriceAtAllocation = allPoolPricesKnown ? poolPurchases.reduce((sum, purchase) => sum + purchase.quantity * (purchase.unitPrice || 0), 0) / poolUnits : null;
  return <ModalShell title="Allocate shared materials" subtitle={`${materialName} · ${formatNumber(available)} units unallocated`} onClose={onClose}><form className="form-body" onSubmit={(event) => { event.preventDefault(); const count = Math.floor(Number(quantity)); const project = eligible.find((entry) => entry.id === projectId); if (!project || count <= 0 || count > available) return; onSave({ id: newId(), materialId, materialName, projectId, quantity: count, date: today(), unitPriceAtAllocation, zeroPriceConfirmed: unitPriceAtAllocation === 0 }); }}>
    <div className="field"><label className="field-label">Project</label><select value={projectId} onChange={(event) => setProjectId(event.target.value)}>{eligible.map((project) => <option key={project.id} value={project.id}>{projectDisplayName(project)}</option>)}</select></div><div className="field"><label className="field-label">Quantity to reserve</label><input type="number" min="1" max={available} step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div><div className="helper-note"><ShieldCheck size={15} /> Allocated units are reserved to this project and cannot be allocated elsewhere. {unitPriceAtAllocation == null ? 'Shared actual costs include unpriced batches, so this allocation has no attributed average cost.' : `Known shared weighted cost basis: ${formatSilver(unitPriceAtAllocation)} per unit.`}</div><div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={available <= 0 || eligible.length === 0}>Allocate materials</button></div>
  </form></ModalShell>;
}

function OwnedMaterialInput({ value, label, onSave }: { value: number; label: string; onSave: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const amount = Number(draft);
    if (draft.trim() === '' || !Number.isSafeInteger(amount) || amount < 0) { setDraft(String(value)); return; }
    onSave(amount);
  };
  return <input className="owned-quantity-input" aria-label={label} type="number" min="0" step="1" value={draft}
    onChange={(event) => setDraft(event.target.value)} onBlur={commit}
    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commit(); event.currentTarget.blur(); } }} />;
}

function MyMaterialsTable({ state, project, rows, onSave, onAdd, onReserve }: { state: AppState; project: Project; rows: MaterialSummary[]; onSave: (material: Material, value: number) => void; onAdd: () => void; onReserve: (material: Material) => void }) {
  return <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">PROJECT INVENTORY</span><h3>My Materials</h3><p>Shared stock is assigned by project priority and included here. Editing Owned now adjusts this project's stock without adding a purchase record.</p></div><button className="button button-outline" onClick={onAdd}><PackagePlus size={15} /> Add Materials</button></div>
    <div className="table-wrap"><table className="data-table compact-inventory-table"><thead><tr><th>Material</th><th>Total required</th><th>Owned now</th><th>Reserved / acquired</th><th>Consumed</th><th>Still needed</th><th>Available supply</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="material-label"><ItemIcon id={row.id} size={30} /><span><strong>{row.name}</strong><small>{!row.required ? 'Not in selected recipe' : ''}</small></span></div></td><td>{formatNumber(row.required)}</td><td><OwnedMaterialInput value={row.available} label={`Owned quantity of ${row.name}`} onSave={(value) => onSave(row, value)} /></td><td>{formatNumber(row.acquired)}</td><td>{formatNumber(row.consumed)}</td><td><strong className={row.missing ? 'qty-missing' : 'qty-available'}>{formatNumber(row.missing)}</strong></td><td>{formatNumber(row.available)}</td><td>{sharedUnallocated(state, row.id, catalog) > 0 && <button className="button button-outline button-sm" onClick={() => onReserve(row)}>Reserve shared</button>}</td></tr>)}{!rows.length && <tr><td colSpan={8}><div className="table-empty">Choose a recipe to see its materials.</div></td></tr>}</tbody></table></div>
  </section>;
}

function QuickInventoryModal({ state, project, onClose, onSave }: { state: AppState; project?: Project; onClose: () => void; onSave: (material: Material, quantity: number, shared: boolean) => void }) {
  const materials = useMemo(() => {
    const rows = new Map<string, Material>();
    for (const item of catalog) for (const recipe of item.recipes) for (const material of recipe.materials) rows.set(material.id, { ...material, name: displayMaterialName(material.id, material.name) });
    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  const [materialId, setMaterialId] = useState('');
  const [materialQuery, setMaterialQuery] = useState('');
  const [materialSearchOpen, setMaterialSearchOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [shared, setShared] = useState(!project);
  const material = materials.find((row) => row.id === materialId);
  const materialMatches = materials.filter((row) => `${row.name} ${row.id}`.toLowerCase().includes(materialQuery.trim().toLowerCase())).slice(0, 60);
  const projectRow = project ? projectMaterials(state, project, catalog).find((row) => row.id === materialId) : undefined;
  const saved = shared ? (state.inventoryBalances || []).find((row) => row.projectId == null && row.materialId === materialId)?.quantity || 0 : projectRow?.available || 0;
  return <ModalShell title={project ? 'Add material to inventory' : 'Add to shared inventory'} subtitle="Add an item and quantity to inventory. Fire Dragon Scales are listed separately by tier." onClose={onClose}><form className="form-body" onSubmit={(event) => { event.preventDefault(); const amount = Number(quantity); if (!material || !Number.isSafeInteger(amount) || amount < 0) return; onSave(material, amount, shared); }}>
    <div className="field"><label className="field-label">Search materials</label><div className="picker-wrap inventory-material-picker"><div className="picker-input"><Search size={16} /><input type="search" role="combobox" aria-expanded={materialSearchOpen} aria-controls="inventory-material-results" aria-label="Search inventory materials" autoComplete="off" value={materialQuery} placeholder="Type a material name or item ID…" onChange={(event) => { setMaterialQuery(event.target.value); setMaterialId(''); setQuantity(''); setMaterialSearchOpen(true); }} onFocus={() => setMaterialSearchOpen(true)} onBlur={() => setTimeout(() => setMaterialSearchOpen(false), 130)} /><ChevronDown size={15} /></div>{materialSearchOpen && <div className="picker-results" id="inventory-material-results">{materialMatches.length ? materialMatches.map((entry) => <button type="button" className="picker-option" key={entry.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setMaterialId(entry.id); setMaterialQuery(entry.name); setQuantity(''); setMaterialSearchOpen(false); }}><ItemIcon id={entry.id} size={34} /><span className="picker-option-title"><strong>{entry.name}</strong><small>{entry.id}</small></span></button>) : <div className="picker-empty">No matching materials found.</div>}</div>}</div>{material && <div className="selected-item"><ItemIcon id={material.id} /><span><strong>{material.name}</strong><small>{material.id}</small></span></div>}</div>
    <div className="field"><label className="field-label">{shared ? 'Quantity to add' : 'Current quantity owned'} {material ? `(manual stock now: ${formatNumber(saved)})` : ''}</label><input type="number" min="0" step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /><small className="field-help">{shared ? 'Adds unpriced items to the shared inventory pool.' : 'Sets this project’s current stock without creating a purchase record.'}</small></div>
    {project && <label className="toggle-row inventory-scope"><span><strong>Shared inventory</strong><small>Shared stock is assigned to projects automatically by priority.</small></span><span className="switch"><input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} /><span /></span></label>}
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!material || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 0}>Save quantity</button></div>
  </form></ModalShell>;
}

function JournalPlanner({ project, item, sessions, onUpdate }: { project: Project; item?: CatalogItem; sessions: CraftSession[]; onUpdate: (patch: Partial<Project>) => void }) {
  const full = journalPlan(project, item, project.target);
  const owned = project.journalsOwned || 0;
  const filled = project.journalsFilled ?? sessions.reduce((sum, entry) => sum + (entry.journalsFilled || 0), 0);
  const partial = project.journalsInProgress ?? sessions.reduce((sum, entry) => sum + (entry.journalsPartial || 0), 0);
  return <section className="panel section-panel journal-planner"><div className="section-heading"><div><span className="eyebrow">CRAFTING JOURNALS</span><h3>Journal filling plan</h3><p>Fame per craft is estimated automatically from the selected catalog recipe.</p></div><ClipboardList size={20} /></div>
    <div className="journal-grid"><div className="field"><label className="field-label">Journal type</label><select value={project.journalType || item?.journalType || ''} onChange={(event) => onUpdate({ journalType: event.target.value })}><option value="">Select / verify journal type</option>{['Fletcher', 'Blacksmith', 'Imbuer', 'Tinker', 'Other'].map((type) => <option key={type}>{type}</option>)}</select></div>
      <div className="journal-estimate"><span>Estimated base fame per item</span><strong>{full ? formatNumber(full.famePerItem) : 'Unavailable'}</strong></div>
      <div className="journal-estimate"><span>Journal tier</span><strong>{item?.tier ? `T${item.tier}${item.recipes.find((recipe) => recipe.id === project.recipeId)?.id.match(/@(\d+)/)?.[1] ? ` · enchantment ${item.recipes.find((recipe) => recipe.id === project.recipeId)?.id.match(/@(\d+)/)?.[1]}` : ''}` : 'Unknown'}</strong></div>
      <div className="journal-estimate"><span>Estimated journals · full project</span><strong>{full ? formatNumber(full.journals) : 'Fame data needed'}</strong></div>
      <div className="journal-estimate"><span>Expected fully filled</span><strong>{full ? formatNumber(full.fullyFillable) : 'Fame data needed'}</strong></div>
      <div className="journal-estimate"><span>Still acquire</span><strong>{full ? formatNumber(Math.max(0, full.journals - owned - partial - filled)) : '—'}</strong></div>
      <div className="field"><label className="field-label">Empty journals owned</label><input type="number" min="0" step="1" value={owned} onChange={(event) => onUpdate({ journalsOwned: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} /></div>
      <div className="field"><label className="field-label">Filled journals recorded</label><input type="number" min="0" step="1" value={filled} onChange={(event) => onUpdate({ journalsFilled: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} /></div>
      <div className="field"><label className="field-label">In progress / partial</label><input type="number" min="0" step="1" value={partial} onChange={(event) => onUpdate({ journalsInProgress: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} /></div>
      <div className="field"><label className="field-label">Journals bought · cumulative</label><input type="number" min="0" step="1" value={project.journalsBought || 0} onChange={(event) => { const count = Math.max(0, Math.floor(Number(event.target.value) || 0)); const delta = count - (project.journalsBought || 0); onUpdate({ journalsBought: count, journalsOwned: Math.max(0, owned + delta) }); }} /></div>
      <div className="field"><label className="field-label">Journals sold · cumulative</label><input type="number" min="0" step="1" value={project.journalsSold || 0} onChange={(event) => { const count = Math.max(0, Math.floor(Number(event.target.value) || 0)); const delta = count - (project.journalsSold || 0); onUpdate({ journalsSold: count, journalsOwned: Math.max(0, owned - delta) }); }} /></div>
    </div><small className="field-help">ESTIMATE: fame uses the selected recipe, item tier, enchantment, non-artifact material count, and the fame multiplier from game data. Journal tracking does not affect material readiness or project completion.</small>
  </section>;
}

function MetricCard({ label, value, sub, icon, tone = '' }: { label: string; value: string; sub: string; icon: React.ReactNode; tone?: string }) {
  return <article className={`metric-card ${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong>{value}</strong><small>{sub}</small></article>;
}

function ProjectCard({ project, state, onOpen }: { project: Project; state: AppState; onOpen: (id: string) => void }) {
  const { item } = recipeFor(project, catalog);
  const readiness = materialReadiness(state, project, catalog);
  const summary = projectMaterials(state, project, catalog);
  const missingKinds = summary.filter((material) => material.missing > 0).length;
  return <button className="project-card" onClick={() => onOpen(project.id)}>
    <div className="project-card-head"><div className="project-product"><ItemIcon id={projectProductIcon(project)} size={46} /><span><strong>{projectDisplayName(project, item)}</strong><small>{formatTier(item?.tier, project.recipeId)}</small></span></div><span className={`priority-chip priority-${project.priority.toLowerCase()}`}>{project.priority}</span></div>
    <div className="card-progress-meta"><span>Materials ready</span><strong>{readiness == null ? 'Unavailable' : `${readiness}%`}</strong></div>{readiness != null && <Progress value={readiness} />}
    <div className="project-card-foot"><span>{formatNumber(project.target)} target items · {isProjectCompleted(project) ? 'Completed' : 'Active'}</span><span className="muted-small">{missingKinds} material{missingKinds === 1 ? '' : 's'} missing</span></div>
  </button>;
}

function TaskRow({ task, projectName, onToggle, onEdit, onDelete }: { task: Task; projectName: string; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const overdue = !task.completed && !!task.dueDate && task.dueDate < today();
  return <div className={`task-row ${task.completed ? 'task-complete' : ''}`}><button className={`task-check ${task.completed ? 'checked' : ''}`} aria-label={task.completed ? 'Mark task incomplete' : 'Mark task complete'} onClick={onToggle}>{task.completed && <Check size={13} />}</button><div className="task-content"><strong>{task.title}</strong><p>{task.description || task.notes || projectName}</p><div className="task-meta"><span>{projectName}</span>{task.dueDate && <span className={overdue ? 'overdue' : ''}><CalendarDays size={12} /> {overdue ? 'Overdue · ' : ''}{new Date(`${task.dueDate}T00:00:00`).toLocaleDateString()}</span>}<span className={`priority-text priority-${task.priority.toLowerCase()}`}>{task.priority}</span></div></div><div className="task-actions"><button className="icon-button small" aria-label="Edit task" onClick={onEdit}><Settings2 size={14} /></button><button className="icon-button small danger" aria-label="Delete task" onClick={onDelete}><Trash2 size={14} /></button></div></div>;
}

function MaterialTable({ state, project, rows, onPurchase, onOrder, onPrices, onResolvePrice }: { state: AppState; project: Project; rows: MaterialSummary[]; onPurchase: (material: Material) => void; onOrder: (material: Material) => void; onPrices: (material: Material) => void; onResolvePrice: (materialId: string, materialName: string) => void }) {
  const recipe = recipeFor(project, catalog).recipe;
  return <div className="table-wrap"><table className="data-table material-table"><thead><tr><th>Material</th><th>Raw recipe / item</th><th>Project total</th><th>Acquired / reserved</th><th>Consumed</th><th>Available</th><th>Still needed</th><th>On orders</th><th>Avg. paid</th><th>Estimate / remaining</th><th /></tr></thead><tbody>{rows.map((row) => { const progress = row.required ? Math.min(100, row.acquired / row.required * 100) : 0; const price = state.prices[priceKey(row.id, state.settings.priceCity, state.settings.marketQuality)]; const manual = state.manualPrices[manualPriceKey(project.id, row.id)]; const priceSide = row.estimatePriceSide === 'sell' ? 'sell' : 'buy'; const freshness = getPriceFreshness(price, state.settings.freshMinutes, Date.now(), priceSide); const staleAuto = row.estimateSource === 'AUTO' && freshness.endsWith('Stale'); const estimateBadge = hasUsableManualBuy(manual) ? 'MANUAL' : freshness; const unpricedCount = materialUnpricedCount(state, row.id); return <tr key={row.id}><td><div className="material-label"><ItemIcon id={row.id} size={34} /><span><strong>{row.name}</strong></span></div></td><td>{formatNumber((recipe?.materials.filter((material) => material.id === row.id).reduce((sum, material) => sum + material.count, 0) || 0) / (recipe?.outputCount || 1))}</td><td>{formatNumber(row.required)}</td><td><strong>{formatNumber(row.acquired)}</strong><div className="mini-progress"><Progress value={progress} /></div></td><td>{formatNumber(row.consumed)}</td><td><span className={row.available > 0 ? 'qty-available' : ''}>{formatNumber(row.available)}</span></td><td><strong className={row.missing > 0 ? 'qty-missing' : 'qty-available'}>{formatNumber(row.missing)}</strong></td><td><span>{formatNumber(row.orderRemaining)} unfilled</span><small className="cell-sub">{formatNumber(row.orderAcquired)} acquired via orders</small><small className="cell-sub">{formatNumber(row.awaitingReceipt)} to collect</small><small className="cell-sub">{formatNumber(row.notCovered)} not covered</small></td><td>{row.weightedAverage == null ? '—' : formatSilver(row.weightedAverage)}{unpricedCount > 0 && <button className="price-warning-link" onClick={() => onResolvePrice(row.id, row.name)}>⚠ {unpricedCount} zero / unknown price record{unpricedCount === 1 ? '' : 's'} · set default</button>}</td><td><div className="price-cell"><strong>{row.nextPurchaseEstimate == null ? 'Unavailable' : <>{formatSilver(row.nextPurchaseEstimate)}{staleAuto && <AlertCircle size={13} className="auto-price-stale-icon" aria-label="Automatic price is stale" />}</>}</strong><StatusBadge value={estimateBadge} /><small className="cell-sub">Remaining · {formatSilver(row.remainingEstimatedCost)}</small><small className="cell-sub">{hasUsableManualBuy(manual) ? `Manual · ${updatedLabel(manual!.updatedAt)}` : `Auto · ${updatedLabel(price?.buyAt)}`}</small></div></td><td><div className="table-actions"><button className="icon-button small" title="Compare prices / edit estimate" onClick={() => onPrices(row)}><TrendingUp size={15} /></button><button className="icon-button small" title="Record acquired batch" onClick={() => onPurchase(row)}><PackagePlus size={15} /></button><button className="icon-button small" aria-label={`Create buy order for ${row.name}`} title="Create Buy Order" onClick={() => onOrder(row)}><ShoppingCart size={15} /></button></div></td></tr>; })}{!rows.length && <tr><td colSpan={11}><div className="table-empty">This recipe has no resource requirements in the current catalog.</div></td></tr>}</tbody></table></div>;
}

function OrderRow({ state, order, onEdit, onReceive, onCancel, onArchive, onReverse, onRepeat }: { state: AppState; order: BuyOrder; onEdit: () => void; onReceive: () => void; onCancel: () => void; onArchive: () => void; onReverse?: () => void; onRepeat?: () => void }) {
  const status = getOrderStatus(order);
  const remaining = Math.max(0, order.quantity - order.received);
  const unfulfilled = Math.max(0, order.quantity - order.fulfilled);
  const receivedPending = Math.max(0, order.fulfilled - order.received);
  const progress = order.quantity ? order.received / order.quantity * 100 : 0;
  const canConfirm = !order.archived && (order.cancelled ? receivedPending > 0 : order.mode === 'Active' || order.received > 0 || receivedPending > 0);
  return <div className={`order-row ${status === 'Partially Fulfilled' ? 'order-partial' : ''}`}><div className="order-main"><ItemIcon id={order.materialId} size={40} /><div className="order-title"><strong>{displayMaterialName(order.materialId, order.materialName)}</strong><div className="order-meta"><span className="order-city-chip"><MapPin size={13} />{order.city}</span><span>{formatSilver(order.unitPrice)} / unit</span>{(order.setupFees || 0) > 0 && <span>{formatSilver(order.setupFees || 0)} setup fee</span>}{order.unitPrice === 0 && !order.zeroPriceConfirmed && <span className="price-warning">Zero price needs review</span>}<span>Placed {order.placedAt || 'date unknown'}</span></div></div><div className="order-progress-block"><div className="order-progress-label"><strong>{formatNumber(order.received)} <span>of {formatNumber(order.quantity)} bought</span></strong><span>{Math.round(progress)}%</span></div><Progress value={progress} tone="gold" /><small>{formatNumber(remaining)} left to buy{receivedPending > 0 ? ` · ${formatNumber(receivedPending)} filled in-game, awaiting pickup` : unfulfilled > 0 ? ` · ${formatNumber(unfulfilled)} not yet filled` : ''}</small></div><div className="order-status"><StatusBadge value={status.toUpperCase()} /></div><div className="order-actions"><div className="order-action-main"><button className="button button-outline button-sm" onClick={onEdit}>Edit</button>{canConfirm && remaining > 0 && <button className="button button-primary button-sm" onClick={onReceive}>Add bought quantity</button>}{onRepeat && order.received >= order.quantity && <button className="button button-primary button-sm" onClick={onRepeat}>Repeat order</button>}</div><div className="order-action-secondary">{onReverse && order.received > 0 && <button className="button button-quiet button-sm" onClick={onReverse}>Undo last</button>}{!order.cancelled && !order.archived && remaining > 0 && <button className="button button-quiet button-sm" onClick={onCancel}>Cancel order</button>}{!order.archived && (order.cancelled || status === 'Fulfilled') && <button className="button button-quiet button-sm" onClick={onArchive}><Archive size={13} /> Archive</button>}</div></div></div>{order.notes && <p className="order-notes">{order.notes}</p>}</div>;
}

function OrderCheckModal({ state, order, projectName, onClose, onEdit, onReceive, onCancel, onArchive, onReverse, onRepeat }: { state: AppState; order: BuyOrder; projectName: string; onClose: () => void; onEdit: () => void; onReceive: () => void; onCancel: () => void; onArchive: () => void; onReverse: () => void; onRepeat: () => void }) {
  return <ModalShell title="Daily buy-order check" subtitle={`${order.city} · ${displayMaterialName(order.materialId, order.materialName)} · ${projectName}`} onClose={onClose} wide>
    <div className="order-check-modal-body"><p>Check this order in Albion Online, then update its status here. Enter the current number of units still left on the order. The planner calculates the quantity bought since your previous check.</p>
      <OrderRow state={state} order={order} onEdit={onEdit} onReceive={onReceive} onCancel={onCancel} onArchive={onArchive} onReverse={onReverse} onRepeat={onRepeat} />
    </div>
  </ModalShell>;
}

function ShortageOverviewRow({ row }: { row: MaterialShortageSummary }) {
  const coverage = row.orderCoveragePct;
  const acquisition = row.acquisitionProgressPct;
  return <details className="shortage-row">
    <summary className="shortage-row-grid">
      <span className="shortage-material"><ItemIcon id={row.id} size={34} /><span><strong>{displayMaterialName(row.id, row.name)}</strong><small>{row.projects.length} project{row.projects.length === 1 ? '' : 's'} · click for details</small></span></span>
      <span>{formatNumber(row.required)}</span><span>{formatNumber(row.available)}</span><strong className={row.stillNeeded ? 'qty-missing' : 'qty-available'}>{formatNumber(row.stillNeeded)}</strong>
      <span>{formatNumber(row.onOrder)}</span><strong className={row.notCovered ? 'qty-missing' : 'qty-available'}>{formatNumber(row.notCovered)}</strong>
      <span className="shortage-progress"><strong>{coverage == null ? 'Complete' : `${formatNumber(coverage)}%`}</strong>{coverage != null && <Progress value={coverage} tone="gold" />}</span>
      <span className="shortage-progress"><strong>{acquisition == null ? 'Complete' : `${formatNumber(acquisition)}%`}</strong>{acquisition != null && <Progress value={acquisition} /> }<small>{formatNumber(row.acquiredTowardRequirement)} acquired</small></span>
    </summary>
    <div className="shortage-row-details">
      <section><h4>Projects requiring {displayMaterialName(row.id, row.name)}</h4><div className="shortage-detail-head"><span>Project</span><span>Required</span><span>Available</span><span>Still needed</span></div>
        {row.projects.map((entry) => <div className="shortage-detail-line" key={entry.project.id}><span>{projectDisplayName(entry.project)}</span><span>{formatNumber(entry.required)}</span><span>{formatNumber(entry.available)}</span><strong>{formatNumber(entry.stillNeeded)}</strong></div>)}
      </section>
      <section><h4>Related buy orders</h4>{row.orders.length ? <><div className="shortage-order-head"><span>City / price</span><span>Status</span><span>Requested</span><span>Acquired</span><span>Awaiting pickup</span><span>Remaining on order</span></div>{row.orders.map((order) => <div className="shortage-order-line" key={order.id}><span><span className="order-city-chip"><MapPin size={12} />{order.city}</span><small>{formatSilver(order.unitPrice)} / unit</small></span><StatusBadge value={getOrderStatus(order).toUpperCase()} /><span>{formatNumber(order.quantity)}</span><span>{formatNumber(order.acquired)}</span><span>{formatNumber(order.awaitingReceipt)}</span><strong>{formatNumber(order.remaining)}</strong></div>)}</> : <p className="muted-copy">No buy orders for this material.</p>}</section>
    </div>
  </details>;
}

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [screen, setScreen] = useState<Screen>('Dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [projectStatusFilter, setProjectStatusFilter] = useState('All status');
  const [projectPriorityFilter, setProjectPriorityFilter] = useState('All priorities');
  const [projectCategoryFilter, setProjectCategoryFilter] = useState('All categories');
  const [projectDeadlineFilter, setProjectDeadlineFilter] = useState('All deadlines');
  const [taskFilter, setTaskFilter] = useState<'Open' | 'All' | 'Done'>('Open');
  const [shortageFilter, setShortageFilter] = useState('All materials');
  const [shortageSort, setShortageSort] = useState('Largest shortage');
  const selectedProject = state.projects.find((project) => project.id === selectedProjectId);
  const projectMap = useMemo(() => new Map(state.projects.map((project) => [project.id, project])), [state.projects]);
  const activeProjects = state.projects.filter((project) => !isProjectCompleted(project));
  const allRows = useMemo(() => state.projects.flatMap((project) => projectMaterials(state, project, catalog).map((material) => ({ project, material }))), [state]);
  const userTasks = state.tasks.filter((task) => !task.completed && !isLegacyGeneratedTask(task));
  const suggestedTaskCount = activeProjects.reduce((count, project) => {
    const rows = projectMaterials(state, project, catalog);
    return count + Number(rows.some((row) => row.missing > 0)) + Number(rows.some((row) => row.awaitingReceipt > 0 || row.orderRemaining > 0)) + Number(materialReadiness(state, project, catalog) === 100);
  }, 0);
  const uncompletedTasks = userTasks;
  const openTaskCount = userTasks.length + suggestedTaskCount;
  const overdueTasks = uncompletedTasks.filter((task) => task.dueDate && task.dueDate < today());
  const knownReadiness = activeProjects.map((project) => materialReadiness(state, project, catalog)).filter((value): value is number => value != null);
  const completionPercent = knownReadiness.length ? knownReadiness.reduce((sum, value) => sum + value, 0) / knownReadiness.length : 0;
  const missingMaterialUnits = allRows.reduce((sum, entry) => sum + entry.material.missing, 0);
  const activeOrderCount = state.orders.filter((order) => ['Active', 'Planned', 'Partially Fulfilled'].includes(getOrderStatus(order))).length;
  const awaitingReceipts = state.orders.reduce((sum, order) => sum + Math.max(0, order.fulfilled - order.received), 0);
  const plannedSpend = state.orders.filter((order) => !order.cancelled && !order.archived).reduce((sum, order) => sum + Math.max(0, order.quantity - order.received) * order.unitPrice, 0);
  const actualSpend = state.purchases.reduce((sum, purchase) => sum + (purchase.unitPrice == null ? 0 : purchase.quantity * purchase.unitPrice * (purchase.reversesPurchaseId ? -1 : 1)), 0);
    const totalOrderSetupFees = state.orders.reduce((sum, order) => sum + Math.max(0, order.setupFees || 0), 0);
    const spendIncludingFees = actualSpend + totalOrderSetupFees;
  const unpricedPurchaseBatches = state.purchases.filter((purchase) => purchase.unitPrice == null && !purchase.reversesPurchaseId).length;

  useEffect(() => { try { saveState(state); } catch { setToast('Could not save local data. Export a backup before closing this tab.'); } }, [state]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refreshPrices = useCallback(async (ids?: string[]) => {
    const itemIds = ids || [...new Set(state.projects.flatMap((project) => [
      ...projectMaterials(state, project, catalog).map((material) => material.id),
      project.itemId,
    ]))];
    if (!itemIds.length) { setToast('Add a crafting project before refreshing material prices.'); return; }
    setRefreshing(true);
    try {
      const { updates, failures } = await fetchMarketPrices(state.settings.server, itemIds, state.settings.cities, state.settings.marketQuality);
      setState((previous) => {
        const prices = { ...previous.prices };
        for (const [key, value] of Object.entries(updates)) prices[key] = mergePriceSnapshot(prices[key], value);
        return { ...previous, prices };
      });
      if (failures.length && Object.keys(updates).length) {
        setToast(`Updated ${Object.keys(updates).length} market rows; ${failures.length} request batch${failures.length === 1 ? '' : 'es'} failed. ${failures[0]}`);
      } else if (failures.length) {
        setToast(`Price refresh failed: ${failures[0]}. Previously saved prices were kept.`);
      } else {
        setToast(Object.keys(updates).length ? `Refreshed ${Object.keys(updates).length} city market rows. Missing values remain unavailable or stale.` : 'No prices were reported. Any previously saved snapshots were kept.');
      }
    } catch (error) {
      console.error(error);
      const reason = error instanceof Error ? error.message : String(error);
      setToast(`Market prices could not be refreshed: ${reason}. Previously saved prices are still available.`);
    } finally { setRefreshing(false); }
  }, [state.projects, state.settings.cities, state.settings.marketQuality, state.settings.server]);

  useEffect(() => {
    if (!state.settings.autoRefresh || !state.projects.length) return;
    const delay = Math.max(5, state.settings.autoRefreshMinutes) * 60_000;
    const initial = window.setTimeout(() => void refreshPrices(), 2000);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshPrices(); }, delay);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [state.settings.autoRefresh, state.settings.autoRefreshMinutes, state.projects.length, refreshPrices]);

  const showProject = (id: string) => { setSelectedProjectId(id); setScreen('Projects'); };
  const saveProject = (project: Project) => {
    const exists = state.projects.some((entry) => entry.id === project.id);
    setState((previous) => ({ ...previous, projects: exists ? previous.projects.map((entry) => entry.id === project.id ? project : entry) : [...previous.projects, project] }));
    setSelectedProjectId(project.id);
    setScreen('Projects');
    setModal(null);
    setToast(exists ? 'Project updated.' : 'Project created. Suggested actions will follow its material status.');
  };

  const deleteProject = (project: Project) => {
    if (!window.confirm(`Delete ${projectDisplayName(project)}? Its tasks, orders, sessions, and manual prices will be removed. Purchase records stay in history, and stock allocated to this project remains reserved to prevent double allocation.`)) return;
    setState((previous) => ({
      ...previous,
      projects: previous.projects.filter((entry) => entry.id !== project.id),
      orders: previous.orders.filter((order) => order.projectId !== project.id),
      sessions: previous.sessions.filter((session) => session.projectId !== project.id),
      tasks: previous.tasks.filter((task) => task.projectId !== project.id),
      manualPrices: Object.fromEntries(Object.entries(previous.manualPrices).filter(([key]) => !key.startsWith(`${project.id}::`))),
    }));
    setSelectedProjectId(null);
    setToast('Project deleted. Purchase history and stock reservations remain separate so used material is not counted twice.');
  };

  const resolveMaterialPriceDefaults = (materialId: string, materialName: string) => {
    const zeroCount = state.purchases.filter((purchase) => purchase.materialId === materialId && purchase.unitPrice === 0 && !purchase.zeroPriceConfirmed).length
      + state.orders.filter((order) => order.materialId === materialId && order.unitPrice === 0 && !order.zeroPriceConfirmed).length
      + state.allocations.filter((allocation) => allocation.materialId === materialId && allocation.unitPriceAtAllocation === 0 && !allocation.zeroPriceConfirmed).length;
    if (zeroCount > 0 && window.confirm(`${materialName} has ${zeroCount} records priced at zero. Is zero intentional? Choose OK to keep zero for those records, or Cancel to set a default price.`)) {
      setState((previous) => ({
        ...previous,
        purchases: previous.purchases.map((purchase) => purchase.materialId === materialId && purchase.unitPrice === 0 ? { ...purchase, zeroPriceConfirmed: true } : purchase),
        orders: previous.orders.map((order) => order.materialId === materialId && order.unitPrice === 0 ? { ...order, zeroPriceConfirmed: true } : order),
        allocations: previous.allocations.map((allocation) => allocation.materialId === materialId && allocation.unitPriceAtAllocation === 0 ? { ...allocation, zeroPriceConfirmed: true } : allocation),
      }));
      setToast(`Zero price confirmed for ${materialName}.`);
      return;
    }
    const suggested = materialDefaultPrice(state, materialId);
    const input = window.prompt(`Set a default unit price for ${materialName}. This will update its existing zero or unknown purchase and order prices.`, suggested == null ? '' : String(suggested));
    if (input == null) return;
    const price = Number(input);
    if (!Number.isFinite(price) || price <= 0) { window.alert('Enter a default price greater than zero.'); return; }
    setState((previous) => fillUnpricedMaterialRecords(previous, materialId, price));
    setToast(`Default price ${formatSilver(price)} applied to ${materialName} records that had zero or unknown prices.`);
  };

  const savePurchase = (purchase: Purchase) => {
    const reviewed = reviewMaterialPrice(state, purchase.materialId, purchase.unitPrice, displayMaterialName(purchase.materialId, purchase.materialName));
    if (!reviewed) return;
    const savedPurchase = { ...purchase, unitPrice: reviewed.price, zeroPriceConfirmed: reviewed.price === 0 };
    setState((previous) => {
      const prepared = reviewed.applyToUnpriced ? fillUnpricedMaterialRecords(previous, purchase.materialId, reviewed.price!) : previous;
      return { ...prepared, purchases: [...prepared.purchases, savedPurchase] };
    });
    setModal(null);
    setToast(purchase.source === 'market-listing' ? 'Market listing purchase recorded and added to inventory.' : 'Acquired batch recorded in purchase history.');
  };
  const saveAllocation = (allocation: MaterialAllocation) => {
    setState((previous) => ({ ...previous, allocations: [...previous.allocations, allocation] }));
    setModal(null);
    setToast('Shared materials reserved for this project.');
  };
  const saveOrder = (order: BuyOrder) => {
    const reviewed = order.unitPrice === 0 && order.zeroPriceConfirmed
      ? { price: 0, applyToUnpriced: false }
      : reviewMaterialPrice(state, order.materialId, order.unitPrice, displayMaterialName(order.materialId, order.materialName));
    if (!reviewed) return;
    const price = reviewed.price ?? order.unitPrice;
    const previousOrder = state.orders.find((entry) => entry.id === order.id);
    const feeAdded = previousOrder ? (previousOrder.unitPrice !== price ? calculateBuyOrderSetupFee(order.quantity * price) : 0) : calculateBuyOrderSetupFee(order.quantity * price);
    const savedOrder = { ...order, unitPrice: price, zeroPriceConfirmed: reviewed.price === 0, setupFees: (previousOrder?.setupFees || 0) + feeAdded };
    setState((previous) => {
      const prepared = reviewed.applyToUnpriced ? fillUnpricedMaterialRecords(previous, order.materialId, price) : previous;
      return { ...prepared, orders: prepared.orders.some((entry) => entry.id === order.id) ? prepared.orders.map((entry) => entry.id === order.id ? savedOrder : entry) : [...prepared.orders, savedOrder] };
    });
    setModal(null);
    const feeAddedForSave = savedOrder.setupFees! - (previousOrder?.setupFees || 0);
    setToast(`Buy order saved${feeAddedForSave > 0 ? `; ${formatSilver(feeAddedForSave)} setup fee charged` : ''}. Fulfilled units are not counted as acquired until receipt is confirmed.`);
  };
  const confirmReceipt = (order: BuyOrder, quantity: number, unitPrice: number, date: string, notes: string, confirmationId: string) => {
    const priceReview = unitPrice === 0 && order.zeroPriceConfirmed
      ? { price: 0, applyToUnpriced: false }
      : reviewMaterialPrice(state, order.materialId, unitPrice, displayMaterialName(order.materialId, order.materialName));
    if (!priceReview) {
      setModal(null);
      setToast('Order check was not saved. Reopen it when you are ready to review the price.');
      return;
    }
    const nextUnitPrice = priceReview.price ?? unitPrice;
    const priceChanged = nextUnitPrice !== order.unitPrice;
    const setupFeeAdded = priceChanged ? calculateBuyOrderSetupFee(order.quantity * nextUnitPrice) : 0;
    const updatedOrder = { ...order, unitPrice: nextUnitPrice, zeroPriceConfirmed: nextUnitPrice === 0, setupFees: (order.setupFees || 0) + setupFeeAdded };
    const prepare = (previous: AppState) => {
      const defaultsApplied = priceReview.applyToUnpriced ? fillUnpricedMaterialRecords(previous, order.materialId, nextUnitPrice) : previous;
      return { ...defaultsApplied, orders: defaultsApplied.orders.map((entry) => entry.id === order.id ? updatedOrder : entry) };
    };
    if (quantity === 0) {
      setState((previous) => prepare(previous));
      setModal(null);
      setToast(priceChanged ? `Order price updated. ${formatSilver(setupFeeAdded)} setup fee recorded.` : 'Order check saved.');
      return;
    }
    if (!recordOrderReceipt(prepare(state), order.id, quantity, null, date, notes, confirmationId)) {
      setModal(null);
      setToast('This confirmation is no longer available. Reopen the order to see its current remaining quantity.');
      return;
    }
    setState((previous) => { const prepared = prepare(previous); return recordOrderReceipt(prepared, order.id, quantity, null, date, notes, confirmationId) || previous; });
    setModal(null);
    setToast(`Acquired quantity added once at ${formatSilver(nextUnitPrice)} per unit${setupFeeAdded ? `; ${formatSilver(setupFeeAdded)} price-change setup fee recorded` : ''}.`);
  };
  const completeProject = (project: Project) => {
    if (!recipeFor(project, catalog).recipe) { setToast('This project recipe cannot be calculated.'); return; }
    if (isProjectCompleted(project) || !window.confirm('Have you finished crafting the full project target?')) return;
    setState((previous) => markProjectCrafted(previous, project.id, catalog) || previous);
    setToast('Project marked as crafted. Its history and material use are saved.');
  };
  const reopenProject = (project: Project) => {
    if (!window.confirm(`Reopen ${projectDisplayName(project)}? Its previous completion and material history will be kept.`)) return;
    setState((previous) => ({ ...previous, projects: previous.projects.map((entry) => entry.id === project.id ? { ...entry, completed: false, completedAt: null } : entry) }));
    setToast('Project reopened. Previous completion history is preserved.');
  };
  const saveTask = (task: Task) => {
    setState((previous) => ({ ...previous, tasks: previous.tasks.some((entry) => entry.id === task.id) ? previous.tasks.map((entry) => entry.id === task.id ? task : entry) : [...previous.tasks, task] }));
    setModal(null);
    setToast('Task saved.');
  };
  const toggleTask = (taskId: string) => setState((previous) => ({ ...previous, tasks: previous.tasks.map((task) => task.id === taskId ? { ...task, completed: !task.completed } : task) }));
  const deleteTask = (taskId: string) => setState((previous) => ({ ...previous, tasks: previous.tasks.filter((task) => task.id !== taskId) }));
  const saveManualPrice = (projectId: string, materialId: string, value: ManualPrice | null) => {
    const key = manualPriceKey(projectId, materialId);
    setState((previous) => { const manualPrices = { ...previous.manualPrices }; if (value) manualPrices[key] = value; else delete manualPrices[key]; return { ...previous, manualPrices }; });
    setToast(value ? 'Manual estimate saved and will be used for future cost estimates.' : 'Automatic estimate selected when available.');
  };
  const cancelOrder = (orderId: string) => {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order || !window.confirm(`Cancel the remaining ${formatNumber(Math.max(0, order.quantity - order.fulfilled))} unfilled ${order.materialName} order? Already acquired materials and purchase history will stay in inventory.`)) return;
    setState((previous) => ({ ...previous, orders: previous.orders.map((entry) => entry.id === orderId ? { ...entry, cancelled: true } : entry) }));
  };
  const archiveOrder = (orderId: string) => setState((previous) => ({ ...previous, orders: previous.orders.map((order) => order.id === orderId ? { ...order, archived: true } : order) }));
  const reverseLatestOrderReceipt = (order: BuyOrder) => {
    const purchase = [...state.purchases].reverse().find((entry) => entry.orderId === order.id && !entry.reversesPurchaseId
      && state.purchases.filter((reversal) => reversal.reversesPurchaseId === entry.id).reduce((sum, reversal) => sum + reversal.quantity, 0) < entry.quantity);
    if (!purchase) { setToast('There is no unreversed acquisition to correct.'); return; }
    const reversed = state.purchases.filter((entry) => entry.reversesPurchaseId === purchase.id).reduce((sum, entry) => sum + entry.quantity, 0);
    const quantity = purchase.quantity - reversed;
    if (!window.confirm(`Reverse the remaining ${formatNumber(quantity)} ${order.materialName} acquired in ${purchase.city} at ${formatSilver(purchase.unitPrice)} each? This adds an auditable reversal row and removes the quantity from project stock.`)) return;
    setState((previous) => reverseOrderPurchase(previous, purchase.id, today()) || previous);
    setToast('Acquisition reversed in stock and purchase history.');
  };
  const saveInventoryQuantity = (project: Project | undefined, material: Material, quantity: number, shared = false) => {
    setState((previous) => {
      if (!shared && project) return setProjectMaterialBalance(previous, project, material, quantity, catalog);
      const balances = (previous.inventoryBalances || []).filter((entry) => !(entry.projectId == null && entry.materialId === material.id));
      const existing = (previous.inventoryBalances || []).find((entry) => entry.projectId == null && entry.materialId === material.id)?.quantity || 0;
      balances.push({ id: `shared:${material.id}`, projectId: null, materialId: material.id, materialName: material.name, quantity: existing + quantity, updatedAt: new Date().toISOString() });
      return { ...previous, inventoryBalances: balances };
    });
    setToast(shared || !project ? 'Items added to shared inventory and assigned by project priority.' : 'Owned quantity saved; project totals and readiness updated.');
  };

  const openTaskModal = (task?: Task, projectId?: string) => setModal({ kind: 'task', taskId: task?.id, projectId });
  const nav = (destination: Screen) => { setScreen(destination); setSelectedProjectId(null); };
  const heading = selectedProject && screen === 'Projects' ? 'Project details' : screen;
  const subtitle = selectedProject && screen === 'Projects' ? `${projectDisplayName(selectedProject)} · project materials, orders, costs, and completion history` : screen === 'Dashboard' ? 'A clear view of what to craft, collect, and buy next.' : screen === 'Projects' ? 'Set a target, track material readiness, and confirm completion when you finish crafting.' : screen === 'Materials' ? 'Track project stock, shared inventory, buy orders, and actual purchase costs.' : screen === 'Buy Orders' ? 'Track every city order and confirm acquired materials across all projects.' : screen === 'Tasks' ? 'Keep the next useful action visible across every active project.' : 'Tune price sources, crafting assumptions, and local backups.';

  const renderDashboard = () => {
    const readyProjects = activeProjects.filter((project) => materialReadiness(state, project, catalog) === 100);
    const sortedTasks = [...uncompletedTasks].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    const dailyOrderChecks = state.orders.filter((order) => !order.archived
      && (!order.cancelled || order.fulfilled > order.received)
      && (order.received < order.quantity || order.fulfilled > order.received))
      .sort((a, b) => a.city.localeCompare(b.city) || a.placedAt.localeCompare(b.placedAt));
    const focusProject = readyProjects[0] || [...activeProjects].sort((a, b) => priorityValue(b.priority) - priorityValue(a.priority) || (a.deadline || '9999').localeCompare(b.deadline || '9999'))[0];
    const profitEstimates = state.projects.flatMap((project) => {
      if (project.sellingPrice == null) return [];
      const cost = projectMaterialCost(state, project, catalog);
      if (cost == null) return [];
      const gross = project.sellingPrice * project.target;
      const net = state.settings.sellingTaxPercent == null ? gross : gross * (1 - state.settings.sellingTaxPercent / 100);
      return [{ gross, net, cost, profit: net - cost }];
    });
    const projectedProfit = profitEstimates.reduce((sum, entry) => sum + entry.profit, 0);
    const projectedRevenue = profitEstimates.reduce((sum, entry) => sum + entry.net, 0);
    const projectedCost = profitEstimates.reduce((sum, entry) => sum + entry.cost, 0);
    const recent = [
      ...state.purchases.map((purchase) => ({ id: purchase.id, date: purchase.date, kind: 'purchase', title: purchase.reversesPurchaseId ? `Reversed ${formatNumber(purchase.quantity)} ${purchase.materialName}` : `Acquired ${formatNumber(purchase.quantity)} ${purchase.materialName}`, detail: purchase.projectId && projectMap.get(purchase.projectId) ? projectDisplayName(projectMap.get(purchase.projectId)!) : purchase.projectId ? 'Project purchase' : 'Shared inventory', icon: <PackagePlus size={14} /> })),
      ...state.projects.flatMap((project) => (project.completionHistory || []).map((completion, index) => ({ id: `${project.id}-completion-${index}`, date: completion.completedAt.slice(0, 10), kind: 'completion', title: `Marked crafted · ${formatNumber(completion.target)} target items`, detail: projectDisplayName(project), icon: <BadgeCheck size={14} /> }))),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    const uniqueMaterialsNeeded = new Map(allRows.filter(({ project, material }) => !isProjectCompleted(project) && (material.missing > 0 || material.required > material.consumed)).map(({ project, material }) => [`${project.id}::${material.id}`, { project, material }]));
    const marketAttention = [...uniqueMaterialsNeeded.values()].map(({ project, material }) => {
      const price = state.prices[priceKey(material.id, state.settings.priceCity, state.settings.marketQuality)];
      const priceSide = material.estimatePriceSide === 'sell' ? 'sell' : 'buy';
      const freshness = getPriceFreshness(price, state.settings.freshMinutes, Date.now(), priceSide);
      const manual = state.manualPrices[manualPriceKey(project.id, material.id)];
      return { project, material, price, freshness, priceSide, manual };
    }).filter((entry) => hasUsableManualBuy(entry.manual) || entry.freshness !== 'AUTO — Fresh');
    const orderCityRows = [...new Set(state.orders.filter((order) => ['Active', 'Planned', 'Partially Fulfilled'].includes(getOrderStatus(order))).map((order) => order.city))].map((city) => ({
      city,
      count: state.orders.filter((order) => order.city === city && ['Active', 'Planned', 'Partially Fulfilled'].includes(getOrderStatus(order))).length,
      quantity: state.orders.filter((order) => order.city === city && ['Active', 'Planned', 'Partially Fulfilled'].includes(getOrderStatus(order))).reduce((sum, order) => sum + Math.max(0, order.quantity - order.received), 0),
      partial: state.orders.filter((order) => order.city === city && getOrderStatus(order) === 'Partially Fulfilled').length,
    }));
    return <>
      <div className="dashboard-intro"><div><span className="eyebrow"><Sparkles size={13} /> CRAFTING OVERVIEW</span><h2>Your next project, at a glance.</h2><p>See which goals are ready, what materials are missing, and what needs your attention today.</p></div><button className="button button-primary" onClick={() => setModal({ kind: 'project' })}><Plus size={16} /> New project</button></div>
      <div className="metric-grid"><MetricCard label="Active projects" value={formatNumber(activeProjects.length)} sub={`${state.projects.length - activeProjects.length} completed`} icon={<ClipboardList size={17} />} /><MetricCard label="Average materials ready" value={knownReadiness.length ? `${Math.round(completionPercent)}%` : 'Unavailable'} sub={`${formatNumber(missingMaterialUnits)} material units still needed`} icon={<TrendingUp size={17} />} tone="gold" /><MetricCard label="Projects ready" value={formatNumber(readyProjects.length)} sub="all required materials available" icon={<Boxes size={17} />} /><MetricCard label="Open actions" value={formatNumber(openTaskCount)} sub={`${overdueTasks.length} overdue · ${state.projects.filter(isProjectCompleted).length} completed`} icon={<ListTodo size={17} />} tone="gold" /></div>
      <section className="panel section-panel dashboard-profit"><div className="section-heading"><div><span className="eyebrow">PROJECTED PROFIT</span><h3>Expected results for priced projects</h3><p>Based on each project’s selling price and estimated material costs. Completed projects are not treated as sold.</p></div><strong className="profit-value">{profitEstimates.length ? formatSilver(projectedProfit) : 'Unavailable'}</strong></div>{profitEstimates.length ? <div className="profit-breakdown"><span>Included projects <strong>{formatNumber(profitEstimates.length)}</strong></span><span>Projected net revenue <strong>{formatSilver(projectedRevenue)}</strong></span><span>Estimated material cost <strong>{formatSilver(projectedCost)}</strong></span><span>Selling tax <strong>{state.settings.sellingTaxPercent == null ? 'Not configured; excluded' : `${formatNumber(state.settings.sellingTaxPercent)}% applied`}</strong></span></div> : <small className="field-help">Add a selling price and ensure each material has an actual average or price estimate to include a project.</small>}</section>
      <div className="dashboard-grid">
        <section className="panel focus-panel"><div className="panel-heading"><div><span className="eyebrow">RECOMMENDED NEXT</span><h3>{focusProject ? projectDisplayName(focusProject) : 'Create your first project'}</h3></div>{focusProject && <button className="text-button" onClick={() => showProject(focusProject.id)}>Open project <ArrowUpRight size={14} /></button>}</div>
          {focusProject ? <><div className="focus-project-row"><ItemIcon id={projectProductIcon(focusProject)} size={62} /><div><strong>{projectProductName(focusProject, CATALOG_BY_ID.get(focusProject.itemId))}</strong><span>{formatNumber(focusProject.target)} target items · {focusProject.priority} priority</span></div><div className="focus-progress"><strong>{materialReadiness(state, focusProject, catalog) ?? '—'}{materialReadiness(state, focusProject, catalog) == null ? '' : '%'}</strong>{materialReadiness(state, focusProject, catalog) != null && <Progress value={materialReadiness(state, focusProject, catalog)!} />}</div></div><div className="focus-checklist">{readyProjects.includes(focusProject) ? <><span className="ready-icon"><BadgeCheck size={16} /></span><span className="ready-copy">All required materials are available</span></> : <><span className="missing-icon"><AlertCircle size={16} /></span><span className="missing-copy">{projectMaterials(state, focusProject, catalog).filter((m) => m.missing > 0).length} materials still need attention</span></>}</div></> : <div className="empty-state compact"><div className="empty-icon"><Hammer size={22} /></div><strong>No crafting projects yet</strong><p>Choose any craftable item from the game catalog and set a long-term goal.</p><button className="button button-primary" onClick={() => setModal({ kind: 'project' })}>Plan a project</button></div>}
        </section>
        <section className="panel task-panel"><div className="panel-heading"><div><span className="eyebrow">WHAT’S NEXT</span><h3>Outstanding tasks</h3></div><button className="text-button" onClick={() => nav('Tasks')}>View all <ArrowUpRight size={14} /></button></div>{sortedTasks.slice(0, 4).map((task) => <TaskRow key={task.id} task={task} projectName={projectMap.get(task.projectId) ? projectDisplayName(projectMap.get(task.projectId)!) : 'Project'} onToggle={() => toggleTask(task.id)} onEdit={() => openTaskModal(task)} onDelete={() => deleteTask(task.id)} />)}{dailyOrderChecks.length > 0 && <div className="daily-order-checks"><div className="daily-order-heading"><strong>Daily buy-order checks</strong><span>Check each order in game</span></div>{dailyOrderChecks.map((order) => <div className="task-row daily-order-task" key={order.id}><div className="task-content"><strong>Check {displayMaterialName(order.materialId, order.materialName)}</strong><p><span className="order-city-chip"><MapPin size={12} />{order.city}</span><span>{projectMap.get(order.projectId) ? projectDisplayName(projectMap.get(order.projectId)!) : 'Project removed'}</span><span>{formatNumber(order.received)} / {formatNumber(order.quantity)} acquired</span></p></div><button className="button button-quiet button-sm" onClick={() => setModal({ kind: 'orderCheck', orderId: order.id })}>Check order</button></div>)}</div>}{!sortedTasks.length && !dailyOrderChecks.length && <p className="muted-copy">Nothing outstanding. You’re all caught up.</p>}</section>
      </div>
      <div className="dashboard-grid secondary-grid">
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">YOUR PROJECTS</span><h3>Active crafting goals</h3></div><button className="text-button" onClick={() => nav('Projects')}>All projects <ArrowUpRight size={14} /></button></div><div className="project-card-list">{activeProjects.slice(0, 3).map((project) => <ProjectCard key={project.id} project={project} state={state} onOpen={showProject} />)}{!activeProjects.length && state.projects.length > 0 && <p className="muted-copy">All projects are complete. Start another crafting goal when you’re ready.</p>}</div></section>
        <section className="panel market-watch"><div className="panel-heading"><div><span className="eyebrow">PRICE & ORDER CHECK</span><h3>Market data to review</h3></div><button className="icon-button" title="Refresh saved material prices" onClick={() => void refreshPrices()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /></button></div><div className="market-watch-list">{marketAttention.slice(0, 4).map(({ project, material, price, freshness, priceSide, manual }, index) => <button className="market-watch-row" key={`${project.id}-${material.id}-${index}`} onClick={() => setModal({ kind: 'prices', projectId: project.id, material })}><ItemIcon id={material.id} size={33} /><span><strong>{material.name}</strong><small>{projectDisplayName(project)} · {state.settings.priceCity}</small></span><span className="market-watch-value">{hasUsableManualBuy(manual) ? formatSilver(manual!.buy!) : (priceSide === 'sell' ? price?.sell : price?.buy) == null || (priceSide === 'sell' ? price!.sell : price!.buy)! <= 0 ? 'Unavailable' : <>{formatSilver((priceSide === 'sell' ? price!.sell : price!.buy)!)}{!hasUsableManualBuy(manual) && freshness.endsWith('Stale') && <AlertCircle size={13} className="auto-price-stale-icon" aria-label="Automatic price is stale" />}</>}<StatusBadge value={hasUsableManualBuy(manual) ? 'MANUAL' : freshness} /><small>Updated {hasUsableManualBuy(manual) ? updatedLabel(manual!.updatedAt) : updatedLabel(priceSide === 'sell' ? price?.sellAt : price?.buyAt)}</small>{manual?.buy === 0 && !manual.zeroBuyConfirmed && <small className="price-warning">Zero estimate needs review</small>}</span></button>)}{!marketAttention.length && <p className="muted-copy">No market prices need review yet. Refresh when you want a new snapshot.</p>}</div><div className="dashboard-order-summary"><div><strong>Buy orders</strong><span>{activeOrderCount} open · {awaitingReceipts} to collect · {formatSilver(plannedSpend)} planned</span></div><div className="order-city-list">{orderCityRows.slice(0, 4).map((row) => <span key={row.city}>{row.city}<b>{row.count} open · {formatNumber(row.quantity)} units · {row.partial} partial</b></span>)}{!orderCityRows.length && <span>No open city orders yet.</span>}</div><small>Known actual spend · {formatSilver(spendIncludingFees)}</small></div><p className="market-note">Snapshots from Albion Online Data Project · not guaranteed current or available.</p></section>
      </div>
      <section className="panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h3>Purchases & project completions</h3></div><button className="text-button" onClick={() => nav('Materials')}>Open materials <ArrowUpRight size={14} /></button></div><div className="activity-list">{recent.map((activity) => <div className="activity-row" key={activity.id}><span className="activity-icon">{activity.icon}</span><span><strong>{activity.title}</strong><small>{activity.detail}</small></span><time>{activity.date ? new Date(`${activity.date}T00:00:00`).toLocaleDateString() : '—'}</time></div>)}{!recent.length && <p className="muted-copy">Purchase and project completion history appears here.</p>}</div></section>
    </>;
  };

  const renderProjects = () => {
    if (selectedProject) {
      const { item, recipe } = recipeFor(selectedProject, catalog);
      const materials = projectMaterials(state, selectedProject, catalog);
      const historicalSessions = state.sessions.filter((session) => session.projectId === selectedProject.id);
      const effectiveProjectReturnRate = projectReturnRate(state, selectedProject) * 100;
      const percent = materialReadiness(state, selectedProject, catalog);
      const orders = state.orders.filter((order) => order.projectId === selectedProject.id).sort((a, b) => b.placedAt.localeCompare(a.placedAt));
      const tasks = state.tasks.filter((task) => task.projectId === selectedProject.id && !isLegacyGeneratedTask(task)).sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
      const productMarketMaterial: Material = { id: selectedProject.itemId, name: projectProductName(selectedProject, item), count: 0, returnable: false };
      const projectUnpricedBatches = state.purchases.filter((purchase) => purchase.projectId === selectedProject.id && (purchase.unitPrice == null || purchase.unitPrice === 0 && !purchase.zeroPriceConfirmed) && !purchase.reversesPurchaseId).length
        + state.allocations.filter((allocation) => allocation.projectId === selectedProject.id && (allocation.unitPriceAtAllocation == null || allocation.unitPriceAtAllocation === 0 && !allocation.zeroPriceConfirmed)).length;
      const projectKnownSpend = state.purchases.filter((purchase) => (purchase.projectId === selectedProject.id || purchase.orderId && state.orders.some((order) => order.id === purchase.orderId && order.projectId === selectedProject.id)) && purchase.unitPrice != null && (purchase.unitPrice > 0 || purchase.zeroPriceConfirmed)).reduce((sum, purchase) => sum + purchase.quantity * (purchase.unitPrice || 0) * (purchase.reversesPurchaseId ? -1 : 1), 0)
        + state.allocations.filter((allocation) => allocation.projectId === selectedProject.id && allocation.unitPriceAtAllocation != null && (allocation.unitPriceAtAllocation > 0 || allocation.zeroPriceConfirmed)).reduce((sum, allocation) => sum + allocation.quantity * (allocation.unitPriceAtAllocation || 0), 0)
        + state.orders.filter((order) => order.projectId === selectedProject.id).reduce((sum, order) => sum + (order.setupFees || 0), 0);
      const materialsToBuy = materials.filter((material) => material.missing > 0);
      const estimatedSpendToAcquire = materialsToBuy.every((material) => material.remainingEstimatedCost != null) ? materialsToBuy.reduce((sum, material) => sum + (material.remainingEstimatedCost || 0), 0) : null;
      const estimatedProjectOutlay = estimatedSpendToAcquire == null ? null : projectKnownSpend + estimatedSpendToAcquire;
      const estimatedMaterialCost = projectMaterialCost(state, selectedProject, catalog);
      const sellingTax = state.settings.sellingTaxPercent;
      const grossRevenue = selectedProject.sellingPrice == null ? null : selectedProject.sellingPrice * selectedProject.target;
      const netRevenue = grossRevenue == null ? null : sellingTax == null ? grossRevenue : grossRevenue * (1 - sellingTax / 100);
      const estimatedProfit = netRevenue == null || estimatedMaterialCost == null ? null : netRevenue - estimatedMaterialCost;
      const openTasks = tasks.filter((task) => !task.completed);
      return <>
        <button className="back-link" onClick={() => setSelectedProjectId(null)}><ArrowLeft size={15} /> All projects</button>
        <div className="detail-hero panel"><div className="detail-item"><ItemIcon id={projectProductIcon(selectedProject)} size={76} /><div><div className="detail-title-row"><h2>{projectDisplayName(selectedProject, item)}</h2><span className={`priority-chip priority-${selectedProject.priority.toLowerCase()}`}>{selectedProject.priority} priority</span></div><p>{projectProductName(selectedProject, item)} · {formatTier(item?.tier, selectedProject.recipeId)}{recipe && /Fire Dragon Scales/i.test(recipe.label) ? ` · ${recipeName(recipe)}` : ''} · {recipe?.outputCount ? `yields ${recipe.outputCount}` : ''}</p><small>Created {new Date(selectedProject.createdAt).toLocaleDateString()}{selectedProject.deadline ? ` · Due ${new Date(`${selectedProject.deadline}T00:00:00`).toLocaleDateString()}` : ''}{isProjectCompleted(selectedProject) && selectedProject.completedAt ? ` · Completed ${new Date(selectedProject.completedAt).toLocaleString()}` : ''}</small></div></div><div className="detail-actions"><button className="button button-outline" onClick={() => setModal({ kind: 'prices', projectId: selectedProject.id, material: productMarketMaterial })}><TrendingUp size={15} /> Item prices</button><button className="button button-outline" onClick={() => setModal({ kind: 'project', projectId: selectedProject.id })}><Settings2 size={15} /> Edit</button>{isProjectCompleted(selectedProject) ? <button className="button button-outline" onClick={() => reopenProject(selectedProject)}>Reopen project</button> : <button className="button button-primary" onClick={() => completeProject(selectedProject)}><BadgeCheck size={15} /> Mark Project as Crafted</button>}<button className="icon-button danger" title="Delete project" onClick={() => deleteProject(selectedProject)}><Trash2 size={16} /></button></div>
          <div className="detail-progress"><div className="detail-progress-heading"><span>Materials ready</span><strong>{percent == null ? 'Unavailable' : `${percent}%`}</strong></div>{percent != null && <Progress value={percent} />}<small>{isProjectCompleted(selectedProject) ? 'Crafting status: completed' : 'Crafting status: not crafted'} · {formatNumber(materials.reduce((sum, material) => sum + material.missing, 0))} material units still missing</small></div></div>
        <div className="detail-stat-grid"><MetricCard label="Target quantity" value={formatNumber(selectedProject.target)} sub="items planned" icon={<Target size={16} />} /><MetricCard label="Materials ready" value={percent == null ? 'Unavailable' : `${percent}%`} sub="allocated inventory and confirmed purchases" icon={<Boxes size={16} />} tone="gold" /><MetricCard label="Materials still missing" value={formatNumber(materials.reduce((sum, material) => sum + material.missing, 0))} sub={`${materials.filter((material) => material.missing > 0).length} different materials`} icon={<Boxes size={16} />} /><MetricCard label="Crafting status" value={isProjectCompleted(selectedProject) ? 'Completed' : 'Not crafted'} sub={selectedProject.completedAt ? new Date(selectedProject.completedAt).toLocaleDateString() : 'Manual confirmation required'} icon={isProjectCompleted(selectedProject) ? <CheckCircle2 size={16} /> : <Clock3 size={16} />} tone="gold" /></div>
        <JournalPlanner project={selectedProject} item={item} sessions={historicalSessions} onUpdate={(patch) => setState((previous) => ({ ...previous, projects: previous.projects.map((entry) => entry.id === selectedProject.id ? { ...entry, ...patch } : entry) }))} />
        <section className="panel section-panel profit-panel"><div className="section-heading"><div><span className="eyebrow">PROJECTED SALE</span><h3>Estimated profit</h3><p>Projection for selling all {formatNumber(selectedProject.target)} items at the price you entered. This is not recorded sales revenue.</p></div><strong className="profit-value">{estimatedProfit == null ? 'Unavailable' : formatSilver(estimatedProfit)}</strong></div><div className="profit-breakdown"><span>Selling price <strong>{selectedProject.sellingPrice == null ? 'Not set' : `${formatSilver(selectedProject.sellingPrice)} / item`}</strong></span><span>Gross revenue <strong>{grossRevenue == null ? 'Unavailable' : formatSilver(grossRevenue)}</strong></span><span>Selling tax <strong>{sellingTax == null ? 'Not configured' : `${formatNumber(sellingTax)}%`}</strong></span><span>Material cost estimate <strong>{estimatedMaterialCost == null ? 'Unavailable' : formatSilver(estimatedMaterialCost)}</strong></span><span>Projected net revenue <strong>{netRevenue == null ? 'Unavailable' : formatSilver(netRevenue)}</strong></span></div>{sellingTax == null && <small className="field-help">Selling tax is excluded because no tax rate is configured in Settings.</small>}</section>
        <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">RECIPE MATERIALS</span><h3>What this project needs</h3><p>Project RRR: {formatNumber(effectiveProjectReturnRate)}% · manual estimate, verify the applicable in-game rate. Known spend: {formatSilver(projectKnownSpend)}. Remaining purchase estimate: {formatSilver(estimatedSpendToAcquire)}. Known spend plus estimate: {formatSilver(estimatedProjectOutlay)}{projectUnpricedBatches ? ` (${projectUnpricedBatches} historical batches have unknown prices and are excluded)` : ""}.</p></div><button className="button button-outline" onClick={() => setModal({ kind: 'purchase', projectId: selectedProject.id })}><PackagePlus size={15} /> Record purchase</button></div><div className="rrr-inline-control"><label>Project RRR<ProjectRrrInput key={selectedProject.id} value={effectiveProjectReturnRate} onSave={(returnRate) => setState((previous) => ({ ...previous, projects: previous.projects.map((entry) => entry.id === selectedProject.id ? { ...entry, returnRate } : entry) }))} /><span>%</span></label><small>Changing this updates project totals and future estimates immediately. Recorded purchases and actual returns stay unchanged.</small></div><div className="rrr-breakdown"><strong>RRR {formatNumber(effectiveProjectReturnRate)}% · ESTIMATED</strong>{materials.map((material) => <span key={material.id}>{material.name}: base {formatNumber(material.baseRequired)} · estimated return {formatNumber(material.estimatedReturns)} · expected net {formatNumber(material.expectedRequired)}{material.actualReturns ? ` · actual returned ${formatNumber(material.actualReturns)}` : ''}</span>)}</div><MaterialTable state={state} project={selectedProject} rows={materials} onPurchase={(material) => setModal({ kind: 'purchase', projectId: selectedProject.id, material })} onOrder={(material) => setModal({ kind: 'order', projectId: selectedProject.id, material })} onPrices={(material) => setModal({ kind: 'prices', projectId: selectedProject.id, material })} onResolvePrice={resolveMaterialPriceDefaults} /><div className="table-legend"><span><strong>Acquired</strong> = project purchases plus shared stock assigned by priority</span><span><strong>Available</strong> = acquired minus base materials consumed plus actual returns</span><span><strong>Still needed</strong> = estimated future recipe demand minus available stock</span></div></section>
        <MyMaterialsTable state={state} project={selectedProject} rows={materials} onAdd={() => setModal({ kind: 'inventory', projectId: selectedProject.id })} onSave={(material, value) => saveInventoryQuantity(selectedProject, material, value)} onReserve={(material) => setModal({ kind: 'allocation', materialId: material.id, materialName: material.name, projectId: selectedProject.id })} />
        <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">CITY BUY ORDERS</span><h3>Order tracking</h3><p>Open quantities remain planned; confirmed receipts go to shared inventory and are assigned by project priority.</p></div><button className="button button-outline" onClick={() => setModal({ kind: 'order', projectId: selectedProject.id })}><ShoppingCart size={15} /> Create Buy Order</button></div><div className="orders-list">{orders.map((order) => <OrderRow key={order.id} state={state} order={order} onEdit={() => setModal({ kind: 'order', projectId: selectedProject.id, material: materials.find((entry) => entry.id === order.materialId), orderId: order.id })} onReceive={() => setModal({ kind: 'receive', orderId: order.id })} onCancel={() => cancelOrder(order.id)} onArchive={() => archiveOrder(order.id)} onReverse={() => reverseLatestOrderReceipt(order)} onRepeat={() => setModal({ kind: 'order', projectId: order.projectId, repeatOrderId: order.id })} />)}{!orders.length && <div className="empty-inline"><ShoppingCart size={18} /><span>No buy orders for this project. Add an order to track a planned purchase by city.</span></div>}</div></section>
        <div className="dashboard-grid detail-bottom-grid"><section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">PROJECT HISTORY</span><h3>Completion records</h3></div></div><div className="activity-list">{[...(selectedProject.completionHistory || [])].slice().reverse().map((completion, index) => <div className="activity-row" key={`${completion.completedAt}-${index}`}><span className="activity-icon gold-icon"><BadgeCheck size={14} /></span><span><strong>Marked crafted · {formatNumber(completion.target)} target items</strong><small>{projectDisplayName(selectedProject)}</small></span><time>{new Date(completion.completedAt).toLocaleString()}</time></div>)}{!(selectedProject.completionHistory || []).length && <p className="muted-copy">No completion has been recorded.</p>}</div></section>
          <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">PROJECT TO-DO</span><h3>{openTasks.length} outstanding tasks</h3></div><button className="text-button" onClick={() => openTaskModal(undefined, selectedProject.id)}><Plus size={14} /> Add task</button></div>{tasks.slice(0, 6).map((task) => <TaskRow key={task.id} task={task} projectName={projectDisplayName(selectedProject)} onToggle={() => toggleTask(task.id)} onEdit={() => openTaskModal(task)} onDelete={() => deleteTask(task.id)} />)}{!tasks.length && <p className="muted-copy">Add a task to make the next action explicit.</p>}</section></div>
        {selectedProject.notes && <section className="panel notes-panel"><span className="eyebrow">PROJECT NOTES</span><p>{selectedProject.notes}</p></section>}
      </>;
    }
    const categories = [...new Set(state.projects.map((project) => CATALOG_BY_ID.get(project.itemId)?.category || 'Other'))].sort();
    const filtered = state.projects.filter((project) => {
      const statusOkay = projectStatusFilter === 'All status' || (projectStatusFilter === 'Active' ? !isProjectCompleted(project) : isProjectCompleted(project));
      const priorityOkay = projectPriorityFilter === 'All priorities' || project.priority === projectPriorityFilter;
      const categoryOkay = projectCategoryFilter === 'All categories' || (CATALOG_BY_ID.get(project.itemId)?.category || 'Other') === projectCategoryFilter;
      const projectDate = project.deadline || '';
      const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const deadlineOkay = projectDeadlineFilter === 'All deadlines'
        || (projectDeadlineFilter === 'Overdue' && !!projectDate && projectDate < today() && !isProjectCompleted(project))
        || (projectDeadlineFilter === 'Next 7 days' && !!projectDate && projectDate >= today() && projectDate <= sevenDays)
        || (projectDeadlineFilter === 'No deadline' && !projectDate);
      return statusOkay && priorityOkay && categoryOkay && deadlineOkay;
    }).sort((a, b) => priorityValue(b.priority) - priorityValue(a.priority) || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
    return <><div className="filter-bar"><label><Filter size={15} /><select value={projectStatusFilter} onChange={(event) => setProjectStatusFilter(event.target.value)}><option>All status</option><option>Active</option><option>Completed</option></select></label><select value={projectPriorityFilter} onChange={(event) => setProjectPriorityFilter(event.target.value)}><option>All priorities</option>{['Urgent', 'High', 'Normal', 'Low'].map((entry) => <option key={entry}>{entry}</option>)}</select><select value={projectCategoryFilter} onChange={(event) => setProjectCategoryFilter(event.target.value)}><option>All categories</option>{categories.map((entry) => <option key={entry}>{entry}</option>)}</select><select value={projectDeadlineFilter} onChange={(event) => setProjectDeadlineFilter(event.target.value)}><option>All deadlines</option><option>Overdue</option><option>Next 7 days</option><option>No deadline</option></select><span className="filter-count">{filtered.length} project{filtered.length === 1 ? '' : 's'}</span></div><div className="project-grid">{filtered.map((project) => <ProjectCard key={project.id} project={project} state={state} onOpen={showProject} />)}{!filtered.length && <div className="empty-state"><div className="empty-icon"><ClipboardList size={24} /></div><strong>{state.projects.length ? 'No projects match these filters' : 'Your project list is ready'}</strong><p>{state.projects.length ? 'Change a filter to see more projects.' : 'Add a project to begin tracking materials and crafting progress.'}</p>{!state.projects.length && <button className="button button-primary" onClick={() => setModal({ kind: 'project' })}><Plus size={15} /> New project</button>}</div>}</div></>;
  };

  const renderMaterials = () => {
    const materials = uniqueMaterials(state, state.projects);
    const shared = materials.map((material) => { const onHand = state.purchases.filter((purchase) => purchase.projectId == null && purchase.materialId === material.id).reduce((sum, purchase) => sum + purchase.quantity * (purchase.reversesPurchaseId ? -1 : 1), 0) + (state.inventoryBalances || []).filter((balance) => balance.projectId == null && balance.materialId === material.id).reduce((sum, balance) => sum + Math.max(0, balance.quantity), 0); const free = sharedUnallocated(state, material.id, catalog); return { material, onHand, allocated: Math.max(0, onHand - free), free }; }).filter((entry) => entry.onHand > 0);
    const purchaseHistory = [...state.purchases].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
    return <>
      <div className="material-intro panel"><div><div className="section-heading"><div><span className="eyebrow">INVENTORY & ACQUISITION</span><h3>Buy gradually. Know what is still missing.</h3><p>Purchases and confirmed buy order receipts are added to shared inventory. Stock is assigned to projects by priority; use Buy from Market on the Buy Orders page to record a listing purchase.</p></div></div></div><div className="material-kpis"><span><strong>{formatNumber(shared.reduce((sum, entry) => sum + entry.onHand, 0))}</strong> shared units</span><span><strong>{formatNumber(state.orders.filter((order) => getOrderStatus(order) === 'Partially Fulfilled').length)}</strong> partial orders</span><span><strong>{formatSilver(spendIncludingFees)}</strong> known priced spend{unpricedPurchaseBatches ? `; ${unpricedPurchaseBatches} batches have unknown prices` : ""}</span><span><strong>{formatSilver(plannedSpend)}</strong> unfilled order value</span></div></div>
      <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">SHARED INVENTORY</span><h3>Shared material stock</h3><p>Order receipts enter shared stock. Projects draw from it automatically in priority order; you can also add items manually or reserve available units.</p></div><button className="button button-outline" onClick={() => setModal({ kind: 'inventory' })}><PackagePlus size={15} /> Add inventory</button></div>{shared.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Material</th><th>Shared stock</th><th>Reserved for projects</th><th>Unallocated</th><th>Action</th></tr></thead><tbody>{shared.map(({ material, onHand, allocated, free }) => <tr key={material.id}><td><div className="material-label"><ItemIcon id={material.id} size={32} /><span><strong>{material.name}</strong></span></div></td><td>{formatNumber(onHand)}</td><td>{formatNumber(allocated)}</td><td><strong>{formatNumber(free)}</strong></td><td><button className="button button-outline button-sm" onClick={() => setModal({ kind: 'allocation', materialId: material.id, materialName: material.name })} disabled={free <= 0 || !state.projects.length}>Allocate</button></td></tr>)}</tbody></table></div> : <div className="empty-inline"><Boxes size={18} /><span>No shared material stock yet. Add items manually, record a shared purchase, or confirm a buy order receipt.</span></div>}</section>
      <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">PROJECT REQUIREMENTS</span><h3>Materials across projects</h3><p>Each row is tied to a project, so acquisitions and consumption never overlap.</p></div><button className="button button-outline" onClick={() => void refreshPrices()} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Refresh prices</button></div><div className="table-wrap"><table className="data-table global-material-table"><thead><tr><th>Project / material</th><th>Required</th><th>Acquired / reserved</th><th>Consumed</th><th>Available</th><th>Missing</th><th>Order / collection</th><th>Remaining cost</th><th>Price source</th><th /></tr></thead><tbody>{allRows.map(({ project, material }, index) => { const price = state.prices[priceKey(material.id, state.settings.priceCity, state.settings.marketQuality)]; const priceSide = material.estimatePriceSide === 'sell' ? 'sell' : 'buy'; const freshness = getPriceFreshness(price, state.settings.freshMinutes, Date.now(), priceSide); const staleAuto = material.estimateSource === 'AUTO' && freshness.endsWith('Stale'); const manual = state.manualPrices[manualPriceKey(project.id, material.id)]; return <tr key={`${project.id}-${material.id}-${index}`}><td><div className="material-label"><ItemIcon id={material.id} size={32} /><span><button className="inline-link" onClick={() => showProject(project.id)}>{projectDisplayName(project)}</button><strong>{material.name}</strong></span></div></td><td>{formatNumber(material.required)}</td><td>{formatNumber(material.acquired)}</td><td>{formatNumber(material.consumed)}</td><td>{formatNumber(material.available)}</td><td><strong className={material.missing ? 'qty-missing' : 'qty-available'}>{formatNumber(material.missing)}</strong></td><td><span>{formatNumber(material.orderRemaining)} unfilled</span><small className="cell-sub">{formatNumber(material.orderAcquired)} acquired via orders</small><small className="cell-sub">{formatNumber(material.awaitingReceipt)} to collect</small><small className="cell-sub">{formatNumber(material.notCovered)} not covered</small></td><td>{material.remainingEstimatedCost == null ? 'Unavailable' : <>{formatSilver(material.remainingEstimatedCost)}{staleAuto && <AlertCircle size={13} className="auto-price-stale-icon" aria-label="Automatic price is stale" />}</>}</td><td><StatusBadge value={hasUsableManualBuy(manual) ? 'MANUAL' : freshness} /></td><td><div className="table-actions"><button className="icon-button small" title="Price comparison" onClick={() => setModal({ kind: 'prices', projectId: project.id, material })}><TrendingUp size={15} /></button><button className="icon-button small" title="Record purchase" onClick={() => setModal({ kind: 'purchase', projectId: project.id, material })}><PackagePlus size={15} /></button><button className="icon-button small" title="Create Buy Order" onClick={() => setModal({ kind: 'order', projectId: project.id, material })}><ShoppingCart size={15} /></button><button className="icon-button small" title="Open project" onClick={() => showProject(project.id)}><ExternalLink size={14} /></button></div></td></tr>; })}{!allRows.length && <tr><td colSpan={10}><div className="table-empty">Create a project to see its complete materials list here.</div></td></tr>}</tbody></table></div></section>
      <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">ACTUAL TRANSACTIONS</span><h3>Purchase history</h3><p>Weighted average prices use only transactions with an actual unit price. Unconfirmed zero prices are excluded until reviewed.</p></div><button className="button button-outline" onClick={() => exportPurchasesCsv(state)}><FileDown size={15} /> Export CSV</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Material</th><th>Assigned to</th><th>City</th><th>Quantity</th><th>Actual unit price</th><th>Total cost</th><th>Source</th></tr></thead><tbody>{purchaseHistory.map((purchase) => { const needsPriceReview = purchase.unitPrice === 0 && !purchase.zeroPriceConfirmed; return <tr key={purchase.id}><td>{purchase.date}</td><td>{displayMaterialName(purchase.materialId, purchase.materialName)}</td><td>{purchase.projectId ? (projectMap.get(purchase.projectId) ? projectDisplayName(projectMap.get(purchase.projectId)!) : 'Project removed') : 'Shared inventory'}</td><td>{purchase.city}</td><td>{purchase.reversesPurchaseId ? '-' : ''}{formatNumber(purchase.quantity)}</td><td>{needsPriceReview ? <span className="price-warning">Zero price needs review</span> : purchase.unitPrice == null ? 'Unknown' : formatSilver(purchase.unitPrice)}</td><td>{needsPriceReview ? 'Excluded until reviewed' : purchase.unitPrice == null ? 'Unknown' : `${purchase.reversesPurchaseId ? '-' : ''}${formatSilver(purchase.unitPrice * purchase.quantity)}`}</td><td>{purchase.reversesPurchaseId ? 'Order acquisition reversal' : purchase.orderId ? 'Confirmed order receipt' : purchase.source === 'market-listing' ? 'Market listing' : 'Direct purchase'}</td></tr>; })}{!purchaseHistory.length && <tr><td colSpan={8}><div className="table-empty">No actual purchases recorded yet.</div></td></tr>}</tbody></table></div></section>
      <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">BUY ORDER OVERVIEW</span><h3>Orders across cities</h3><p>Prices in this section are your own planned orders, separate from market snapshots.</p></div></div><div className="orders-list">{state.orders.slice().sort((a, b) => b.placedAt.localeCompare(a.placedAt)).map((order) => <div key={order.id} className="global-order-wrap"><span className="global-order-project">{(projectMap.get(order.projectId) ? projectDisplayName(projectMap.get(order.projectId)!) : 'Project removed')}</span><OrderRow state={state} order={order} onEdit={() => { const owner = projectMap.get(order.projectId); if (owner) setModal({ kind: 'order', projectId: owner.id, material: projectMaterials(state, owner, catalog).find((entry) => entry.id === order.materialId), orderId: order.id }); }} onReceive={() => setModal({ kind: 'receive', orderId: order.id })} onCancel={() => cancelOrder(order.id)} onArchive={() => archiveOrder(order.id)} onReverse={() => reverseLatestOrderReceipt(order)} onRepeat={() => setModal({ kind: 'order', projectId: order.projectId, repeatOrderId: order.id })} /></div>)}{!state.orders.length && <div className="empty-inline"><ShoppingCart size={18} /><span>No buy orders have been added yet.</span></div>}</div></section>
    </>;
  };

  const renderBuyOrders = () => {
    const sortedOrders = state.orders.filter((order) => !order.archived).sort((a, b) => b.placedAt.localeCompare(a.placedAt));
    const shortages = materialShortageOverview(state, catalog);
    const filteredShortages = shortages.filter((row) => {
      if (shortageFilter === 'Materials with shortages') return row.stillNeeded > 0;
      if (shortageFilter === 'Materials with active buy orders') return row.onOrder > 0;
      if (shortageFilter === 'Materials not yet covered') return row.notCovered > 0;
      if (shortageFilter === 'Fully covered materials') return row.stillNeeded === 0;
      return true;
    }).sort((a, b) => shortageSort === 'Lowest acquisition progress'
      ? (a.acquisitionProgressPct ?? 100) - (b.acquisitionProgressPct ?? 100) || a.name.localeCompare(b.name)
      : shortageSort === 'Material name' ? a.name.localeCompare(b.name)
        : b.stillNeeded - a.stillNeeded || a.name.localeCompare(b.name));
    return <>
      <div className="material-kpis"><span><strong>{formatNumber(state.orders.filter((order) => !order.cancelled && !order.archived && getOrderStatus(order) !== 'Fulfilled').length)}</strong> open orders</span><span><strong>{formatNumber(state.orders.reduce((sum, order) => sum + order.received, 0))}</strong> acquired via orders</span><span><strong>{formatNumber(awaitingReceipts)}</strong> filled in game, to collect</span><span><strong>{formatSilver(plannedSpend)}</strong> estimated remaining value</span></div>
      <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">ALL PROJECTS · ALL CITIES</span><h3>Buy order fulfillment</h3><p>Confirm only quantities you have actually acquired. Confirmed quantities enter shared inventory and are assigned to projects by priority.</p></div></div><div className="orders-list">{sortedOrders.map((order) => <div key={order.id} className="global-order-wrap"><span className="global-order-project">{(projectMap.get(order.projectId) ? projectDisplayName(projectMap.get(order.projectId)!) : 'Project removed')}</span><OrderRow state={state} order={order} onEdit={() => { const owner = projectMap.get(order.projectId); if (owner) setModal({ kind: 'order', projectId: owner.id, material: projectMaterials(state, owner, catalog).find((entry) => entry.id === order.materialId), orderId: order.id }); }} onReceive={() => setModal({ kind: 'receive', orderId: order.id })} onCancel={() => cancelOrder(order.id)} onArchive={() => archiveOrder(order.id)} onReverse={() => reverseLatestOrderReceipt(order)} onRepeat={() => setModal({ kind: 'order', projectId: order.projectId, repeatOrderId: order.id })} /></div>)}{!sortedOrders.length && <div className="empty-inline"><ShoppingCart size={18} /><span>No active buy orders to fulfill. Archived orders are kept in the project history.</span></div>}</div></section>
      <section className="panel section-panel shortage-overview">
        <div className="section-heading"><div><span className="eyebrow">ACTIVE PROJECT REQUIREMENTS</span><h3>Material Shortages</h3><p>Shared stock follows project priority. Confirmed receipts are included in Available and are not added twice.</p></div></div>
        <div className="shortage-toolbar"><label><span className="field-label">Show</span><select value={shortageFilter} onChange={(event) => setShortageFilter(event.target.value)}><option>All materials</option><option>Materials with shortages</option><option>Materials with active buy orders</option><option>Materials not yet covered</option><option>Fully covered materials</option></select></label><label><span className="field-label">Sort by</span><select value={shortageSort} onChange={(event) => setShortageSort(event.target.value)}><option>Largest shortage</option><option>Lowest acquisition progress</option><option>Material name</option></select></label></div>
        <div className="shortage-table">
          <div className="shortage-table-heading"><span>Material</span><span>Required</span><span>Available</span><span>Still needed</span><span>On order</span><span>Not covered</span><span>Order coverage</span><span>Acquisition</span></div>
          {filteredShortages.map((row) => <ShortageOverviewRow key={row.id} row={row} />)}
          {!filteredShortages.length && <div className="shortage-empty">{!shortages.length ? 'No materials are required by active projects.' : shortages.every((row) => row.stillNeeded === 0) ? 'All required materials are covered.' : 'No materials match these filters.'}</div>}
        </div>
      </section>
    </>;
  };

  const renderTasks = () => {
    const customTasks = state.tasks.filter((task) => !isLegacyGeneratedTask(task));
    const suggestions = activeProjects.flatMap((project) => {
      const rows = projectMaterials(state, project, catalog);
      const missing = rows.filter((row) => row.missing > 0);
      const orderAttention = rows.some((row) => row.awaitingReceipt > 0 || row.orderRemaining > 0);
      const entries: Array<{ id: string; project: Project; title: string; kind: 'attention' | 'waiting' | 'ready' }> = [];
      if (missing.length) entries.push({ id: `${project.id}-missing`, project, title: `Get ${missing.length} missing material${missing.length === 1 ? '' : 's'}`, kind: 'attention' });
      if (orderAttention) entries.push({ id: `${project.id}-orders`, project, title: rows.some((row) => row.awaitingReceipt > 0) ? 'Confirm acquired quantities from buy orders' : 'Review unfilled buy orders', kind: 'waiting' });
      if (materialReadiness(state, project, catalog) === 100) entries.push({ id: `${project.id}-finish`, project, title: 'Mark Project as Crafted', kind: 'ready' });
      return entries;
    });
    const selectedCustom = customTasks.filter((task) => taskFilter === 'All' || (taskFilter === 'Open' ? !task.completed : task.completed)).sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    const showSuggestions = taskFilter !== 'Done';
    const sections = [
      { id: 'attention', title: 'Needs attention', rows: showSuggestions ? suggestions.filter((entry) => entry.kind === 'attention') : [] },
      { id: 'waiting', title: 'Waiting', rows: showSuggestions ? suggestions.filter((entry) => entry.kind === 'waiting') : [] },
      { id: 'ready', title: 'Ready to finish', rows: showSuggestions ? suggestions.filter((entry) => entry.kind === 'ready') : [] },
    ];
    return <><div className="task-toolbar panel"><div className="segmented"><button className={taskFilter === 'Open' ? 'selected' : ''} onClick={() => setTaskFilter('Open')}>Open <span>{suggestions.length + customTasks.filter((task) => !task.completed).length}</span></button><button className={taskFilter === 'Done' ? 'selected' : ''} onClick={() => setTaskFilter('Done')}>Completed</button><button className={taskFilter === 'All' ? 'selected' : ''} onClick={() => setTaskFilter('All')}>All</button></div><button className="button button-primary" disabled={!state.projects.length} onClick={() => openTaskModal()}><Plus size={15} /> Add task</button></div>
      {sections.map((section) => section.rows.length > 0 && <section className="panel section-panel task-group" key={section.id}><div className="section-heading"><div><span className="eyebrow">PROJECT ACTIONS</span><h3>{section.title}</h3></div></div>{section.rows.map((entry) => <div className="task-row smart-task" key={entry.id}><div className="task-content"><strong>{entry.title}</strong><div className="task-meta"><span>{projectDisplayName(entry.project)}</span><span className={`priority-text priority-${entry.project.priority.toLowerCase()}`}>{entry.project.priority}</span></div></div><div className="task-actions">{entry.kind === 'ready' ? <button className="button button-primary button-sm" onClick={() => completeProject(entry.project)}><BadgeCheck size={14} /> Mark Project as Crafted</button> : <button className="button button-outline button-sm" onClick={() => showProject(entry.project.id)}>Open project <ArrowUpRight size={14} /></button>}</div></div>)}</section>)}
      {(taskFilter === 'All' || taskFilter === 'Open') && selectedCustom.filter((task) => !task.completed).length > 0 && <section className="panel section-panel task-group"><div className="section-heading"><div><span className="eyebrow">YOUR TASKS</span><h3>Open tasks</h3></div></div>{selectedCustom.filter((task) => !task.completed).map((task) => <TaskRow key={task.id} task={task} projectName={(projectMap.get(task.projectId) ? projectDisplayName(projectMap.get(task.projectId)!) : 'Project')} onToggle={() => toggleTask(task.id)} onEdit={() => openTaskModal(task)} onDelete={() => deleteTask(task.id)} />)}</section>}
      {(taskFilter === 'All' || taskFilter === 'Done') && selectedCustom.filter((task) => task.completed).length > 0 && <section className="panel section-panel task-group"><div className="section-heading"><div><span className="eyebrow">HISTORY</span><h3>Completed tasks</h3></div></div>{selectedCustom.filter((task) => task.completed).map((task) => <TaskRow key={task.id} task={task} projectName={(projectMap.get(task.projectId) ? projectDisplayName(projectMap.get(task.projectId)!) : 'Project')} onToggle={() => toggleTask(task.id)} onEdit={() => openTaskModal(task)} onDelete={() => deleteTask(task.id)} />)}</section>}
      {selectedCustom.length === 0 && (!showSuggestions || suggestions.length === 0) && <div className="empty-state"><div className="empty-icon"><ListTodo size={24} /></div><strong>{taskFilter === 'Done' ? 'No completed tasks yet' : 'Nothing to do right now'}</strong><p>Your project actions update automatically as materials and orders change.</p></div>}</>;
  };

  const renderSettings = () => <SettingsPage state={state} onUpdate={(patch) => setState((previous) => ({ ...previous, settings: { ...previous.settings, ...patch } }))} onRestore={(restored) => { setState(restored); setSelectedProjectId(null); setScreen('Dashboard'); setToast('Backup restored. The saved projects and purchase history are loaded.'); }} onToast={setToast} />;

  const renderScreen = () => screen === 'Dashboard' ? renderDashboard() : screen === 'Projects' ? renderProjects() : screen === 'Materials' ? renderMaterials() : screen === 'Buy Orders' ? renderBuyOrders() : screen === 'Tasks' ? renderTasks() : renderSettings();
  const modalProject = modal?.kind === 'project' && modal.projectId ? projectMap.get(modal.projectId) : undefined;
  const orderForModal = modal?.kind === 'order' && modal.orderId ? state.orders.find((order) => order.id === modal.orderId) : undefined;
  const repeatOrderForModal = modal?.kind === 'order' && modal.repeatOrderId ? state.orders.find((order) => order.id === modal.repeatOrderId) : undefined;
  const ownerForOrder = modal?.kind === 'order' ? modal.projectId ? projectMap.get(modal.projectId) : undefined : orderForModal ? projectMap.get(orderForModal.projectId) : undefined;
  const receiveOrder = modal?.kind === 'receive' ? state.orders.find((order) => order.id === modal.orderId) : undefined;
  const orderCheck = modal?.kind === 'orderCheck' ? state.orders.find((order) => order.id === modal.orderId) : undefined;
  const taskForModal = modal?.kind === 'task' && modal.taskId ? state.tasks.find((task) => task.id === modal.taskId) : undefined;
  const priceProject = modal?.kind === 'prices' ? projectMap.get(modal.projectId) : undefined;
  const inventoryProject = modal?.kind === 'inventory' && modal.projectId ? projectMap.get(modal.projectId) : undefined;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Hammer size={19} /></div><div><strong>Albion</strong><span>FORGE LEDGER</span></div></div><div className="sidebar-label">WORKSPACE</div><nav>{(['Dashboard', 'Projects', 'Materials', 'Buy Orders', 'Tasks', 'Settings'] as Screen[]).map((destination) => <button key={destination} className={`nav-link ${screen === destination ? 'active' : ''}`} onClick={() => nav(destination)}><IconForScreen screen={destination} /><span>{destination}</span>{destination === 'Tasks' && openTaskCount > 0 && <em>{openTaskCount}</em>}</button>)}</nav><div className="sidebar-spacer" /><div className="server-card"><div className="server-dot" /><span><strong>{state.settings.server === 'west' ? 'Americas' : state.settings.server === 'east' ? 'Asia' : 'Europe'} server</strong><small>{state.settings.priceCity} price city</small></span><button className="icon-button small" title="Market settings" onClick={() => nav('Settings')}><Settings2 size={14} /></button></div><div className="sidebar-foot">Local planner · data stays in this browser</div></aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb">Albion Forge Ledger <span>/</span> {heading}</div><div className="topbar-right"><span className="data-status"><span /> Saved locally</span><button className="button button-outline button-sm" onClick={() => setModal({ kind: 'project' })}><Plus size={14} /> New project</button></div></header><div className="page-content"><div className="page-heading"><div><h1>{heading}</h1><p>{subtitle}</p></div>{screen === 'Projects' && !selectedProject && state.projects.length > 0 && <button className="button button-primary" onClick={() => setModal({ kind: 'project' })}><Plus size={15} /> New project</button>}{screen === 'Buy Orders' && <div className="page-heading-actions"><button className="button button-outline" onClick={() => setModal({ kind: 'purchase', marketListing: true })}><Coins size={15} /> Buy from Market</button><button className="button button-primary" disabled={!state.projects.length} onClick={() => setModal({ kind: 'order' })}><ShoppingCart size={15} /> Create Buy Order</button></div>}{screen === 'Tasks' && <button className="button button-primary" disabled={!state.projects.length} onClick={() => openTaskModal()}><Plus size={15} /> Add task</button>}</div>{renderScreen()}</div>
    </main>
    {toast && <div className="toast"><span><CheckCircle2 size={16} /></span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}
    {modal?.kind === 'project' && <ProjectModal key={modal.projectId || 'new-project'} state={state} project={modalProject} onClose={() => setModal(null)} onSave={saveProject} />}
    {modal?.kind === 'purchase' && <PurchaseModal key={`${modal.projectId || 'shared'}-${modal.material?.id || ''}-${modal.marketListing ? 'listing' : 'purchase'}`} state={state} projects={state.projects} projectId={modal.projectId} material={modal.material} marketListing={modal.marketListing} onClose={() => setModal(null)} onSave={savePurchase} />}
    {modal?.kind === 'order' && (ownerForOrder || (!orderForModal && !repeatOrderForModal)) && state.projects.length > 0 && <OrderModal key={orderForModal?.id || modal.repeatOrderId || `${ownerForOrder?.id || 'choose-project'}-${modal.material?.id || ''}`} state={state} projects={state.projects} project={ownerForOrder} material={modal.material} order={orderForModal} repeatFrom={repeatOrderForModal} onClose={() => setModal(null)} onSave={saveOrder} />}
    
    {modal?.kind === 'receive' && receiveOrder && <ReceiveModal key={receiveOrder.id} order={receiveOrder} onClose={() => setModal(null)} onSave={(quantity, unitPrice, date, notes, confirmationId) => confirmReceipt(receiveOrder, quantity, unitPrice, date, notes, confirmationId)} />}
    {modal?.kind === 'orderCheck' && orderCheck && <OrderCheckModal key={orderCheck.id} state={state} order={orderCheck} projectName={projectMap.get(orderCheck.projectId) ? projectDisplayName(projectMap.get(orderCheck.projectId)!) : 'Project removed'} onClose={() => setModal(null)} onEdit={() => { const owner = projectMap.get(orderCheck.projectId); if (owner) setModal({ kind: 'order', projectId: owner.id, material: projectMaterials(state, owner, catalog).find((entry) => entry.id === orderCheck.materialId), orderId: orderCheck.id }); else setToast('This order belongs to a removed project and cannot be edited.'); }} onReceive={() => setModal({ kind: 'receive', orderId: orderCheck.id })} onCancel={() => cancelOrder(orderCheck.id)} onArchive={() => { archiveOrder(orderCheck.id); setModal(null); }} onReverse={() => reverseLatestOrderReceipt(orderCheck)} onRepeat={() => setModal({ kind: 'order', projectId: orderCheck.projectId, repeatOrderId: orderCheck.id })} />}
    {modal?.kind === 'task' && state.projects.length > 0 && <TaskModal key={modal.taskId || `new-${modal.projectId || ''}`} state={state} task={taskForModal} projectId={modal.projectId} onClose={() => setModal(null)} onSave={saveTask} />}
    {modal?.kind === 'prices' && priceProject && <PriceModal key={`${priceProject.id}-${modal.material.id}`} state={state} project={priceProject} material={modal.material} onClose={() => setModal(null)} onRefresh={(ids) => void refreshPrices(ids)} onSaveManual={(value) => saveManualPrice(priceProject.id, modal.material.id, value)} refreshing={refreshing} />}
    {modal?.kind === 'allocation' && <AllocationModal state={state} materialId={modal.materialId} materialName={modal.materialName} preferredProjectId={modal.projectId} onClose={() => setModal(null)} onSave={saveAllocation} />}
    {modal?.kind === 'inventory' && (!modal.projectId || inventoryProject) && <QuickInventoryModal key={inventoryProject?.id || 'shared-inventory'} state={state} project={inventoryProject} onClose={() => setModal(null)} onSave={(material, quantity, shared) => { saveInventoryQuantity(inventoryProject, material, quantity, shared); setModal(null); }} />}
  </div>;
}

function priorityValue(priority: Priority) {
  return priority === 'Urgent' ? 4 : priority === 'High' ? 3 : priority === 'Normal' ? 2 : 1;
}

function SettingsPage({ state, onUpdate, onRestore, onToast }: { state: AppState; onUpdate: (settings: Partial<AppState['settings']>) => void; onRestore: (state: AppState) => void; onToast: (message: string) => void }) {
  const [citiesText, setCitiesText] = useState(state.settings.cities.join(', '));
  useEffect(() => setCitiesText(state.settings.cities.join(', ')), [state.settings.cities]);
  const onImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!validateState(parsed)) throw new Error('This file is not a supported Albion Forge Ledger backup.');
      if (!window.confirm(`Restore “${file.name}” and replace the data currently saved in this browser?`)) return;
      onRestore(parsed);
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not read this backup file.');
    }
  };
  const exportBackup = () => downloadBlob(`albion-crafting-backup-${today()}.json`, JSON.stringify(state, null, 2));
  const updateCities = (value: string) => {
    setCitiesText(value);
    const cities = [...new Set(value.split(',').map((city) => city.trim()).filter(Boolean))];
    if (cities.length) onUpdate({ cities, priceCity: cities.includes(state.settings.priceCity) ? state.settings.priceCity : cities[0] });
  };
  return <div className="settings-layout">
    <section className="panel settings-panel"><div className="section-heading"><div><span className="eyebrow">MARKET SNAPSHOTS</span><h3>Price source & freshness</h3><p>Market data is optional; all planning and manual pricing work offline.</p></div><div className="settings-panel-icon"><TrendingUp size={17} /></div></div><div className="settings-grid">
      <div className="field"><label className="field-label">Game server</label><select value={state.settings.server} onChange={(event) => onUpdate({ server: event.target.value as AppState['settings']['server'] })}><option value="west">Americas (West)</option><option value="east">Asia (East)</option><option value="europe">Europe</option></select></div>
      <div className="field"><label className="field-label">City for default estimates</label><select value={state.settings.priceCity} onChange={(event) => onUpdate({ priceCity: event.target.value })}>{state.settings.cities.map((city) => <option key={city}>{city}</option>)}</select></div>
      <div className="field"><label className="field-label">Market item quality</label><select value={state.settings.marketQuality} onChange={(event) => onUpdate({ marketQuality: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((quality) => <option key={quality} value={quality}>{qualityLabel(quality)} · {quality}</option>)}</select><small className="field-help">Automatic price snapshots are stored separately for each item quality.</small></div>
      <div className="field"><label className="field-label">Freshness threshold</label><div className="input-suffix"><input type="number" min="1" max="1440" value={state.settings.freshMinutes} onChange={(event) => onUpdate({ freshMinutes: Math.min(1440, Math.max(1, Number(event.target.value) || 1)) })} /><span>minutes</span></div><small className="field-help">This label threshold does not guarantee market availability.</small></div>
      <div className="field"><label className="field-label">Extra purchase costs</label><div className="input-suffix"><input type="number" min="0" max="100" step="0.1" value={state.settings.extraCostPercent} onChange={(event) => onUpdate({ extraCostPercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} /><span>%</span></div><small className="field-help">Optional estimate for fees or transport; defaults to 0% and never changes recorded actual costs.</small></div>
      <div className="field"><label className="field-label">Selling tax estimate <span className="optional-label">Optional</span></label><div className="input-suffix"><input type="number" min="0" max="100" step="0.1" placeholder="Not configured" value={state.settings.sellingTaxPercent ?? ''} onChange={(event) => onUpdate({ sellingTaxPercent: event.target.value.trim() === '' ? null : Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} /><span>%</span></div><small className="field-help">Leave blank when you do not know the applicable tax. Projected profit excludes tax until you set a rate.</small></div>
      <div className="field"><label className="field-label">City list <span className="optional-label">Comma-separated</span></label><textarea rows={2} value={citiesText} onChange={(event) => updateCities(event.target.value)} /><small className="field-help">The default list includes the six royal cities, Brecilien, and Black Market.</small></div>
    </div><div className="toggle-row"><div><strong>Automatic refresh</strong><small>Fetch snapshots on startup and while this page is open. Manual refresh is always available.</small></div><label className="switch"><input type="checkbox" checked={state.settings.autoRefresh} onChange={(event) => onUpdate({ autoRefresh: event.target.checked })} /><span /></label></div>{state.settings.autoRefresh && <div className="auto-refresh-row"><span>Refresh interval</span><select value={state.settings.autoRefreshMinutes} onChange={(event) => onUpdate({ autoRefreshMinutes: Math.max(5, Number(event.target.value)) })}>{[5, 15, 30, 60, 120].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></div>}
      <div className="source-callout"><span className="source-badge">AODP</span><p>Prices come from the Albion Online Data Project’s city-specific market endpoint. The feed is community-submitted and can be sparse; empty results remain unavailable, timestamps are shown as returned, and saved snapshots remain visible after failed refreshes.</p></div>
    </section>
        <section className="panel settings-panel"><div className="section-heading"><div><span className="eyebrow">CRAFTING ASSUMPTIONS</span><h3>Default resource return rate</h3><p>Applied to new projects. Set 0% to plan without returns; projects can override it.</p></div><div className="settings-panel-icon gold-settings"><Hammer size={17} /></div></div><div className="toggle-row"><div><strong>Apply default RRR</strong><small>Turn off to use full recipe inputs for projects without their own rate.</small></div><label className="switch"><input type="checkbox" checked={state.settings.applyReturnRate} onChange={(event) => onUpdate({ applyReturnRate: event.target.checked })} /><span /></label></div><div className="return-rate-control"><div className="return-rate-value"><strong>{state.settings.returnRate}%</strong><span>manual expected resource return</span></div><div className="input-suffix"><input aria-label="Default resource return rate" type="number" min="0" max="100" step="0.1" value={state.settings.returnRate} onChange={(event) => onUpdate({ returnRate: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} /><span>%</span></div><small className="field-help">UNVERIFIED until matched to your location, station, focus and applicable bonuses. Albion converts combined production bonus to RRR with 1 − 1/(1 + bonus/100). The app cannot infer these modifiers from recipe data, so enter the effective rate shown in game.</small></div></section>
    <section className="panel settings-panel backup-panel"><div className="section-heading"><div><span className="eyebrow">LOCAL DATA & BACKUPS</span><h3>Protect project progress</h3><p>Projects, tasks, inventory, purchase history, order history, and settings persist in this browser.</p></div><div className="settings-panel-icon"><ShieldCheck size={17} /></div></div><div className="backup-actions"><button className="button button-primary" onClick={exportBackup}><Download size={15} /> Export full backup</button><label className="button button-outline file-button"><Upload size={15} /> Restore from JSON<input type="file" accept="application/json,.json" onChange={onImport} /></label><button className="button button-outline" onClick={() => exportPurchasesCsv(state)}><FileDown size={15} /> Export purchase CSV</button></div><div className="backup-summary"><span><strong>{formatNumber(state.projects.length)}</strong> projects</span><span><strong>{formatNumber(state.purchases.length)}</strong> purchases</span><span><strong>{formatNumber(state.tasks.length)}</strong> tasks</span></div></section>
    <section className="catalog-source"><div className="source-badge game-source">AO</div><div><strong>Recipe catalog · {formatNumber(catalog.length)} craftable items / {formatNumber(catalog.reduce((sum, item) => sum + item.recipes.length, 0))} recipes</strong><p>Catalog generated from the maintained <code>ao-data/ao-bin-dumps</code> game data export and kept separate from your saved projects. Run <code>npm run update:data</code> when you want to refresh item names and crafting requirements. Items without crafting resources are not listed; source data may lag game changes.</p></div></section>
  </div>;
}
