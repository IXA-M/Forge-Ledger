import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowLeft, ArrowUpRight, BadgeCheck, CalendarDays, Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Coins, ExternalLink, Hammer, MapPin, PackageCheck, PackagePlus, Plus, RefreshCw, Search, ShieldCheck, ShoppingCart, Sparkles, Trash2, TrendingUp, Wallet, X } from 'lucide-react';
import { catalog, catalogById, displayMaterialName } from '../../data/catalog';
import { ItemPicker } from '../../components/ItemPicker';
import { CopyableName, ItemIcon, ModalShell, PriceAge, PriceInput, Progress, StatusBadge } from '../../components/SharedUi';
import { qualityLabel, updatedLabel } from '../../utils/formatting';
import {
  calculateBuyOrderSetupFee, CITY_OPTIONS, formatItemName, formatNumber, formatSilver, formatTier, getOrderStatus, getPriceFreshness, itemEnchantmentLevel,
  isProjectCompleted, manualPriceKey, materialShortageOverview, newId, priceKey, projectMaterials, recipeFor, recipeRequirements, sharedUnallocated, today,
  type AppState, type AutoPrice, type BuyOrder, type CatalogItem, type CraftSession, type ManualPrice,
  type Material, type MaterialAllocation, type MaterialSummary, type Priority, type Project, type Purchase, type Recipe, type SaleRecord, type Task,
} from '../../domain';
export function ProjectModal({ state, project, onClose, onSave }: { state: AppState; project?: Project; onClose: () => void; onSave: (project: Project) => void }) {
  const [item, setItem] = useState<CatalogItem | undefined>(project ? catalogById.get(project.itemId) : undefined);
  const [recipeId, setRecipeId] = useState(project?.recipeId || '');
  const [enchantment, setEnchantment] = useState(project?.enchantCraft ? '0' : itemEnchantmentLevel(project?.recipeId || '') || '0');
  const [name, setName] = useState(project?.name || '');
  const [target, setTarget] = useState(String(project?.target ?? 100));
  const [sellingPrice, setSellingPrice] = useState(project?.sellingPrice == null ? '' : String(project.sellingPrice));
  const [returnRate, setReturnRate] = useState(String(project?.enchantCraft ? 15.2 : project?.returnRate ?? (state.settings.applyReturnRate ? state.settings.returnRate : 0)));
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
      deadline, notes: notes.trim(), priority, dailyTarget: project?.dailyTarget || 0, returnRate: project?.enchantCraft ? 15.2 : Math.min(100, Math.max(0, Number(returnRate) || 0)),
      sellingPrice: price, completed: project ? (project.completed ?? project.crafted >= project.target) : false, completedAt: project?.completedAt, completionHistory: project?.completionHistory,
      completionMaterialConsumption: project?.completionMaterialConsumption,
      sales: project?.sales,
      additionalMaterials: project?.additionalMaterials,
      enchantCraft: project?.enchantCraft,
      journalType: project?.journalType || item.journalType || undefined, journalFamePerItem: project?.recipeId === chosenRecipe.id ? project?.journalFamePerItem : null,
      journalsOwned: project?.journalsOwned, journalsFilled: project?.journalsFilled, journalsInProgress: project?.journalsInProgress,
      journalsBought: project?.journalsBought, journalsSold: project?.journalsSold,
    });
  };
  return <ModalShell title={project ? 'Edit crafting project' : 'Plan a crafting project'} subtitle="Start with an item from the game recipe catalog." onClose={onClose} wide>
    <form onSubmit={save} className="form-body">
    <div className="form-grid"><ItemPicker value={item?.id || ''} disabled={existingRecords} onChange={(selected) => { if (existingRecords) return; const oldAutoName = item ? formatItemName(item.name, recipeId || item.id) : ''; const nextLevel = selected ? itemEnchantmentLevel(selected.recipes[0]?.id || '') || '0' : '0'; const nextRecipes = selected?.recipes.filter((recipe) => (itemEnchantmentLevel(recipe.id) || '0') === nextLevel) || []; const nextRecipe = nextRecipes.find((recipe) => !/fire dragon scales/i.test(recipe.label)) || nextRecipes[0]; setItem(selected); setEnchantment(nextLevel); setRecipeId(nextRecipe?.id || ''); if (selected) setName((current) => !current || current === oldAutoName ? formatItemName(selected.name, nextRecipe?.id || selected.id) : current); }} />
        <div className="field"><label className="field-label">Project name</label><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Season 27 gear stock" maxLength={80} /></div>
        <div className="field"><label className="field-label">Enchantment</label>{project?.enchantCraft ? <div className="helper-note">Enchant Craft target .{project.enchantCraft.targetEnchantment} · enchant materials are tracked with this project.</div> : <select value={enchantment} disabled={!item} onChange={(event) => { const nextLevel = event.target.value; const previousName = item && currentRecipe ? formatItemName(item.name, currentRecipe.id) : ''; const nextOptions = item?.recipes.filter((recipe) => (itemEnchantmentLevel(recipe.id) || '0') === nextLevel) || []; const keepScaleVariant = !!currentRecipe && /fire dragon scales/i.test(currentRecipe.label); const sameVariant = nextOptions.find((recipe) => dragonSlayer && /fire dragon scales/i.test(recipe.label) === keepScaleVariant); const nextRecipe = sameVariant || nextOptions.find((recipe) => !/fire dragon scales/i.test(recipe.label)) || nextOptions[0]; setEnchantment(nextLevel); setRecipeId(nextRecipe?.id || ''); if (item && nextRecipe) setName((current) => current === previousName ? formatItemName(item.name, nextRecipe.id) : current); }}>{enchantmentLevels.map((level) => <option key={level} value={level}>{level === '0' ? 'No enchantment (.0)' : `.${level}`}</option>)}</select>}<small className="field-help">{project?.enchantCraft ? "The enchant level is managed by the Enchant Craft setup." : "Choose the item enchantment level."}</small></div>
        {dragonSlayer && <div className="field"><label className="field-label">Recipe option</label><select value={chosenRecipe?.id || ''} onChange={(event) => setRecipeId(event.target.value)} disabled={!item}>{recipesAtEnchantment.map((recipe) => <option key={recipe.id} value={recipe.id}>{/fire dragon scales/i.test(recipe.label) ? 'Fire Dragon Scales' : 'Standard materials'} · yields 1</option>)}</select><small className="field-help">Choose which Dragon Slayer material recipe to use.</small></div>}
        <div className="field"><label className="field-label">Target quantity</label><input type="number" min="1" step="1" required value={target} onChange={(event) => setTarget(event.target.value)} /><small className="field-help">Recipe resource totals update with this target.</small></div>
        <div className="field"><label className="field-label">Selling price per item <span className="optional-label">Optional</span></label><PriceInput value={sellingPrice} onChange={setSellingPrice} placeholder="Enter expected price" /></div>
        <div className="field"><label className="field-label">Project RRR estimate</label>{project?.enchantCraft ? <div className="helper-note">15.2% · fixed for Enchant Craft projects.</div> : <><div className="input-suffix"><input type="number" min="0" max="100" step="0.1" value={returnRate} onChange={(event) => setReturnRate(event.target.value)} /><span>%</span></div><small className="field-help">This project rate is independent of the application default.</small></>}</div>
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

export function RecordSaleModal({ project, onClose, onSave }: { project: Project; onClose: () => void; onSave: (sale: SaleRecord) => void }) {
  const alreadySold = (project.sales || []).reduce((sum, sale) => sum + sale.quantity, 0);
  const remaining = Math.max(0, project.target - alreadySold);
  const [quantity, setQuantity] = useState(String(remaining || ''));
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const units = Number(quantity);
  const proceeds = Number(amount);
  const valid = Number.isInteger(units) && units > 0 && units <= remaining && Number.isFinite(proceeds) && proceeds > 0 && !!date;
  return <ModalShell title="Record completed item sale" subtitle={`${project.name} · ${formatNumber(remaining)} items remain unsold`} onClose={onClose}>
    <form className="form-body" onSubmit={(event) => { event.preventDefault(); if (!valid) return; onSave({ id: newId(), date, quantity: units, amount: proceeds, notes: notes.trim() }); }}>
      <div className="form-grid"><div className="field"><label className="field-label">Units sold</label><input type="number" min="1" max={remaining} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /><small className="field-help">{formatNumber(remaining)} units remain available to record as sold.</small></div><div className="field"><label className="field-label">Total money received</label><PriceInput value={amount} onChange={setAmount} placeholder="Enter actual proceeds" required /></div><div className="field"><label className="field-label">Sale date</label><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></div><div className="field full-field"><label className="field-label">Notes <span className="optional-label">Optional</span></label><input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={240} placeholder="Optional sale details" /></div></div>
      {valid && <div className="helper-note">Average received: {formatSilver(proceeds / units)} per item.</div>}
      <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!valid}>Save sale</button></div>
    </form>
  </ModalShell>;
}

export function ProjectRrrInput({ value, onSave }: { value: number; onSave: (value: number) => void }) {
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

export function recipeName(recipe: Recipe, itemName?: string) {
  const enchant = itemEnchantmentLevel(recipe.id);
  const variant = recipe.id.match(/#(\d+)$/)?.[1];
  const productName = itemName ? formatItemName(itemName, recipe.id) : '';
  if (/Fire Dragon Scales/i.test(recipe.label)) return `${productName ? `${productName} · ` : ''}Fire Dragon Scales${variant ? ` · Recipe ${variant}` : ''}`;
  if (variant) return `${productName ? `${productName} · ` : ''}Recipe ${variant}`;
  if (enchant) return productName || `.${enchant}`;
  return itemName || recipe.label;
}

export function projectProductName(project: Project, item?: CatalogItem) {
  const variant = project.enchantCraft ? `${project.itemId}@${project.enchantCraft.targetEnchantment}` : project.recipeId;
  return formatItemName(item?.name || project.itemId, variant);
}

export function projectDisplayName(project: Project, item?: CatalogItem) {
  const productName = projectProductName(project, item || catalogById.get(project.itemId));
  if (project.enchantCraft) return project.name || `Enchant Craft · ${productName}`;
  const baseName = (item || catalogById.get(project.itemId))?.name;
  if (!project.name || project.name === baseName || project.name === productName || project.name.endsWith(` · ${productName}`)) return productName;
  return `${project.name} · ${productName}`;
}

export function projectProductIcon(project: Project) {
  const enchant = project.enchantCraft ? String(project.enchantCraft.targetEnchantment) : itemEnchantmentLevel(project.recipeId);
  return `${project.itemId}${enchant ? `@${enchant}` : ''}`;
}

export function materialDefaultPrice(state: AppState, materialId: string) {
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

export function materialUnpricedCount(state: AppState, materialId: string) {
  return state.purchases.filter((purchase) => purchase.materialId === materialId && (purchase.unitPrice == null || purchase.unitPrice === 0 && !purchase.zeroPriceConfirmed)).length
    + state.orders.filter((order) => order.materialId === materialId && order.unitPrice === 0 && !order.zeroPriceConfirmed).length
    + state.allocations.filter((allocation) => allocation.materialId === materialId && (allocation.unitPriceAtAllocation == null || allocation.unitPriceAtAllocation === 0 && !allocation.zeroPriceConfirmed)).length;
}

export function hasUsableManualBuy(manual: ManualPrice | undefined) {
  return manual?.buy != null && (manual.buy !== 0 || manual.zeroBuyConfirmed === true);
}

export function reviewMaterialPrice(state: AppState, materialId: string, enteredPrice: number | null, materialName: string) {
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

export function reviewZeroEstimate(value: number | null, label: string, suggestedDefault: number | null) {
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

export function fillUnpricedMaterialRecords(state: AppState, materialId: string, price: number): AppState {
  return {
    ...state,
    purchases: state.purchases.map((purchase) => purchase.materialId === materialId && (purchase.unitPrice == null || purchase.unitPrice === 0 && !purchase.zeroPriceConfirmed) ? { ...purchase, unitPrice: price, zeroPriceConfirmed: false } : purchase),
    orders: state.orders.map((order) => order.materialId === materialId && order.unitPrice === 0 && !order.zeroPriceConfirmed ? { ...order, unitPrice: price, zeroPriceConfirmed: false } : order),
    allocations: state.allocations.map((allocation) => allocation.materialId === materialId && (allocation.unitPriceAtAllocation == null || allocation.unitPriceAtAllocation === 0 && !allocation.zeroPriceConfirmed) ? { ...allocation, unitPriceAtAllocation: price, zeroPriceConfirmed: false } : allocation),
  };
}

export function TaskModal({ state, task, projectId, onClose, onSave }: { state: AppState; task?: Task; projectId?: string; onClose: () => void; onSave: (task: Task) => void }) {
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

export function PurchaseModal({ state, projects, projectId, material, marketListing = false, onClose, onSave }: { state: AppState; projects: Project[]; projectId?: string; material?: Material; marketListing?: boolean; onClose: () => void; onSave: (purchase: Purchase) => void }) {
  const options = useMemo(() => uniqueMaterials(state, projects), [state, projects]);
  const currentProjects = projects.filter((project) => !isProjectCompleted(project));
  const [selectedProject, setSelectedProject] = useState(projectId ?? (marketListing ? '' : 'shared'));
  const [materialId, setMaterialId] = useState(material?.id || (marketListing ? '' : options[0]?.id || ''));
  const [materialQuery, setMaterialQuery] = useState(material?.name || options.find((entry) => entry.id === (material?.id || options[0]?.id))?.name || '');
  const [materialSearchOpen, setMaterialSearchOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [city, setCity] = useState(state.settings.cities[0] || 'Bridgewatch');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const selectedProjectEntry = projects.find((entry) => entry.id === selectedProject);
  const projectMaterialsList = selectedProjectEntry
    ? projectMaterials(state, selectedProjectEntry, catalog).filter((entry) => entry.required > 0)
    : [];
  const marketMaterials = marketListing ? projectMaterialsList : options;
  const selectedMaterial = marketMaterials.find((entry) => entry.id === materialId) || (marketListing ? undefined : material);
  const materialMatches = options.filter((entry) => `${entry.name} ${entry.id}`.toLowerCase().includes(materialQuery.trim().toLowerCase())).slice(0, 60);
  const totalCost = quantity && price ? Number(quantity) * Number(price) : 0;
  const canSubmit = !!selectedMaterial && Number.isInteger(Number(quantity)) && Number(quantity) > 0
    && (!marketListing || (selectedProjectEntry && !isProjectCompleted(selectedProjectEntry) && price !== '' && Number.isFinite(Number(price)) && Number(price) >= 0));
  return <ModalShell title={marketListing ? 'Buy from a market listing' : 'Record an acquired batch'} subtitle={marketListing ? 'Choose a current project and required material, then record the completed market purchase. It is added to inventory immediately.' : 'Actual purchases stay separate from estimates and buy orders.'} onClose={onClose}><form className="form-body" onSubmit={(event) => { event.preventDefault(); const count = Number(quantity); const actual = price === '' ? null : Number(price); if (!selectedMaterial || !Number.isInteger(count) || count <= 0 || (marketListing && (!selectedProjectEntry || isProjectCompleted(selectedProjectEntry) || actual == null)) || (actual != null && (!Number.isFinite(actual) || actual < 0))) return; onSave({ id: newId(), projectId: selectedProject === 'shared' ? null : selectedProject, materialId: selectedMaterial.id, materialName: displayMaterialName(selectedMaterial.id, selectedMaterial.name), city, quantity: count, unitPrice: actual, date, notes: notes.trim(), ...(marketListing ? { source: 'market-listing' as const } : {}) }); }}>
    {marketListing
      ? <>
        <div className="field"><label className="field-label">Project</label><select required value={selectedProject} onChange={(event) => { setSelectedProject(event.target.value); setMaterialId(''); setQuantity(''); setPrice(''); }}><option value="">Select a current project</option>{currentProjects.map((entry) => <option key={entry.id} value={entry.id}>{projectDisplayName(entry)}</option>)}</select>{!currentProjects.length && <small className="field-help">There are no current projects. Complete projects are kept in History.</small>}</div>
        {selectedProjectEntry && <div className="field"><label className="field-label">Material</label><select required value={materialId} onChange={(event) => { setMaterialId(event.target.value); setQuantity(''); setPrice(''); }}><option value="">Select a required material</option>{projectMaterialsList.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>{!projectMaterialsList.length && <small className="field-help">This project has no calculated recipe materials.</small>}</div>}
        {selectedMaterial && <div className="selected-item"><ItemIcon id={selectedMaterial.id} /><span><strong>{selectedMaterial.name}</strong><small>{selectedMaterial.id}</small></span></div>}
      </>
      : <>
        <div className="field"><label className="field-label">Assign materials to</label><select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}><option value="shared">Shared inventory</option>{projects.map((entry) => <option key={entry.id} value={entry.id}>{projectDisplayName(entry)}</option>)}</select></div>
        <div className="field"><label className="field-label">Search item</label><div className="picker-wrap inventory-material-picker"><div className="picker-input"><Search size={16} /><input type="search" role="combobox" aria-expanded={materialSearchOpen} aria-controls="purchase-material-results" aria-label="Search purchase items" autoComplete="off" value={materialQuery} placeholder="Type an item name or ID" onChange={(event) => { setMaterialQuery(event.target.value); setMaterialId(''); setMaterialSearchOpen(true); }} onFocus={() => setMaterialSearchOpen(true)} onBlur={() => setTimeout(() => setMaterialSearchOpen(false), 130)} /><ChevronDown size={15} /></div>{materialSearchOpen && <div className="picker-results" id="purchase-material-results">{materialMatches.length ? materialMatches.map((entry) => <button type="button" className="picker-option" key={entry.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setMaterialId(entry.id); setMaterialQuery(entry.name); setMaterialSearchOpen(false); }}><ItemIcon id={entry.id} size={34} /><span className="picker-option-title"><strong>{entry.name}</strong><small>{entry.id}</small></span></button>) : <div className="picker-empty">No matching items found.</div>}</div>}</div>{selectedMaterial && <div className="selected-item"><ItemIcon id={selectedMaterial.id} /><span><strong>{selectedMaterial.name}</strong><small>{selectedMaterial.id}</small></span></div>}</div>
      </>}
    {(!marketListing || selectedProjectEntry && selectedMaterial) && <>
      <div className="form-grid"><div className="field"><label className="field-label">Quantity {marketListing ? 'bought' : 'acquired'}</label><input type="number" min="1" step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div><div className="field"><label className="field-label">{marketListing ? 'Actual market price per item' : 'Actual unit price'} <span className="optional-label">{marketListing ? 'Required' : 'Optional'}</span></label><PriceInput value={price} onChange={setPrice} placeholder={marketListing ? 'Silver per item' : 'Leave blank if unknown'} required={marketListing} /><small className="field-help">{marketListing ? `Total purchase: ${formatSilver(totalCost)}` : 'For a buy order receipt, use its Record receipt action so fulfillment stays linked.'}</small></div><div className="field"><label className="field-label">City</label><select value={city} onChange={(event) => setCity(event.target.value)}>{state.settings.cities.map((name) => <option key={name}>{name}</option>)}</select></div><div className="field"><label className="field-label">Purchase date</label><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></div></div>
      <div className="field"><label className="field-label">Notes</label><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
      <div className="order-value-preview"><span>Items added to inventory now</span><strong>{quantity ? formatNumber(Number(quantity)) : '—'}</strong><span>Total actual cost</span><strong>{quantity && price ? formatSilver(totalCost) : '—'}</strong><small>Unlike a buy order, this records the purchase as acquired immediately.</small></div>
    </>}
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!canSubmit}>{marketListing ? 'Confirm market purchase' : 'Save purchase'}</button></div>
  </form></ModalShell>;
}

export function uniqueMaterials(state: AppState, projects: Project[]) {
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

export function OrderModal({ state, projects, project, material, order, repeatFrom, onClose, onSave, onRememberCity }: { state: AppState; projects: Project[]; project?: Project; material?: Material; order?: BuyOrder; repeatFrom?: BuyOrder; onClose: () => void; onSave: (order: BuyOrder, repeatSourceId?: string) => void; onRememberCity: (city: string) => void }) {
  const sharedAssignment = '__shared_inventory__';
  const currentProjects = projects.filter((entry) => !isProjectCompleted(entry));
  const initialAssignment = project?.id || (order ? order.projectId || sharedAssignment : null) || (repeatFrom ? repeatFrom.projectId || sharedAssignment : sharedAssignment);
  const [selectedProjectId, setSelectedProjectId] = useState(initialAssignment);
  const selectedProject = projects.find((entry) => entry.id === selectedProjectId);
  const isSharedOrder = selectedProjectId === sharedAssignment;
  // Shared order creation lists every material required by a current project.
  // The demand panel below distinguishes fully covered requirements from shortages.
  const activeProjectMaterialIds = new Set(currentProjects.flatMap((entry) => projectMaterials(state, entry, catalog)
    .filter((row) => row.required > 0).map((row) => row.id)));
  if (order?.projectId == null && order) activeProjectMaterialIds.add(order.materialId);
  if (repeatFrom?.projectId == null && repeatFrom) activeProjectMaterialIds.add(repeatFrom.materialId);
  const options = selectedProject
    ? projectMaterials(state, selectedProject, catalog).filter((entry) => entry.required > 0 || entry.id === order?.materialId || entry.id === repeatFrom?.materialId)
    : isSharedOrder ? uniqueMaterials(state, currentProjects).filter((entry) => activeProjectMaterialIds.has(entry.id)) : [];
  const [materialId, setMaterialId] = useState(order?.materialId || repeatFrom?.materialId || material?.id || '');
  const selectedMaterial = options.find((entry) => entry.id === materialId) || (material?.id === materialId ? material : undefined);
  const isRepeatingOrder = !!repeatFrom && !order;
  const fixedProject = !!project || !!order || !!repeatFrom;
  const showOrderFields = (!!selectedProject || isSharedOrder) && !!selectedMaterial;
  const materialDemand = useMemo(() => {
    if (!selectedMaterial) return undefined;
    if (isSharedOrder) {
      const summary = materialShortageOverview(state, catalog).find((entry) => entry.id === selectedMaterial.id);
      if (!summary) return { required: 0, covered: 0, stillNeeded: 0, onOrders: 0, shared: true };
      return {
        required: summary.required,
        covered: summary.acquiredTowardRequirement,
        stillNeeded: summary.stillNeeded,
        onOrders: summary.orders.filter((entry) => !entry.cancelled && !entry.archived)
          .reduce((sum, entry) => sum + entry.remaining + entry.awaitingReceipt, 0),
        shared: true,
      };
    }
    if (!selectedProject) return undefined;
    const row = projectMaterials(state, selectedProject, catalog).find((entry) => entry.id === selectedMaterial.id);
    if (!row) return undefined;
    return {
      required: row.required,
      covered: Math.min(row.required, row.available + row.consumed),
      stillNeeded: row.missing,
      onOrders: row.orderRemaining + row.awaitingReceipt,
      shared: false,
    };
  }, [state, isSharedOrder, selectedProject?.id, selectedMaterial?.id]);
  const lastBuyOrderCity = state.settings.lastBuyOrderCity && state.settings.cities.includes(state.settings.lastBuyOrderCity)
    ? state.settings.lastBuyOrderCity
    : state.settings.cities[0] || 'Bridgewatch';
  const [city, setCity] = useState(order?.city || repeatFrom?.city || lastBuyOrderCity);
  const [unitPrice, setUnitPrice] = useState(String(order?.unitPrice ?? repeatFrom?.unitPrice ?? ''));
  const [quantity, setQuantity] = useState(String(order?.quantity ?? repeatFrom?.quantity ?? ''));
  const [placedAt, setPlacedAt] = useState(order?.placedAt || today());
  const [notes, setNotes] = useState(order?.notes || repeatFrom?.notes || '');
  const orderValue = Math.max(0, Number(unitPrice) || 0) * Math.max(0, Math.floor(Number(quantity) || 0));
  const setupFeePreview = (!order || order.unitPrice !== Number(unitPrice)) ? calculateBuyOrderSetupFee(orderValue) : 0;
  const cumulativeSetupFeesPreview = (order?.setupFees || 0) + setupFeePreview;
  const assignmentLabel = isSharedOrder ? 'Shared inventory · auto-assign by priority, then oldest project' : selectedProject ? projectDisplayName(selectedProject) : 'Select assignment';
  return <ModalShell title={order ? 'Update buy order' : repeatFrom ? 'Repeat buy order' : isSharedOrder ? 'Create shared buy order' : 'Create buy order'} subtitle={`${assignmentLabel} · This tracks your in-game order; it does not submit anything to Albion. Confirmed receipts enter shared inventory.`} onClose={onClose}><form className="form-body" onSubmit={(event) => { event.preventDefault(); const count = Math.floor(Number(quantity)); const price = Number(unitPrice); if ((!selectedProject && !isSharedOrder) || !selectedMaterial || !Number.isInteger(count) || count <= 0 || !Number.isFinite(price) || price < 0 || count < (order?.received || 0) || count < (order?.fulfilled || 0)) return; onSave({ id: order?.id || newId(), projectId: isSharedOrder ? null : selectedProject!.id, materialId: selectedMaterial.id, materialName: displayMaterialName(selectedMaterial.id, selectedMaterial.name), city: isRepeatingOrder ? repeatFrom.city : city, unitPrice: price, quantity: count, fulfilled: isRepeatingOrder ? 0 : order?.fulfilled || 0, received: isRepeatingOrder ? 0 : order?.received || 0, placedAt: isRepeatingOrder ? today() : placedAt, notes: notes.trim(), mode: isRepeatingOrder ? 'Active' : order?.mode || 'Active', cancelled: isRepeatingOrder ? false : order?.cancelled || false, archived: isRepeatingOrder ? false : order?.archived || false, setupFees: isRepeatingOrder ? 0 : order?.setupFees || 0 }, isRepeatingOrder ? repeatFrom.id : undefined); }}>
    {!fixedProject && <div className="field"><label className="field-label">Assignment</label><select required value={selectedProjectId} onChange={(event) => { setSelectedProjectId(event.target.value); setMaterialId(''); setUnitPrice(''); setQuantity(''); }}><option value={sharedAssignment}>Shared inventory · auto-assign after receipt</option>{currentProjects.map((entry) => <option key={entry.id} value={entry.id}>{projectDisplayName(entry)}</option>)}</select><small className="field-help">Shared receipts are assigned to projects by priority, then oldest project first.</small></div>}
    {(selectedProject || isSharedOrder) && <div className="field"><label className="field-label">Material</label><select required value={materialId} onChange={(event) => { setMaterialId(event.target.value); setUnitPrice(''); setQuantity(''); }}><option value="">{isSharedOrder ? 'Select a material required by active projects' : 'Select a required material'}</option>{options.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>{!options.length && <small className="field-help">No materials are currently required by active projects.</small>}{selectedMaterial && <div className="selected-item"><ItemIcon id={selectedMaterial.id} /><span><strong><CopyableName name={selectedMaterial.name} /></strong><small>{selectedMaterial.id}</small></span></div>}{isRepeatingOrder && <small className="field-help">This creates a new order for {formatNumber(repeatFrom.quantity)} units in {repeatFrom.city}. Acquired quantity resets to 0; the previous order and its receipts stay in history.</small>}</div>}
    {selectedMaterial && materialDemand && <div className="order-value-preview shared-order-coverage" aria-live="polite">
      <strong className="coverage-title">{materialDemand.shared ? 'Demand across active projects' : 'Project material demand'}</strong>
      <span>Total required</span><strong>{formatNumber(materialDemand.required)}</strong>
      <span>Covered by acquired materials</span><strong>{formatNumber(materialDemand.covered)}</strong>
      <span>Still needed</span><strong>{formatNumber(materialDemand.stillNeeded)}</strong>
      <span>On open orders / awaiting pickup</span><strong>{formatNumber(materialDemand.onOrders)}</strong>
      <small>{materialDemand.shared
        ? 'Open orders are shown separately and do not count as acquired. Confirm receipts to add materials to shared inventory and allocate them by priority, then oldest project first.'
        : 'Open orders are shown separately and do not count as acquired. Confirm receipts to add them to inventory.'}</small>
    </div>}
    {showOrderFields && <>
      <div className="form-grid"><div className="field"><label className="field-label">City</label><select value={isRepeatingOrder ? repeatFrom.city : city} disabled={isRepeatingOrder} onChange={(event) => { setCity(event.target.value); onRememberCity(event.target.value); }}>{state.settings.cities.includes(isRepeatingOrder ? repeatFrom.city : city) ? null : <option>{isRepeatingOrder ? repeatFrom.city : city}</option>}{state.settings.cities.map((name) => <option key={name}>{name}</option>)}</select>{isRepeatingOrder && <small className="field-help">Repeat orders stay in the original city: {repeatFrom.city}.</small>}</div><div className="field"><label className="field-label">Buy order price / unit</label><PriceInput required value={unitPrice} onChange={setUnitPrice} /></div><div className="field"><label className="field-label">Quantity requested</label><input type="number" min={Math.max(1, order?.received || 0, order?.fulfilled || 0)} step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div><div className="field"><label className="field-label">Placement date</label><input type="date" value={placedAt} onChange={(event) => setPlacedAt(event.target.value)} /></div></div>
      <div className="order-value-preview"><span>Requested order value</span><strong>{formatSilver(orderValue)}</strong><span>{order && order.unitPrice !== Number(unitPrice) ? 'Price change setup fee (2.5%)' : 'Setup fee charged now (2.5%)'}</span><strong>{formatSilver(setupFeePreview)}</strong><span>Cumulative setup fees</span><strong>{formatSilver(cumulativeSetupFeesPreview)}</strong><span>Total including setup fees</span><strong>{formatSilver(orderValue + cumulativeSetupFeesPreview)}</strong><small>{order && order.unitPrice === Number(unitPrice) ? 'The setup fee is charged when this order is first created.' : 'A 2.5% setup fee is charged for creating the order or changing its price.'} Confirmed acquisitions enter shared inventory at this order's price and city. {isSharedOrder ? 'They are automatically assigned by priority, then oldest project first.' : ''}</small></div>
      <div className="field"><label className="field-label">Notes</label><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
    </>}
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button>{showOrderFields && <button className="button button-primary">{order ? 'Save order' : isSharedOrder ? 'Create shared order' : 'Create order'}</button>}</div>
  </form></ModalShell>;
}

export function ReceiveModal({ order, onClose, onSave }: { order: BuyOrder; onClose: () => void; onSave: (quantity: number, unitPrice: number, date: string, notes: string, confirmationId: string) => void }) {
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
  const saveReceipt = (acquired: number) => {
    if (submitting || unitPrice.trim() === '' || !priceValid || acquired <= 0 || acquired > remaining) return;
    setSubmitting(true);
    onSave(acquired, parsedPrice, date, notes.trim(), confirmationId);
  };
  const confirm = (acquired: number) => {
    if (!canSave) return;
    saveReceipt(acquired);
  };
  return <ModalShell title="Add bought quantity" subtitle={`${displayMaterialName(order.materialId, order.materialName)} ? ${order.city}`} onClose={onClose} wide><div className="form-body">
    <div className="receipt-order-facts"><span>Original order<strong>{formatNumber(order.quantity)}</strong></span><span>Previously bought<strong>{formatNumber(order.received)}</strong></span><span>Locally remaining<strong>{formatNumber(remaining)}</strong></span></div>
    <div className="field"><label className="field-label">How many units remain in the buy order?</label><input type="number" min="0" max={remaining} step="1" required value={remainingInput} onChange={(event) => setRemainingInput(event.target.value)} /><small className="field-help">Enter the current remaining quantity shown in Albion. The planner will calculate how many were bought since the last check.</small></div>
    <div className="receipt-order-facts receipt-check-result"><span>Bought since last check<strong className={boughtSinceLastCheck > 0 ? 'qty-available' : ''}>{boughtSinceLastCheck < 0 ? '?' : formatNumber(boughtSinceLastCheck)}</strong></span></div>
    <div className="form-grid"><div className="field"><label className="field-label">Buy order price / unit</label><PriceInput required value={unitPrice} onChange={setUnitPrice} /><small className="field-help">Changing the price charges a 2.5% setup fee on the order value.</small></div><div className="field"><label className="field-label">Acquisition date</label><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></div><div className="field"><label className="field-label">Notes</label><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" /></div></div>
    <div className="order-value-preview"><span>Price change setup fee</span><strong>{formatSilver(setupFeeAdded)}</strong><small>{priceChanged ? `A new ${formatSilver(setupFeeAdded)} fee will be added because the price changed.` : 'No new setup fee; the buy order price is unchanged.'} A new order also has a 2.5% setup fee.</small></div>
    <div className="helper-note"><PackageCheck size={15} /> Recording adds {formatNumber(Math.max(0, boughtSinceLastCheck))} units to shared inventory at {formatSilver(priceValid ? parsedPrice : order.unitPrice)} per unit. Unbought units are not added to stock.</div>
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="button" className="button button-outline" disabled={submitting || remaining === 0 || unitPrice.trim() === '' || !priceValid} onClick={() => saveReceipt(remaining)}>Add all {formatNumber(remaining)} remaining as bought</button><button type="button" className="button button-primary" disabled={!canSave} onClick={() => confirm(boughtSinceLastCheck)}>{boughtSinceLastCheck > 0 ? `Add ${formatNumber(boughtSinceLastCheck)} bought units` : 'Save order check'}</button></div>
  </div></ModalShell>;
}

export function PriceModal({ state, project, material, onClose, onRefresh, onSaveManual, refreshing }: { state: AppState; project: Project; material: Material; onClose: () => void; onRefresh: (ids?: string[]) => void; onSaveManual: (value: ManualPrice | null) => void; refreshing: boolean }) {
  const key = manualPriceKey(project.id, material.id);
  const manual = state.manualPrices[key];
  const [buy, setBuy] = useState(manual?.buy == null ? '' : String(manual.buy));
  const [sell, setSell] = useState(manual?.sell == null ? '' : String(manual.sell));
  const [cityFilter, setCityFilter] = useState('All cities');
  const cities = cityFilter === 'All cities' ? state.settings.cities : [cityFilter];
  return <ModalShell title={`${material.name} prices`} subtitle={`${material.name} - ${qualityLabel(state.settings.marketQuality)} quality · compare city snapshots and your manual estimate.`} onClose={onClose} wide><div className="price-modal-body">
    <div className="price-modal-toolbar"><label className="field compact-field"><span className="field-label">City filter</span><select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}><option>All cities</option>{state.settings.cities.map((city) => <option key={city}>{city}</option>)}</select></label><button className="button button-outline" onClick={() => onRefresh([material.id])} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /> Refresh city snapshots</button></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>City</th><th>Top buy order</th><th>Lowest sell listing</th><th>Manual estimate</th><th>Snapshot timestamps</th></tr></thead><tbody>{cities.map((city) => { const price = state.prices[priceKey(material.id, city, state.settings.marketQuality)]; const buyFreshness = getPriceFreshness(price, state.settings.freshMinutes, Date.now(), 'buy'); const sellFreshness = getPriceFreshness(price, state.settings.freshMinutes, Date.now(), 'sell'); return <tr key={city}><td><strong>{city}</strong></td><td><div className="price-cell"><strong>{price?.buy == null || price.buy <= 0 ? 'Unavailable' : formatSilver(price.buy)}</strong><StatusBadge value={buyFreshness} /><PriceAge date={price?.buyAt} /></div></td><td><div className="price-cell"><strong>{price?.sell == null || price.sell <= 0 ? 'Unavailable' : formatSilver(price.sell)}</strong><StatusBadge value={sellFreshness} /><PriceAge date={price?.sellAt} /></div></td><td><div className="price-cell">{manual?.buy == null && manual?.sell == null ? <><strong>Not entered</strong><StatusBadge value="UNAVAILABLE" /></> : <><strong>Buy: {manual?.buy == null || manual.buy === 0 && !manual.zeroBuyConfirmed ? 'Unavailable' : formatSilver(manual.buy)}</strong><strong>Sell: {manual?.sell == null || manual.sell === 0 && !manual.zeroSellConfirmed ? 'Unavailable' : formatSilver(manual.sell)}</strong><StatusBadge value="MANUAL" /><small className="cell-sub">Updated {updatedLabel(manual.updatedAt)}</small></>}</div></td><td><span className="timestamp-line">Buy · {updatedLabel(price?.buyAt)}</span><span className="timestamp-line">Sell · {updatedLabel(price?.sellAt)}</span></td></tr>; })}</tbody></table></div>
    <div className="manual-price-box"><div className="manual-price-heading"><div><h3>Manual estimate</h3><p>Used for future purchase estimates. Actual purchase records remain unchanged.</p></div><div className="manual-price-state">{manual && <><StatusBadge value="MANUAL" /><small>Updated {updatedLabel(manual.updatedAt)}</small></>}</div></div><div className="form-grid"><div className="field"><label className="field-label">Estimated buy price / unit</label><PriceInput value={buy} onChange={setBuy} placeholder="Automatic price used when blank" />{manual?.buy === 0 && !manual.zeroBuyConfirmed && <small className="price-warning">Zero estimate needs review before it is used in costs.</small>}</div><div className="field"><label className="field-label">Estimated sell price / unit <span className="optional-label">Optional</span></label><PriceInput value={sell} onChange={setSell} />{manual?.sell === 0 && !manual.zeroSellConfirmed && <small className="price-warning">Zero estimate needs review.</small>}</div></div><div className="manual-price-actions"><button className="button button-quiet" onClick={() => { onSaveManual(null); setBuy(''); setSell(''); }}>Use automatic price</button><button className="button button-primary" disabled={buy === '' && sell === ''} onClick={() => { const nextBuy = buy === '' ? null : Number(buy); const nextSell = sell === '' ? null : Number(sell); if ((nextBuy != null && (!Number.isFinite(nextBuy) || nextBuy < 0)) || (nextSell != null && (!Number.isFinite(nextSell) || nextSell < 0))) return; const reviewedBuy = nextBuy === 0 && manual?.zeroBuyConfirmed ? 0 : reviewZeroEstimate(nextBuy, 'Estimated buy price', materialDefaultPrice(state, material.id)); if (reviewedBuy === undefined) return; const reviewedSell = nextSell === 0 && manual?.zeroSellConfirmed ? 0 : reviewZeroEstimate(nextSell, 'Estimated sell price', null); if (reviewedSell === undefined) return; setBuy(reviewedBuy == null ? '' : String(reviewedBuy)); setSell(reviewedSell == null ? '' : String(reviewedSell)); onSaveManual({ buy: reviewedBuy, sell: reviewedSell, zeroBuyConfirmed: reviewedBuy === 0, zeroSellConfirmed: reviewedSell === 0, updatedAt: new Date().toISOString() }); }}>Save manual estimate</button></div></div>
    <p className="market-footnote"><CircleHelp size={14} /> Albion Online Data Project prices are community-submitted market snapshots. The timestamp shows the last order update in the feed; it does not guarantee current availability or final cost.</p>
  </div></ModalShell>;
}

export function AllocationModal({ state, materialId, materialName, preferredProjectId, onClose, onSave }: { state: AppState; materialId: string; materialName: string; preferredProjectId?: string; onClose: () => void; onSave: (allocation: MaterialAllocation) => void }) {
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

export function MyMaterialsTable({ state, project, rows, onSave, onAdd, onReserve }: { state: AppState; project: Project; rows: MaterialSummary[]; onSave: (material: Material, value: number) => void; onAdd: () => void; onReserve: (material: Material) => void }) {
  return <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">PROJECT INVENTORY</span><h3>My Materials</h3><p>Shared stock is assigned by project priority and included here. Editing Owned now adjusts this project's stock without adding a purchase record.</p></div><button className="button button-outline" onClick={onAdd}><PackagePlus size={15} /> Add Materials</button></div>
    <div className="table-wrap"><table className="data-table compact-inventory-table"><thead><tr><th>Material</th><th>Total required</th><th>Owned now</th><th>Reserved / acquired</th><th>Consumed</th><th>Still needed</th><th>Available supply</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="material-label"><ItemIcon id={row.id} size={30} /><span><strong><CopyableName name={row.name} /></strong><small>{!row.required ? 'Not in selected recipe' : ''}</small></span></div></td><td>{formatNumber(row.required)}</td><td><OwnedMaterialInput value={row.available} label={`Owned quantity of ${row.name}`} onSave={(value) => onSave(row, value)} /></td><td>{formatNumber(row.acquired)}</td><td>{formatNumber(row.consumed)}</td><td><strong className={row.missing ? 'qty-missing' : 'qty-available'}>{formatNumber(row.missing)}</strong></td><td>{formatNumber(row.available)}</td><td>{sharedUnallocated(state, row.id, catalog) > 0 && <button className="button button-outline button-sm" onClick={() => onReserve(row)}>Reserve shared</button>}</td></tr>)}{!rows.length && <tr><td colSpan={8}><div className="table-empty">Choose a recipe to see its materials.</div></td></tr>}</tbody></table></div>
  </section>;
}

export function QuickInventoryModal({ state, project, onClose, onSave }: { state: AppState; project?: Project; onClose: () => void; onSave: (material: Material, quantity: number, shared: boolean) => void }) {
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

