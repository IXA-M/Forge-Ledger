import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Archive, ArrowDownToLine, ArrowLeft, ArrowUpRight, BadgeCheck, Boxes, CalendarDays,
  Check, CheckCircle2, ChevronDown, CircleHelp, ClipboardList, Clock3, Coins, Download, ExternalLink,
  FileDown, Filter, Hammer, ListTodo, MapPin, PackageCheck, PackagePlus, Palette, Plus, RefreshCw, Search, Settings2,
  ShieldCheck, ShoppingCart, Sparkles, Target, Trash2, TrendingUp, Upload, Wallet, X,
} from 'lucide-react';
import { catalog, catalogById, displayMaterialName } from './data/catalog';
import { ItemPicker } from './components/ItemPicker';
import { ForgeArtwork } from './components/ForgeArtwork';
import { CopyableName, ItemIcon, ModalShell, PriceAge, PriceInput, Progress, StatusBadge } from './components/SharedUi';
import { BuyOrderHistoryModal, JournalPlanner, MaterialTable, MetricCard, OrderCheckModal, OrderRow, ProjectCard, ShortageOverviewRow, TaskRow } from './components/PlannerRows';
import { SettingsPage } from './features/settings/SettingsPage';
import { EnchantCraftPage, draftFromForgeProject } from './features/enchantCraft/EnchantCraftPage';
import {
  AllocationModal, fillUnpricedMaterialRecords, hasUsableManualBuy, materialDefaultPrice, RecordSaleModal,
  materialUnpricedCount, MyMaterialsTable, OrderModal, PriceModal, ProjectRrrInput, projectDisplayName, projectProductIcon,
  projectProductName, ProjectModal, PurchaseModal, ReceiveModal, reviewMaterialPrice,
  reviewZeroEstimate, TaskModal, QuickInventoryModal, recipeName, uniqueMaterials,
} from './features/dialogs/PlannerDialogs';
import { qualityLabel, updatedLabel } from './utils/formatting';
import {
  batchRequirements, CITY_OPTIONS, emptyState, formatItemName, formatNumber, formatSilver, formatTier, getOrderStatus, getPriceFreshness, itemEnchantmentLevel, priorityValue,
  manualPriceKey, materialShortageOverview, mergePriceSnapshot, newId, priceKey, projectMaterials,
  allTimeMoneyGained, calculateBuyOrderSetupFee, isProjectCompleted, journalPlan, markProjectCrafted, materialReadiness, projectMaterialCost, projectReturnRate, projectSalesTotal, recipeFor, recipeRequirements, recordOrderReceipt, repeatBuyOrder, reverseOrderPurchase, setProjectMaterialBalance, sharedUnallocated, today, validateState,
  type AppState, type AutoPrice, type BuyOrder, type CatalogItem, type CraftSession, type InventoryBalance, type ManualPrice,
  type Material, type MaterialAllocation, type MaterialShortageSummary, type MaterialSummary, type Priority, type Project, type Purchase, type Recipe, type Task,
} from './domain';
import { fetchMarketPrices } from './market';
import { createDailyBackup, downloadBlob, exportPurchasesCsv, loadState, saveState } from './storage';
import './styles.css';

const legacyGeneratedTasks = new Map([
  ['Acquire missing materials', 'Record material batches as they arrive.'],
  ['Place or check buy orders', 'Keep city, price, and remaining order quantities up to date.'],
  ['Collect fulfilled materials', 'Confirm order fulfillment only after the items are received.'],
  ['Craft next batch', 'Check the ready quantity before logging a crafting session.'],
  ['Review project progress', 'Review remaining items, due date, and material estimates.'],
  ['Complete this project', 'Close out the project after the target is reached.'],
]);
const isLegacyGeneratedTask = (task: Task) => legacyGeneratedTasks.get(task.title) === task.description;
type Screen = 'Dashboard' | 'Projects' | 'History' | 'Materials' | 'Buy Orders' | 'Tasks' | 'Enchant Craft' | 'Settings';
type ModalState = { kind: 'project'; projectId?: string } | { kind: 'sale'; projectId: string } | { kind: 'purchase'; projectId?: string; material?: Material; marketListing?: boolean } | { kind: 'order'; projectId?: string | null; material?: Material; orderId?: string; repeatOrderId?: string } | { kind: 'receive'; orderId: string } | { kind: 'orderCheck'; orderId: string } | { kind: 'orderHistory'; orderId: string } | { kind: 'task'; projectId?: string; taskId?: string } | { kind: 'prices'; projectId: string; material: Material } | { kind: 'allocation'; materialId: string; materialName: string; projectId?: string } | { kind: 'inventory'; projectId?: string };

const IconForScreen = ({ screen }: { screen: Screen }) => {
  const props = { size: 17, strokeWidth: 1.8 };
  if (screen === 'Dashboard') return <Target {...props} />;
  if (screen === 'Projects') return <ClipboardList {...props} />;
  if (screen === 'History') return <Clock3 {...props} />;
  if (screen === 'Materials') return <Boxes {...props} />;
  if (screen === 'Buy Orders') return <ShoppingCart {...props} />;
  if (screen === 'Tasks') return <ListTodo {...props} />;
  if (screen === 'Enchant Craft') return <Sparkles {...props} />;
  return <Settings2 {...props} />;
};



export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [screen, setScreen] = useState<Screen>('Dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [projectPriorityFilter, setProjectPriorityFilter] = useState('All priorities');
  const [projectCategoryFilter, setProjectCategoryFilter] = useState('All categories');
  const [projectDeadlineFilter, setProjectDeadlineFilter] = useState('All deadlines');
  const [taskFilter, setTaskFilter] = useState<'Open' | 'All' | 'Done'>('Open');
  const [shortageFilter, setShortageFilter] = useState('All materials');
  const [shortageSort, setShortageSort] = useState('Largest shortage');
  const selectedProject = state.projects.find((project) => project.id === selectedProjectId);
  const projectMap = useMemo(() => new Map(state.projects.map((project) => [project.id, project])), [state.projects]);
  const orderOwnerLabel = (order: BuyOrder) => order.projectId ? (projectMap.get(order.projectId) ? projectDisplayName(projectMap.get(order.projectId)!) : 'Project removed') : 'Shared inventory · auto-assign';
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
    void createDailyBackup(state).catch((error) => console.error('Could not create daily local backup:', error));
    const dailyCheck = window.setInterval(() => {
      void createDailyBackup(loadState()).catch((error) => console.error('Could not create daily local backup:', error));
    }, 60 * 60 * 1000);
    return () => window.clearInterval(dailyCheck);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refreshPrices = useCallback(async (ids?: string[], cities = state.settings.cities, quality = state.settings.marketQuality) => {
    const itemIds = ids || [...new Set(state.projects.flatMap((project) => [
      ...projectMaterials(state, project, catalog).map((material) => material.id),
      project.itemId,
    ]))];
    if (!itemIds.length) { setToast('Add a crafting project before refreshing material prices.'); return; }
    setRefreshing(true);
    try {
      const { updates, failures } = await fetchMarketPrices(state.settings.server, itemIds, cities, quality);
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
    if (!state.projects.length) return;
    const initial = window.setTimeout(() => void refreshPrices(), 2000);
    if (!state.settings.autoRefresh) return () => window.clearTimeout(initial);
    const delay = Math.max(5, state.settings.autoRefreshMinutes) * 60_000;
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshPrices(); }, delay);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [state.settings.autoRefresh, state.settings.autoRefreshMinutes, state.projects.length, refreshPrices]);

  const showProject = (id: string) => { setSelectedProjectId(id); setScreen('Projects'); };
  const useProjectInEnchantCraft = (project: Project) => {
    setState((previous) => ({ ...previous, enchantCraft: { ...(previous.enchantCraft || emptyState().enchantCraft!), draft: draftFromForgeProject(previous, project) } }));
    setScreen('Enchant Craft');
    setSelectedProjectId(null);
    setToast(`Loaded ${projectDisplayName(project)} as a read-only estimate snapshot.`);
  };
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
  const saveOrder = (order: BuyOrder, repeatSourceId?: string) => {
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
      if (repeatSourceId) return repeatBuyOrder(prepared, repeatSourceId, savedOrder) || previous;
      return { ...prepared, orders: prepared.orders.some((entry) => entry.id === order.id) ? prepared.orders.map((entry) => entry.id === order.id ? savedOrder : entry) : [...prepared.orders, savedOrder] };
    });
    setModal(null);
    const feeAddedForSave = savedOrder.setupFees! - (previousOrder?.setupFees || 0);
    setToast(`${repeatSourceId ? 'Previous order archived; new order started at 0 acquired' : 'Buy order saved'}${feeAddedForSave > 0 ? `; ${formatSilver(feeAddedForSave)} setup fee charged` : ''}. Fulfilled units are not counted as acquired until receipt is confirmed.`);
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
    setSelectedProjectId(null);
    setScreen('History');
    setToast('Project marked complete and moved to History. Its recipe, purchases, and material use are preserved.');
  };
  const recordSale = (project: Project, sale: import('./domain').SaleRecord) => {
    setState((previous) => ({ ...previous, projects: previous.projects.map((entry) => entry.id === project.id ? { ...entry, sales: [...(entry.sales || []), sale] } : entry) }));
    setModal(null);
    setToast(`${formatSilver(sale.amount)} actual sale proceeds recorded.`);
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
  const subtitle = selectedProject && screen === 'Projects' ? `${projectDisplayName(selectedProject)} · project materials, orders, costs, and completion history` : screen === 'Dashboard' ? 'A clear view of what to craft, collect, and buy next.' : screen === 'Projects' ? 'Active projects only. Completed projects move to History.' : screen === 'History' ? 'Review completed projects and track actual sale proceeds over time.' : screen === 'Materials' ? 'Track project stock, shared inventory, buy orders, and actual purchase costs.' : screen === 'Buy Orders' ? 'Track every city order and confirm acquired materials across all projects.' : screen === 'Tasks' ? 'Keep the next useful action visible across every active project.' : screen === 'Enchant Craft' ? 'Estimate enchant crafting costs and compare a multi-item plan.' : 'Tune price sources, crafting assumptions, and local backups.';

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
    }).filter((entry) => hasUsableManualBuy(entry.manual) || !entry.freshness.includes('Fresh'));
    const orderCityRows = [...new Set(state.orders.filter((order) => ['Active', 'Planned', 'Partially Fulfilled'].includes(getOrderStatus(order))).map((order) => order.city))].map((city) => ({
      city,
      count: state.orders.filter((order) => order.city === city && ['Active', 'Planned', 'Partially Fulfilled'].includes(getOrderStatus(order))).length,
      quantity: state.orders.filter((order) => order.city === city && ['Active', 'Planned', 'Partially Fulfilled'].includes(getOrderStatus(order))).reduce((sum, order) => sum + Math.max(0, order.quantity - order.received), 0),
      partial: state.orders.filter((order) => order.city === city && getOrderStatus(order) === 'Partially Fulfilled').length,
    }));
    return <>
      <div className="dashboard-intro"><div className="dashboard-intro-copy"><span className="eyebrow"><Sparkles size={13} /> CRAFTING OVERVIEW</span><h2>Your next project, at a glance.</h2><p>See which goals are ready, what materials are missing, and what needs your attention today.</p></div><ForgeArtwork /><button className="button button-primary" onClick={() => setModal({ kind: 'project' })}><Plus size={16} /> New project</button></div>
      <div className="metric-grid"><MetricCard label="Active projects" value={formatNumber(activeProjects.length)} sub={`${state.projects.length - activeProjects.length} completed`} icon={<ClipboardList size={17} />} /><MetricCard label="Average materials ready" value={knownReadiness.length ? `${Math.round(completionPercent)}%` : 'Unavailable'} sub={`${formatNumber(missingMaterialUnits)} material units still needed`} icon={<TrendingUp size={17} />} tone="gold" /><MetricCard label="Projects ready" value={formatNumber(readyProjects.length)} sub="all required materials available" icon={<Boxes size={17} />} /><MetricCard label="Open actions" value={formatNumber(openTaskCount)} sub={`${overdueTasks.length} overdue · ${state.projects.filter(isProjectCompleted).length} completed`} icon={<ListTodo size={17} />} tone="gold" /></div>
      <section className="panel section-panel dashboard-profit"><div className="section-heading"><div><span className="eyebrow">PROJECTED PROFIT</span><h3>Expected results for priced projects</h3><p>Based on each project’s selling price and estimated material costs. Completed projects are not treated as sold.</p></div><strong className="profit-value">{profitEstimates.length ? formatSilver(projectedProfit) : 'Unavailable'}</strong></div>{profitEstimates.length ? <div className="profit-breakdown"><span>Included projects <strong>{formatNumber(profitEstimates.length)}</strong></span><span>Projected net revenue <strong>{formatSilver(projectedRevenue)}</strong></span><span>Estimated material cost <strong>{formatSilver(projectedCost)}</strong></span><span>Selling tax <strong>{state.settings.sellingTaxPercent == null ? 'Not configured; excluded' : `${formatNumber(state.settings.sellingTaxPercent)}% applied`}</strong></span></div> : <small className="field-help">Add a selling price and ensure each material has an actual average or price estimate to include a project.</small>}</section>
      <div className="dashboard-grid">
        <section className="panel focus-panel"><div className="panel-heading"><div><span className="eyebrow">RECOMMENDED NEXT</span><h3>{focusProject ? projectDisplayName(focusProject) : 'Create your first project'}</h3></div>{focusProject && <button className="text-button" onClick={() => showProject(focusProject.id)}>Open project <ArrowUpRight size={14} /></button>}</div>
          {focusProject ? <><div className="focus-project-row"><ItemIcon id={projectProductIcon(focusProject)} size={62} /><div><strong><CopyableName name={projectProductName(focusProject, catalogById.get(focusProject.itemId))} /></strong><span>{formatNumber(focusProject.target)} target items · {focusProject.priority} priority</span></div><div className="focus-progress"><strong>{materialReadiness(state, focusProject, catalog) ?? '—'}{materialReadiness(state, focusProject, catalog) == null ? '' : '%'}</strong>{materialReadiness(state, focusProject, catalog) != null && <Progress value={materialReadiness(state, focusProject, catalog)!} />}</div></div><div className="focus-checklist">{readyProjects.includes(focusProject) ? <><span className="ready-icon"><BadgeCheck size={16} /></span><span className="ready-copy">All required materials are available</span></> : <><span className="missing-icon"><AlertCircle size={16} /></span><span className="missing-copy">{projectMaterials(state, focusProject, catalog).filter((m) => m.missing > 0).length} materials still need attention</span></>}</div></> : <div className="empty-state compact"><div className="empty-icon"><Hammer size={22} /></div><strong>No crafting projects yet</strong><p>Choose any craftable item from the game catalog and set a long-term goal.</p><button className="button button-primary" onClick={() => setModal({ kind: 'project' })}>Plan a project</button></div>}
        </section>
        <section className="panel task-panel"><div className="panel-heading"><div><span className="eyebrow">WHAT’S NEXT</span><h3>Outstanding tasks</h3></div><button className="text-button" onClick={() => nav('Tasks')}>View all <ArrowUpRight size={14} /></button></div>{sortedTasks.slice(0, 4).map((task) => <TaskRow key={task.id} task={task} projectName={projectMap.get(task.projectId) ? projectDisplayName(projectMap.get(task.projectId)!) : 'Project'} onToggle={() => toggleTask(task.id)} onEdit={() => openTaskModal(task)} onDelete={() => deleteTask(task.id)} />)}{dailyOrderChecks.length > 0 && <div className="daily-order-checks"><div className="daily-order-heading"><strong>Daily buy-order checks</strong><span>Check each order in game</span></div>{dailyOrderChecks.map((order) => <div className="task-row daily-order-task" key={order.id}><div className="task-content"><strong>Check {displayMaterialName(order.materialId, order.materialName)}</strong><p><span className="order-city-chip"><MapPin size={12} />{order.city}</span><span>{orderOwnerLabel(order)}</span><span>{formatNumber(order.received)} / {formatNumber(order.quantity)} acquired</span></p></div><button className="button button-quiet button-sm" onClick={() => setModal({ kind: 'orderCheck', orderId: order.id })}>Check order</button></div>)}</div>}{!sortedTasks.length && !dailyOrderChecks.length && <p className="muted-copy">Nothing outstanding. You’re all caught up.</p>}</section>
      </div>
      <div className="dashboard-grid secondary-grid">
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">YOUR PROJECTS</span><h3>Active crafting goals</h3></div><button className="text-button" onClick={() => nav('Projects')}>All projects <ArrowUpRight size={14} /></button></div><div className="project-card-list">{activeProjects.slice(0, 3).map((project) => <ProjectCard key={project.id} project={project} state={state} onOpen={showProject} />)}{!activeProjects.length && state.projects.length > 0 && <p className="muted-copy">All projects are complete. Start another crafting goal when you’re ready.</p>}</div></section>
        <section className="panel market-watch"><div className="panel-heading"><div><span className="eyebrow">PRICE & ORDER CHECK</span><h3>Market data to review</h3></div><button className="icon-button" title="Refresh saved material prices" onClick={() => void refreshPrices()} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /></button></div><div className="market-watch-list">{marketAttention.slice(0, 4).map(({ project, material, price, freshness, priceSide, manual }, index) => <button className="market-watch-row" key={`${project.id}-${material.id}-${index}`} onClick={() => setModal({ kind: 'prices', projectId: project.id, material })}><ItemIcon id={material.id} size={33} /><span><strong>{material.name}</strong><small>{projectDisplayName(project)} · {state.settings.priceCity}</small></span><span className="market-watch-value">{hasUsableManualBuy(manual) ? formatSilver(manual!.buy!) : (priceSide === 'sell' ? price?.sell : price?.buy) == null || (priceSide === 'sell' ? price!.sell : price!.buy)! <= 0 ? 'Unavailable' : <>{formatSilver((priceSide === 'sell' ? price!.sell : price!.buy)!)}</>}<StatusBadge value={hasUsableManualBuy(manual) ? 'MANUAL' : freshness} />{hasUsableManualBuy(manual) ? <small>Updated {updatedLabel(manual!.updatedAt)}</small> : <PriceAge date={priceSide === 'sell' ? price?.sellAt : price?.buyAt} />}{manual?.buy === 0 && !manual.zeroBuyConfirmed && <small className="price-warning">Zero estimate needs review</small>}</span></button>)}{!marketAttention.length && <p className="muted-copy">No market prices need review yet. Refresh when you want a new snapshot.</p>}</div><div className="dashboard-order-summary"><div><strong>Buy orders</strong><span>{activeOrderCount} open · {awaitingReceipts} to collect · {formatSilver(plannedSpend)} planned</span></div><div className="order-city-list">{orderCityRows.slice(0, 4).map((row) => <span key={row.city}>{row.city}<b>{row.count} open · {formatNumber(row.quantity)} units · {row.partial} partial</b></span>)}{!orderCityRows.length && <span>No open city orders yet.</span>}</div><small>Known actual spend · {formatSilver(spendIncludingFees)}</small></div><p className="market-note">Snapshots from Albion Online Data Project · not guaranteed current or available.</p></section>
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
      const orders = state.orders.filter((order) => order.projectId === selectedProject.id && !order.archived).slice().reverse().sort((a, b) => b.placedAt.localeCompare(a.placedAt));
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
      const projectSales = [...(selectedProject.sales || [])].sort((a, b) => b.date.localeCompare(a.date));
      const soldQuantity = projectSales.reduce((sum, sale) => sum + sale.quantity, 0);
      const openTasks = tasks.filter((task) => !task.completed);
      return <>
        <button className="back-link" onClick={() => setSelectedProjectId(null)}><ArrowLeft size={15} /> Active projects</button>
        <div className="detail-hero panel"><div className="detail-item"><ItemIcon id={projectProductIcon(selectedProject)} size={76} /><div><div className="detail-title-row"><h2>{projectDisplayName(selectedProject, item)}</h2><span className={`priority-chip priority-${selectedProject.priority.toLowerCase()}`}>{selectedProject.priority} priority</span></div><p><CopyableName name={projectProductName(selectedProject, item)} /> · {formatTier(item?.tier, selectedProject.enchantCraft ? `${selectedProject.itemId}@${selectedProject.enchantCraft.targetEnchantment}` : selectedProject.recipeId)}{recipe && /Fire Dragon Scales/i.test(recipe.label) ? ` · ${recipeName(recipe)}` : ''} · {recipe?.outputCount ? `yields ${recipe.outputCount}` : ''}</p><small>Created {new Date(selectedProject.createdAt).toLocaleDateString()}{selectedProject.deadline ? ` · Due ${new Date(`${selectedProject.deadline}T00:00:00`).toLocaleDateString()}` : ''}{isProjectCompleted(selectedProject) && selectedProject.completedAt ? ` · Completed ${new Date(selectedProject.completedAt).toLocaleString()}` : ''}</small></div></div><div className="detail-actions"><button className="button button-outline" onClick={() => useProjectInEnchantCraft(selectedProject)}><Sparkles size={15} /> Use in Enchant Craft</button><button className="button button-outline" onClick={() => setModal({ kind: 'prices', projectId: selectedProject.id, material: productMarketMaterial })}><TrendingUp size={15} /> Item prices</button><button className="button button-outline" onClick={() => setModal({ kind: 'project', projectId: selectedProject.id })}><Settings2 size={15} /> Edit</button>{isProjectCompleted(selectedProject) ? <button className="button button-outline" onClick={() => reopenProject(selectedProject)}>Reopen project</button> : <button className="button button-primary" onClick={() => completeProject(selectedProject)}><BadgeCheck size={15} /> Mark Project as Crafted</button>}<button className="icon-button danger" title="Delete project" onClick={() => deleteProject(selectedProject)}><Trash2 size={16} /></button></div>
          <div className="detail-progress"><div className="detail-progress-heading"><span>Materials ready</span><strong>{percent == null ? 'Unavailable' : `${percent}%`}</strong></div>{percent != null && <Progress value={percent} />}<small>{isProjectCompleted(selectedProject) ? 'Crafting status: completed' : 'Crafting status: not crafted'} · {formatNumber(materials.reduce((sum, material) => sum + material.missing, 0))} material units still missing</small></div></div>
        <div className="detail-stat-grid"><MetricCard label="Target quantity" value={formatNumber(selectedProject.target)} sub="items planned" icon={<Target size={16} />} /><MetricCard label="Materials ready" value={percent == null ? 'Unavailable' : `${percent}%`} sub="allocated inventory and confirmed purchases" icon={<Boxes size={16} />} tone="gold" /><MetricCard label="Materials still missing" value={formatNumber(materials.reduce((sum, material) => sum + material.missing, 0))} sub={`${materials.filter((material) => material.missing > 0).length} different materials`} icon={<Boxes size={16} />} /><MetricCard label="Crafting status" value={isProjectCompleted(selectedProject) ? 'Completed' : 'Not crafted'} sub={selectedProject.completedAt ? new Date(selectedProject.completedAt).toLocaleDateString() : 'Manual confirmation required'} icon={isProjectCompleted(selectedProject) ? <CheckCircle2 size={16} /> : <Clock3 size={16} />} tone="gold" /></div>
        <JournalPlanner project={selectedProject} item={item} sessions={historicalSessions} onUpdate={(patch) => setState((previous) => ({ ...previous, projects: previous.projects.map((entry) => entry.id === selectedProject.id ? { ...entry, ...patch } : entry) }))} />
        <section className="panel section-panel profit-panel"><div className="section-heading"><div><span className="eyebrow">PROJECTED SALE</span><h3>Estimated profit</h3><p>Projection for selling all {formatNumber(selectedProject.target)} items at the price you entered. This is not recorded sales revenue.</p></div><strong className="profit-value">{estimatedProfit == null ? 'Unavailable' : formatSilver(estimatedProfit)}</strong></div><div className="profit-breakdown"><span>Selling price <strong>{selectedProject.sellingPrice == null ? 'Not set' : `${formatSilver(selectedProject.sellingPrice)} / item`}</strong></span><span>Gross revenue <strong>{grossRevenue == null ? 'Unavailable' : formatSilver(grossRevenue)}</strong></span><span>Selling tax <strong>{sellingTax == null ? 'Not configured' : `${formatNumber(sellingTax)}%`}</strong></span><span>Material cost estimate <strong>{estimatedMaterialCost == null ? 'Unavailable' : formatSilver(estimatedMaterialCost)}</strong></span><span>Projected net revenue <strong>{netRevenue == null ? 'Unavailable' : formatSilver(netRevenue)}</strong></span></div>{sellingTax == null && <small className="field-help">Selling tax is excluded because no tax rate is configured in Settings.</small>}</section>
        {isProjectCompleted(selectedProject) && <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">ACTUAL SALES</span><h3>{formatSilver(projectSalesTotal(selectedProject))} received</h3><p>{formatNumber(soldQuantity)} of {formatNumber(selectedProject.target)} items recorded as sold. Only recorded proceeds count toward lifetime money gained.</p></div><button className="button button-primary" disabled={soldQuantity >= selectedProject.target} onClick={() => setModal({ kind: 'sale', projectId: selectedProject.id })}><Coins size={15} /> Record sale</button></div>{projectSales.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Quantity sold</th><th>Money received</th><th>Notes</th></tr></thead><tbody>{projectSales.map((sale) => <tr key={sale.id}><td>{sale.date}</td><td>{formatNumber(sale.quantity)}</td><td><strong>{formatSilver(sale.amount)}</strong></td><td>{sale.notes || '—'}</td></tr>)}</tbody></table></div> : <div className="empty-inline"><Coins size={17} /><span>No actual sales recorded for this project yet. Estimated prices are not counted as money gained.</span></div>}</section>}
        <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">RECIPE MATERIALS</span><h3>What this project needs</h3><p>Project RRR: {formatNumber(effectiveProjectReturnRate)}% · {selectedProject.enchantCraft ? 'fixed Enchant Craft estimate.' : 'manual estimate, verify the applicable in-game rate.'} Known spend: {formatSilver(projectKnownSpend)}. Remaining purchase estimate: {formatSilver(estimatedSpendToAcquire)}. Known spend plus estimate: {formatSilver(estimatedProjectOutlay)}{projectUnpricedBatches ? ` (${projectUnpricedBatches} historical batches have unknown prices and are excluded)` : ""}.</p></div><button className="button button-outline" onClick={() => setModal({ kind: 'purchase', projectId: selectedProject.id })}><PackagePlus size={15} /> Record purchase</button></div><div className="rrr-inline-control"><label>Project RRR{selectedProject.enchantCraft ? <strong>15.2%</strong> : <><ProjectRrrInput key={selectedProject.id} value={effectiveProjectReturnRate} onSave={(returnRate) => setState((previous) => ({ ...previous, projects: previous.projects.map((entry) => entry.id === selectedProject.id ? { ...entry, returnRate } : entry) }))} /><span>%</span></>}</label><small>{selectedProject.enchantCraft ? 'Enchant Craft uses a fixed 15.2% estimate for eligible recipe materials.' : 'Changing this updates project totals and future estimates immediately.'} Recorded purchases and actual returns stay unchanged.</small></div><div className="rrr-breakdown"><strong>RRR {formatNumber(effectiveProjectReturnRate)}% · ESTIMATED</strong>{materials.map((material) => <span key={material.id}>{material.name}: base {formatNumber(material.baseRequired)} · estimated return {formatNumber(material.estimatedReturns)} · expected net {formatNumber(material.expectedRequired)}{material.actualReturns ? ` · actual returned ${formatNumber(material.actualReturns)}` : ''}</span>)}</div><MaterialTable state={state} project={selectedProject} rows={materials} onPurchase={(material) => setModal({ kind: 'purchase', projectId: selectedProject.id, material })} onOrder={(material) => setModal({ kind: 'order', projectId: selectedProject.id, material })} onPrices={(material) => setModal({ kind: 'prices', projectId: selectedProject.id, material })} onResolvePrice={resolveMaterialPriceDefaults} /><div className="table-legend"><span><strong>Acquired</strong> = project purchases plus shared stock assigned by priority, then oldest project first</span><span><strong>Available</strong> = acquired minus base materials consumed plus actual returns</span><span><strong>Still needed</strong> = estimated future recipe demand minus available stock</span></div></section>
        <MyMaterialsTable state={state} project={selectedProject} rows={materials} onAdd={() => setModal({ kind: 'inventory', projectId: selectedProject.id })} onSave={(material, value) => saveInventoryQuantity(selectedProject, material, value)} onReserve={(material) => setModal({ kind: 'allocation', materialId: material.id, materialName: material.name, projectId: selectedProject.id })} />
        <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">CITY BUY ORDERS</span><h3>Order tracking</h3><p>Open quantities remain planned; confirmed receipts go to shared inventory and are assigned by project priority.</p></div><button className="button button-outline" onClick={() => setModal({ kind: 'order', projectId: selectedProject.id })}><ShoppingCart size={15} /> Create Buy Order</button></div><div className="orders-list">{orders.map((order) => <OrderRow key={order.id} state={state} order={order} onEdit={() => setModal({ kind: 'order', projectId: selectedProject.id, material: materials.find((entry) => entry.id === order.materialId), orderId: order.id })} onReceive={() => setModal({ kind: 'receive', orderId: order.id })} onCancel={() => cancelOrder(order.id)} onArchive={() => archiveOrder(order.id)} onReverse={() => reverseLatestOrderReceipt(order)} onRepeat={() => setModal({ kind: 'order', projectId: order.projectId, repeatOrderId: order.id })} onHistory={() => setModal({ kind: 'orderHistory', orderId: order.id })} />)}{!orders.length && <div className="empty-inline"><ShoppingCart size={18} /><span>No buy orders for this project. Add an order to track a planned purchase by city.</span></div>}</div></section>
        <div className="dashboard-grid detail-bottom-grid"><section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">PROJECT HISTORY</span><h3>Completion records</h3></div></div><div className="activity-list">{[...(selectedProject.completionHistory || [])].slice().reverse().map((completion, index) => <div className="activity-row" key={`${completion.completedAt}-${index}`}><span className="activity-icon gold-icon"><BadgeCheck size={14} /></span><span><strong>Marked crafted · {formatNumber(completion.target)} target items</strong><small>{projectDisplayName(selectedProject)}</small></span><time>{new Date(completion.completedAt).toLocaleString()}</time></div>)}{!(selectedProject.completionHistory || []).length && <p className="muted-copy">No completion has been recorded.</p>}</div></section>
          <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">PROJECT TO-DO</span><h3>{openTasks.length} outstanding tasks</h3></div><button className="text-button" onClick={() => openTaskModal(undefined, selectedProject.id)}><Plus size={14} /> Add task</button></div>{tasks.slice(0, 6).map((task) => <TaskRow key={task.id} task={task} projectName={projectDisplayName(selectedProject)} onToggle={() => toggleTask(task.id)} onEdit={() => openTaskModal(task)} onDelete={() => deleteTask(task.id)} />)}{!tasks.length && <p className="muted-copy">Add a task to make the next action explicit.</p>}</section></div>
        {selectedProject.notes && <section className="panel notes-panel"><span className="eyebrow">PROJECT NOTES</span><p>{selectedProject.notes}</p></section>}
      </>;
    }
    const categories = [...new Set(activeProjects.map((project) => catalogById.get(project.itemId)?.category || 'Other'))].sort();
    const filtered = activeProjects.filter((project) => {
      const priorityOkay = projectPriorityFilter === 'All priorities' || project.priority === projectPriorityFilter;
      const categoryOkay = projectCategoryFilter === 'All categories' || (catalogById.get(project.itemId)?.category || 'Other') === projectCategoryFilter;
      const projectDate = project.deadline || '';
      const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const deadlineOkay = projectDeadlineFilter === 'All deadlines'
        || (projectDeadlineFilter === 'Overdue' && !!projectDate && projectDate < today() && !isProjectCompleted(project))
        || (projectDeadlineFilter === 'Next 7 days' && !!projectDate && projectDate >= today() && projectDate <= sevenDays)
        || (projectDeadlineFilter === 'No deadline' && !projectDate);
      return priorityOkay && categoryOkay && deadlineOkay;
    }).sort((a, b) => priorityValue(b.priority) - priorityValue(a.priority) || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
    return <><div className="filter-bar"><span className="filter-label"><Filter size={15} /> Active projects</span><select value={projectPriorityFilter} onChange={(event) => setProjectPriorityFilter(event.target.value)}><option>All priorities</option>{['Urgent', 'High', 'Normal', 'Low'].map((entry) => <option key={entry}>{entry}</option>)}</select><select value={projectCategoryFilter} onChange={(event) => setProjectCategoryFilter(event.target.value)}><option>All categories</option>{categories.map((entry) => <option key={entry}>{entry}</option>)}</select><select value={projectDeadlineFilter} onChange={(event) => setProjectDeadlineFilter(event.target.value)}><option>All deadlines</option><option>Overdue</option><option>Next 7 days</option><option>No deadline</option></select><span className="filter-count">{filtered.length} project{filtered.length === 1 ? '' : 's'}</span></div><div className="project-grid">{filtered.map((project) => <ProjectCard key={project.id} project={project} state={state} onOpen={showProject} />)}{!filtered.length && <div className="empty-state"><div className="empty-icon"><ClipboardList size={24} /></div><strong>{activeProjects.length ? 'No projects match these filters' : 'Your project list is ready'}</strong><p>{activeProjects.length ? 'Change a filter to see more projects.' : 'Add a project to begin tracking materials and crafting progress.'}</p>{!activeProjects.length && <button className="button button-primary" onClick={() => setModal({ kind: 'project' })}><Plus size={15} /> New project</button>}</div>}</div></>;
  };

  const renderHistory = () => {
    const completedProjects = state.projects.filter(isProjectCompleted).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    const sales = state.projects.flatMap((project) => (project.sales || []).map((sale) => ({ project, sale })))
      .sort((a, b) => b.sale.date.localeCompare(a.sale.date));
    const totalSold = sales.reduce((sum, entry) => sum + entry.sale.quantity, 0);
    return <>
      <div className="metric-grid"><MetricCard label="All-time money gained" value={formatSilver(allTimeMoneyGained(state.projects))} sub="Actual sale proceeds recorded" icon={<Coins size={17} />} tone="gold" /><MetricCard label="Completed projects" value={formatNumber(completedProjects.length)} sub="Crafted and confirmed" icon={<BadgeCheck size={17} />} /><MetricCard label="Items sold" value={formatNumber(totalSold)} sub={`${formatNumber(sales.length)} sale records`} icon={<TrendingUp size={17} />} /></div>
      <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">COMPLETED PROJECTS</span><h3>Project history</h3><p>Completed projects are removed from the active Projects list. Reopen one from its details if you want to resume tracking.</p></div></div>{completedProjects.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Project</th><th>Completed</th><th>Target</th><th>Actual money gained</th><th>Status</th></tr></thead><tbody>{completedProjects.map((project) => <tr key={project.id}><td><button className="inline-link" onClick={() => showProject(project.id)}>{projectDisplayName(project)}</button></td><td>{project.completedAt ? new Date(project.completedAt).toLocaleDateString() : 'Completed'}</td><td>{formatNumber(project.target)}</td><td>{formatSilver(projectSalesTotal(project))}</td><td><StatusBadge value="COMPLETED" /></td></tr>)}</tbody></table></div> : <div className="empty-inline"><BadgeCheck size={17} /><span>Projects you mark as crafted will be kept here for review.</span></div>}</section>
      <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">RECORDED SALES</span><h3>All-time money gained</h3><p>Only actual proceeds recorded against a completed project count here. Selling-price projections are excluded.</p></div><strong className="profit-value">{formatSilver(allTimeMoneyGained(state.projects))}</strong></div>{sales.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Project</th><th>Quantity sold</th><th>Money received</th><th>Notes</th></tr></thead><tbody>{sales.map(({ project, sale }) => <tr key={`${project.id}-${sale.id}`}><td>{sale.date}</td><td><button className="inline-link" onClick={() => showProject(project.id)}>{projectDisplayName(project)}</button></td><td>{formatNumber(sale.quantity)}</td><td><strong>{formatSilver(sale.amount)}</strong></td><td>{sale.notes || '—'}</td></tr>)}</tbody></table></div> : <div className="empty-inline"><Coins size={17} /><span>Record actual item sales from a completed project to build your all-time total.</span></div>}</section>
    </>;
  };

  const renderMaterials = () => {
    const materials = uniqueMaterials(state, state.projects);
    const shared = materials.map((material) => { const onHand = state.purchases.filter((purchase) => purchase.projectId == null && purchase.materialId === material.id).reduce((sum, purchase) => sum + purchase.quantity * (purchase.reversesPurchaseId ? -1 : 1), 0) + (state.inventoryBalances || []).filter((balance) => balance.projectId == null && balance.materialId === material.id).reduce((sum, balance) => sum + Math.max(0, balance.quantity), 0); const free = sharedUnallocated(state, material.id, catalog); return { material, onHand, allocated: Math.max(0, onHand - free), free }; }).filter((entry) => entry.onHand > 0);
    const purchaseHistory = [...state.purchases].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
    return <>
      <div className="material-intro panel"><div><div className="section-heading"><div><span className="eyebrow">INVENTORY & ACQUISITION</span><h3>Buy gradually. Know what is still missing.</h3><p>Purchases and confirmed buy order receipts are added to shared inventory. Stock is assigned to projects by priority; use Buy from Market on the Buy Orders page to record a listing purchase.</p></div></div></div><div className="material-kpis"><span><strong>{formatNumber(shared.reduce((sum, entry) => sum + entry.onHand, 0))}</strong> shared units</span><span><strong>{formatNumber(state.orders.filter((order) => getOrderStatus(order) === 'Partially Fulfilled').length)}</strong> partial orders</span><span><strong>{formatSilver(spendIncludingFees)}</strong> known priced spend{unpricedPurchaseBatches ? `; ${unpricedPurchaseBatches} batches have unknown prices` : ""}</span><span><strong>{formatSilver(plannedSpend)}</strong> unfilled order value</span></div></div>
        <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">SHARED INVENTORY</span><h3>Shared material stock</h3><p>Order receipts enter shared stock. Projects draw from it by priority, then oldest project first; you can also add items manually or reserve available units.</p></div><button className="button button-outline" onClick={() => setModal({ kind: 'inventory' })}><PackagePlus size={15} /> Add inventory</button></div>{shared.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Material</th><th>Shared stock</th><th>Reserved for projects</th><th>Unallocated</th><th>Action</th></tr></thead><tbody>{shared.map(({ material, onHand, allocated, free }) => <tr key={material.id}><td><div className="material-label"><ItemIcon id={material.id} size={32} /><span><strong>{material.name}</strong></span></div></td><td>{formatNumber(onHand)}</td><td>{formatNumber(allocated)}</td><td><strong>{formatNumber(free)}</strong></td><td><button className="button button-outline button-sm" onClick={() => setModal({ kind: 'allocation', materialId: material.id, materialName: material.name })} disabled={free <= 0 || !state.projects.length}>Allocate</button></td></tr>)}</tbody></table></div> : <div className="empty-inline"><Boxes size={18} /><span>No shared material stock yet. Add items manually, record a shared purchase, or confirm a buy order receipt.</span></div>}</section>
      <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">PROJECT REQUIREMENTS</span><h3>Materials across projects</h3><p>Each row is tied to a project, so acquisitions and consumption never overlap.</p></div><button className="button button-outline" onClick={() => void refreshPrices()} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Refresh prices</button></div><div className="table-wrap"><table className="data-table global-material-table"><thead><tr><th>Project / material</th><th>Required</th><th>Acquired / reserved</th><th>Consumed</th><th>Available</th><th>Missing</th><th>Order / collection</th><th>Remaining cost</th><th>Price source</th><th /></tr></thead><tbody>{allRows.map(({ project, material }, index) => { const price = state.prices[priceKey(material.id, state.settings.priceCity, state.settings.marketQuality)]; const priceSide = material.estimatePriceSide === 'sell' ? 'sell' : 'buy'; const freshness = getPriceFreshness(price, state.settings.freshMinutes, Date.now(), priceSide); const manual = state.manualPrices[manualPriceKey(project.id, material.id)]; return <tr key={`${project.id}-${material.id}-${index}`}><td><div className="material-label"><ItemIcon id={material.id} size={32} /><span><button className="inline-link" onClick={() => showProject(project.id)}>{projectDisplayName(project)}</button><strong>{material.name}</strong></span></div></td><td>{formatNumber(material.required)}</td><td>{formatNumber(material.acquired)}</td><td>{formatNumber(material.consumed)}</td><td>{formatNumber(material.available)}</td><td><strong className={material.missing ? 'qty-missing' : 'qty-available'}>{formatNumber(material.missing)}</strong></td><td><span>{formatNumber(material.orderRemaining)} unfilled</span><small className="cell-sub">{formatNumber(material.orderAcquired)} acquired via orders</small><small className="cell-sub">{formatNumber(material.awaitingReceipt)} to collect</small><small className="cell-sub">{formatNumber(material.notCovered)} not covered</small></td><td>{material.remainingEstimatedCost == null ? 'Unavailable' : formatSilver(material.remainingEstimatedCost)}</td><td><StatusBadge value={hasUsableManualBuy(manual) ? 'MANUAL' : freshness} />{!hasUsableManualBuy(manual) && <PriceAge date={priceSide === 'sell' ? price?.sellAt : price?.buyAt} />}</td><td><div className="table-actions"><button className="icon-button small" title="Price comparison" onClick={() => setModal({ kind: 'prices', projectId: project.id, material })}><TrendingUp size={15} /></button><button className="icon-button small" title="Record purchase" onClick={() => setModal({ kind: 'purchase', projectId: project.id, material })}><PackagePlus size={15} /></button><button className="icon-button small" title="Create Buy Order" onClick={() => setModal({ kind: 'order', projectId: project.id, material })}><ShoppingCart size={15} /></button><button className="icon-button small" title="Open project" onClick={() => showProject(project.id)}><ExternalLink size={14} /></button></div></td></tr>; })}{!allRows.length && <tr><td colSpan={10}><div className="table-empty">Create a project to see its complete materials list here.</div></td></tr>}</tbody></table></div></section>
      <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">ACTUAL TRANSACTIONS</span><h3>Purchase history</h3><p>Weighted average prices use only transactions with an actual unit price. Unconfirmed zero prices are excluded until reviewed.</p></div><button className="button button-outline" onClick={() => exportPurchasesCsv(state)}><FileDown size={15} /> Export CSV</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Material</th><th>Assigned to</th><th>City</th><th>Quantity</th><th>Actual unit price</th><th>Total cost</th><th>Source</th></tr></thead><tbody>{purchaseHistory.map((purchase) => { const needsPriceReview = purchase.unitPrice === 0 && !purchase.zeroPriceConfirmed; return <tr key={purchase.id}><td>{purchase.date}</td><td>{displayMaterialName(purchase.materialId, purchase.materialName)}</td><td>{purchase.projectId ? (projectMap.get(purchase.projectId) ? projectDisplayName(projectMap.get(purchase.projectId)!) : 'Project removed') : 'Shared inventory'}</td><td>{purchase.city}</td><td>{purchase.reversesPurchaseId ? '-' : ''}{formatNumber(purchase.quantity)}</td><td>{needsPriceReview ? <span className="price-warning">Zero price needs review</span> : purchase.unitPrice == null ? 'Unknown' : formatSilver(purchase.unitPrice)}</td><td>{needsPriceReview ? 'Excluded until reviewed' : purchase.unitPrice == null ? 'Unknown' : `${purchase.reversesPurchaseId ? '-' : ''}${formatSilver(purchase.unitPrice * purchase.quantity)}`}</td><td>{purchase.reversesPurchaseId ? 'Order acquisition reversal' : purchase.orderId ? 'Confirmed order receipt' : purchase.source === 'market-listing' ? 'Market listing' : 'Direct purchase'}</td></tr>; })}{!purchaseHistory.length && <tr><td colSpan={8}><div className="table-empty">No actual purchases recorded yet.</div></td></tr>}</tbody></table></div></section>
      <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">BUY ORDER OVERVIEW</span><h3>Orders across cities</h3><p>Prices in this section are your own planned orders, separate from market snapshots.</p></div></div><div className="orders-list">{state.orders.slice().reverse().sort((a, b) => b.placedAt.localeCompare(a.placedAt)).map((order) => <div key={order.id} className="global-order-wrap"><span className="global-order-project">{orderOwnerLabel(order)}</span><OrderRow state={state} order={order} onEdit={() => { const owner = order.projectId ? projectMap.get(order.projectId) : undefined; if (owner) setModal({ kind: 'order', projectId: owner.id, material: projectMaterials(state, owner, catalog).find((entry) => entry.id === order.materialId), orderId: order.id }); else if (!order.projectId) setModal({ kind: 'order', orderId: order.id }); }} onReceive={() => setModal({ kind: 'receive', orderId: order.id })} onCancel={() => cancelOrder(order.id)} onArchive={() => archiveOrder(order.id)} onReverse={() => reverseLatestOrderReceipt(order)} onRepeat={() => setModal({ kind: 'order', projectId: order.projectId, repeatOrderId: order.id })} onHistory={() => setModal({ kind: 'orderHistory', orderId: order.id })} /></div>)}{!state.orders.length && <div className="empty-inline"><ShoppingCart size={18} /><span>No buy orders have been added yet.</span></div>}</div></section>
    </>;
  };

  const renderBuyOrders = () => {
    const sortedOrders = state.orders.slice().reverse().filter((order) => !order.archived).sort((a, b) => b.placedAt.localeCompare(a.placedAt));
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
      <section className="panel section-panel"><div className="section-heading"><div><span className="eyebrow">ALL PROJECTS · ALL CITIES</span><h3>Buy order fulfillment</h3><p>Confirm only quantities you have actually acquired. Confirmed quantities enter shared inventory and are assigned to projects by priority, then oldest project first.</p></div></div><div className="orders-list">{sortedOrders.map((order) => <div key={order.id} className="global-order-wrap"><span className="global-order-project">{orderOwnerLabel(order)}</span><OrderRow state={state} order={order} onEdit={() => { const owner = order.projectId ? projectMap.get(order.projectId) : undefined; if (owner) setModal({ kind: 'order', projectId: owner.id, material: projectMaterials(state, owner, catalog).find((entry) => entry.id === order.materialId), orderId: order.id }); else if (!order.projectId) setModal({ kind: 'order', orderId: order.id }); }} onReceive={() => setModal({ kind: 'receive', orderId: order.id })} onCancel={() => cancelOrder(order.id)} onArchive={() => archiveOrder(order.id)} onReverse={() => reverseLatestOrderReceipt(order)} onRepeat={() => setModal({ kind: 'order', projectId: order.projectId, repeatOrderId: order.id })} onHistory={() => setModal({ kind: 'orderHistory', orderId: order.id })} /></div>)}{!sortedOrders.length && <div className="empty-inline"><ShoppingCart size={18} /><span>No active buy orders to fulfill. Archived orders are kept in the project history.</span></div>}</div></section>
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

  const renderScreen = () => screen === 'Dashboard' ? renderDashboard() : screen === 'Projects' ? renderProjects() : screen === 'History' ? renderHistory() : screen === 'Materials' ? renderMaterials() : screen === 'Buy Orders' ? renderBuyOrders() : screen === 'Tasks' ? renderTasks() : screen === 'Enchant Craft' ? <EnchantCraftPage state={state} onChange={(enchantCraft) => setState((previous) => ({ ...previous, enchantCraft }))} onRefresh={(ids, cities) => void refreshPrices(ids, cities, 1)} refreshing={refreshing} onOpenProject={showProject} onCreateProject={(project) => { setState((previous) => ({ ...previous, projects: [...previous.projects, project] })); setToast(`${projectDisplayName(project)} added to Projects with its enchantment materials ready for inventory and buy order tracking.`); }} /> : renderSettings();
  const modalProject = modal?.kind === 'project' && modal.projectId ? projectMap.get(modal.projectId) : undefined;
  const saleProject = modal?.kind === 'sale' ? projectMap.get(modal.projectId) : undefined;
  const orderForModal = modal?.kind === 'order' && modal.orderId ? state.orders.find((order) => order.id === modal.orderId) : undefined;
  const repeatOrderForModal = modal?.kind === 'order' && modal.repeatOrderId ? state.orders.find((order) => order.id === modal.repeatOrderId) : undefined;
  const ownerForOrder = modal?.kind === 'order' ? modal.projectId ? projectMap.get(modal.projectId) : undefined : orderForModal?.projectId ? projectMap.get(orderForModal.projectId) : undefined;
  const receiveOrder = modal?.kind === 'receive' ? state.orders.find((order) => order.id === modal.orderId) : undefined;
  const orderCheck = modal?.kind === 'orderCheck' ? state.orders.find((order) => order.id === modal.orderId) : undefined;
  const historyOrder = modal?.kind === 'orderHistory' ? state.orders.find((order) => order.id === modal.orderId) : undefined;
  const taskForModal = modal?.kind === 'task' && modal.taskId ? state.tasks.find((task) => task.id === modal.taskId) : undefined;
  const priceProject = modal?.kind === 'prices' ? projectMap.get(modal.projectId) : undefined;
  const inventoryProject = modal?.kind === 'inventory' && modal.projectId ? projectMap.get(modal.projectId) : undefined;

  return <div className="app-shell" data-theme={state.settings.theme || 'forge'}>
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Hammer size={19} /></div><div><strong>Albion</strong><span>FORGE LEDGER</span></div></div><div className="sidebar-label">WORKSPACE</div><nav>{(['Dashboard', 'Projects', 'History', 'Materials', 'Buy Orders', 'Tasks', 'Enchant Craft', 'Settings'] as Screen[]).map((destination) => <button key={destination} className={`nav-link ${screen === destination ? 'active' : ''}`} onClick={() => nav(destination)}><IconForScreen screen={destination} /><span>{destination}</span>{destination === 'Tasks' && openTaskCount > 0 && <em>{openTaskCount}</em>}</button>)}</nav><div className="sidebar-spacer" /><div className="server-card"><div className="server-dot" /><span><strong>{state.settings.server === 'west' ? 'Americas' : state.settings.server === 'east' ? 'Asia' : 'Europe'} server</strong><small>{state.settings.priceCity} price city</small></span><button className="icon-button small" title="Market settings" onClick={() => nav('Settings')}><Settings2 size={14} /></button></div><div className="sidebar-foot">Local planner · data stays in this browser</div></aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb">Albion Forge Ledger <span>/</span> {heading}</div><div className="topbar-right"><label className="theme-quick-switch"><Palette size={14} /><span className="sr-only">Interface style</span><select aria-label="Interface style" value={state.settings.theme || 'forge'} onChange={(event) => setState((previous) => ({ ...previous, settings: { ...previous.settings, theme: event.target.value as NonNullable<AppState['settings']['theme']> } }))}><option value="forge">Forge Night</option><option value="vellum">Vellum Ledger</option><option value="exchange">Caerleon Exchange</option><option value="bloodmoon">Bloodmoon Arsenal</option></select></label><span className="data-status"><span /> Saved locally</span><button className="button button-outline button-sm" onClick={() => setModal({ kind: 'project' })}><Plus size={14} /> New project</button></div></header><div className="page-content"><div className="page-heading"><div><h1>{heading}</h1><p>{subtitle}</p></div>{screen === 'Projects' && !selectedProject && <div className="page-heading-actions"><button className="button button-outline" onClick={() => nav('Enchant Craft')}><Sparkles size={15} /> Enchant Craft</button><button className="button button-primary" onClick={() => setModal({ kind: 'project' })}><Plus size={15} /> New project</button></div>}{screen === 'Buy Orders' && <div className="page-heading-actions"><button className="button button-outline" onClick={() => setModal({ kind: 'purchase', marketListing: true })}><Coins size={15} /> Buy from Market</button><button className="button button-primary" onClick={() => setModal({ kind: 'order' })}><ShoppingCart size={15} /> Create Buy Order</button></div>}{screen === 'Tasks' && <button className="button button-primary" disabled={!state.projects.length} onClick={() => openTaskModal()}><Plus size={14} /> Add task</button>}</div>{renderScreen()}</div>
    </main>
    {toast && <div className="toast"><span><CheckCircle2 size={16} /></span>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}
    {modal?.kind === 'sale' && saleProject && <RecordSaleModal key={`sale-${saleProject.id}`} project={saleProject} onClose={() => setModal(null)} onSave={(sale) => recordSale(saleProject, sale)} />}
    {modal?.kind === 'project' && <ProjectModal key={modal.projectId || 'new-project'} state={state} project={modalProject} onClose={() => setModal(null)} onSave={saveProject} />}
    {modal?.kind === 'purchase' && <PurchaseModal key={`${modal.projectId || 'shared'}-${modal.material?.id || ''}-${modal.marketListing ? 'listing' : 'purchase'}`} state={state} projects={state.projects} projectId={modal.projectId} material={modal.material} marketListing={modal.marketListing} onClose={() => setModal(null)} onSave={savePurchase} />}
    {modal?.kind === 'order' && (ownerForOrder || orderForModal || repeatOrderForModal || (!modal.orderId && !modal.repeatOrderId)) && <OrderModal key={orderForModal?.id || modal.repeatOrderId || `${ownerForOrder?.id || 'choose-project'}-${modal.material?.id || ''}`} state={state} projects={state.projects} project={ownerForOrder} material={modal.material} order={orderForModal} repeatFrom={repeatOrderForModal} onClose={() => setModal(null)} onSave={saveOrder} onRememberCity={(city) => setState((previous) => ({ ...previous, settings: { ...previous.settings, lastBuyOrderCity: city } }))} />}
    
    {modal?.kind === 'receive' && receiveOrder && <ReceiveModal key={receiveOrder.id} order={receiveOrder} onClose={() => setModal(null)} onSave={(quantity, unitPrice, date, notes, confirmationId) => confirmReceipt(receiveOrder, quantity, unitPrice, date, notes, confirmationId)} />}
    {modal?.kind === 'orderCheck' && orderCheck && <OrderCheckModal key={orderCheck.id} state={state} order={orderCheck} projectName={orderOwnerLabel(orderCheck)} onClose={() => setModal(null)} onEdit={() => { const owner = orderCheck.projectId ? projectMap.get(orderCheck.projectId) : undefined; if (owner) setModal({ kind: 'order', projectId: owner.id, material: projectMaterials(state, owner, catalog).find((entry) => entry.id === orderCheck.materialId), orderId: orderCheck.id }); else if (!orderCheck.projectId) setModal({ kind: 'order', orderId: orderCheck.id }); else setToast('This order belongs to a removed project and cannot be edited.'); }} onReceive={() => setModal({ kind: 'receive', orderId: orderCheck.id })} onCancel={() => cancelOrder(orderCheck.id)} onArchive={() => { archiveOrder(orderCheck.id); setModal(null); }} onReverse={() => reverseLatestOrderReceipt(orderCheck)} onRepeat={() => setModal({ kind: 'order', projectId: orderCheck.projectId, repeatOrderId: orderCheck.id })} />}
    {modal?.kind === 'orderHistory' && historyOrder && <BuyOrderHistoryModal key={historyOrder.id} state={state} order={historyOrder} projectName={orderOwnerLabel(historyOrder)} onClose={() => setModal(null)} />}
    {modal?.kind === 'task' && state.projects.length > 0 && <TaskModal key={modal.taskId || `new-${modal.projectId || ''}`} state={state} task={taskForModal} projectId={modal.projectId} onClose={() => setModal(null)} onSave={saveTask} />}
    {modal?.kind === 'prices' && priceProject && <PriceModal key={`${priceProject.id}-${modal.material.id}`} state={state} project={priceProject} material={modal.material} onClose={() => setModal(null)} onRefresh={(ids) => void refreshPrices(ids)} onSaveManual={(value) => saveManualPrice(priceProject.id, modal.material.id, value)} refreshing={refreshing} />}
    {modal?.kind === 'allocation' && <AllocationModal state={state} materialId={modal.materialId} materialName={modal.materialName} preferredProjectId={modal.projectId} onClose={() => setModal(null)} onSave={saveAllocation} />}
    {modal?.kind === 'inventory' && (!modal.projectId || inventoryProject) && <QuickInventoryModal key={inventoryProject?.id || 'shared-inventory'} state={state} project={inventoryProject} onClose={() => setModal(null)} onSave={(material, quantity, shared) => { saveInventoryQuantity(inventoryProject, material, quantity, shared); setModal(null); }} />}
  </div>;
}
