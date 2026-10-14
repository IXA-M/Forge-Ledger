import React from 'react';
import { AlertCircle, Archive, ArrowLeft, ArrowUpRight, BadgeCheck, CalendarDays, Check, CheckCircle2, ClipboardList, Clock3, Coins, ExternalLink, Hammer, MapPin, PackageCheck, PackagePlus, Plus, RefreshCw, Settings2, ShieldCheck, ShoppingCart, Sparkles, Target, Trash2, TrendingUp, Wallet, X } from 'lucide-react';
import { catalog, catalogById, displayMaterialName } from '../data/catalog';
import { ItemIcon, ModalShell, Progress, StatusBadge } from './SharedUi';
import { hasUsableManualBuy, materialUnpricedCount, projectDisplayName, projectProductIcon, projectProductName } from '../features/dialogs/PlannerDialogs';
import { updatedLabel } from '../utils/formatting';
import {
  formatItemName, formatNumber, formatSilver, formatTier, getOrderStatus, getPriceFreshness, journalPlan, manualPriceKey,
  isProjectCompleted, materialReadiness, projectMaterialCost, projectMaterials, projectReturnRate, priceKey, recipeFor, recipeRequirements, today,
  type AppState, type BuyOrder, type CatalogItem, type CraftSession, type Material, type MaterialShortageSummary, type MaterialSummary, type Project, type Task,
} from '../domain';
export function JournalPlanner({ project, item, sessions, onUpdate }: { project: Project; item?: CatalogItem; sessions: CraftSession[]; onUpdate: (patch: Partial<Project>) => void }) {
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

export function MetricCard({ label, value, sub, icon, tone = '' }: { label: string; value: string; sub: string; icon: React.ReactNode; tone?: string }) {
  return <article className={`metric-card ${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong>{value}</strong><small>{sub}</small></article>;
}

export function ProjectCard({ project, state, onOpen }: { project: Project; state: AppState; onOpen: (id: string) => void }) {
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

export function TaskRow({ task, projectName, onToggle, onEdit, onDelete }: { task: Task; projectName: string; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const overdue = !task.completed && !!task.dueDate && task.dueDate < today();
  return <div className={`task-row ${task.completed ? 'task-complete' : ''}`}><button className={`task-check ${task.completed ? 'checked' : ''}`} aria-label={task.completed ? 'Mark task incomplete' : 'Mark task complete'} onClick={onToggle}>{task.completed && <Check size={13} />}</button><div className="task-content"><strong>{task.title}</strong><p>{task.description || task.notes || projectName}</p><div className="task-meta"><span>{projectName}</span>{task.dueDate && <span className={overdue ? 'overdue' : ''}><CalendarDays size={12} /> {overdue ? 'Overdue · ' : ''}{new Date(`${task.dueDate}T00:00:00`).toLocaleDateString()}</span>}<span className={`priority-text priority-${task.priority.toLowerCase()}`}>{task.priority}</span></div></div><div className="task-actions"><button className="icon-button small" aria-label="Edit task" onClick={onEdit}><Settings2 size={14} /></button><button className="icon-button small danger" aria-label="Delete task" onClick={onDelete}><Trash2 size={14} /></button></div></div>;
}

export function MaterialTable({ state, project, rows, onPurchase, onOrder, onPrices, onResolvePrice }: { state: AppState; project: Project; rows: MaterialSummary[]; onPurchase: (material: Material) => void; onOrder: (material: Material) => void; onPrices: (material: Material) => void; onResolvePrice: (materialId: string, materialName: string) => void }) {
  const recipe = recipeFor(project, catalog).recipe;
  return <div className="table-wrap"><table className="data-table material-table"><thead><tr><th>Material</th><th>Raw recipe / item</th><th>Project total</th><th>Acquired / reserved</th><th>Consumed</th><th>Available</th><th>Still needed</th><th>On orders</th><th>Avg. paid</th><th>Estimate / remaining</th><th /></tr></thead><tbody>{rows.map((row) => { const progress = row.required ? Math.min(100, row.acquired / row.required * 100) : 0; const price = state.prices[priceKey(row.id, state.settings.priceCity, state.settings.marketQuality)]; const manual = state.manualPrices[manualPriceKey(project.id, row.id)]; const priceSide = row.estimatePriceSide === 'sell' ? 'sell' : 'buy'; const freshness = getPriceFreshness(price, state.settings.freshMinutes, Date.now(), priceSide); const staleAuto = row.estimateSource === 'AUTO' && freshness.endsWith('Stale'); const estimateBadge = hasUsableManualBuy(manual) ? 'MANUAL' : freshness; const unpricedCount = materialUnpricedCount(state, row.id); return <tr key={row.id}><td><div className="material-label"><ItemIcon id={row.id} size={34} /><span><strong>{row.name}</strong></span></div></td><td>{formatNumber((recipe?.materials.filter((material) => material.id === row.id).reduce((sum, material) => sum + material.count, 0) || 0) / (recipe?.outputCount || 1))}</td><td>{formatNumber(row.required)}</td><td><strong>{formatNumber(row.acquired)}</strong><div className="mini-progress"><Progress value={progress} /></div></td><td>{formatNumber(row.consumed)}</td><td><span className={row.available > 0 ? 'qty-available' : ''}>{formatNumber(row.available)}</span></td><td><strong className={row.missing > 0 ? 'qty-missing' : 'qty-available'}>{formatNumber(row.missing)}</strong></td><td><span>{formatNumber(row.orderRemaining)} unfilled</span><small className="cell-sub">{formatNumber(row.orderAcquired)} acquired via orders</small><small className="cell-sub">{formatNumber(row.awaitingReceipt)} to collect</small><small className="cell-sub">{formatNumber(row.notCovered)} not covered</small></td><td>{row.weightedAverage == null ? '—' : formatSilver(row.weightedAverage)}{unpricedCount > 0 && <button className="price-warning-link" onClick={() => onResolvePrice(row.id, row.name)}>⚠ {unpricedCount} zero / unknown price record{unpricedCount === 1 ? '' : 's'} · set default</button>}</td><td><div className="price-cell"><strong>{row.nextPurchaseEstimate == null ? 'Unavailable' : <>{formatSilver(row.nextPurchaseEstimate)}{staleAuto && <AlertCircle size={13} className="auto-price-stale-icon" aria-label="Automatic price is stale" />}</>}</strong><StatusBadge value={estimateBadge} /><small className="cell-sub">Remaining · {formatSilver(row.remainingEstimatedCost)}</small><small className="cell-sub">{hasUsableManualBuy(manual) ? `Manual · ${updatedLabel(manual!.updatedAt)}` : `Auto · ${updatedLabel(price?.buyAt)}`}</small></div></td><td><div className="table-actions"><button className="icon-button small" title="Compare prices / edit estimate" onClick={() => onPrices(row)}><TrendingUp size={15} /></button><button className="icon-button small" title="Record acquired batch" onClick={() => onPurchase(row)}><PackagePlus size={15} /></button><button className="icon-button small" aria-label={`Create buy order for ${row.name}`} title="Create Buy Order" onClick={() => onOrder(row)}><ShoppingCart size={15} /></button></div></td></tr>; })}{!rows.length && <tr><td colSpan={11}><div className="table-empty">This recipe has no resource requirements in the current catalog.</div></td></tr>}</tbody></table></div>;
}

export function OrderRow({ state, order, onEdit, onReceive, onCancel, onArchive, onReverse, onRepeat }: { state: AppState; order: BuyOrder; onEdit: () => void; onReceive: () => void; onCancel: () => void; onArchive: () => void; onReverse?: () => void; onRepeat?: () => void }) {
  const status = getOrderStatus(order);
  const remaining = Math.max(0, order.quantity - order.received);
  const unfulfilled = Math.max(0, order.quantity - order.fulfilled);
  const receivedPending = Math.max(0, order.fulfilled - order.received);
  const progress = order.quantity ? order.received / order.quantity * 100 : 0;
  const canConfirm = !order.archived && (order.cancelled ? receivedPending > 0 : order.mode === 'Active' || order.received > 0 || receivedPending > 0);
  return <div className={`order-row ${status === 'Partially Fulfilled' ? 'order-partial' : ''}`}><div className="order-main"><ItemIcon id={order.materialId} size={40} /><div className="order-title"><strong>{displayMaterialName(order.materialId, order.materialName)}</strong><div className="order-meta"><span className="order-city-chip"><MapPin size={13} />{order.city}</span><span>{formatSilver(order.unitPrice)} / unit</span>{(order.setupFees || 0) > 0 && <span>{formatSilver(order.setupFees || 0)} setup fee</span>}{order.unitPrice === 0 && !order.zeroPriceConfirmed && <span className="price-warning">Zero price needs review</span>}<span>Placed {order.placedAt || 'date unknown'}</span></div></div><div className="order-progress-block"><div className="order-progress-label"><strong>{formatNumber(order.received)} <span>of {formatNumber(order.quantity)} bought</span></strong><span>{Math.round(progress)}%</span></div><Progress value={progress} tone="gold" /><small>{formatNumber(remaining)} left to buy{receivedPending > 0 ? ` · ${formatNumber(receivedPending)} filled in-game, awaiting pickup` : unfulfilled > 0 ? ` · ${formatNumber(unfulfilled)} not yet filled` : ''}</small></div><div className="order-status"><StatusBadge value={status.toUpperCase()} /></div><div className="order-actions"><div className="order-action-main"><button className="button button-outline button-sm" onClick={onEdit}>Edit</button>{canConfirm && remaining > 0 && <button className="button button-primary button-sm" onClick={onReceive}>Add bought quantity</button>}{onRepeat && order.received >= order.quantity && <button className="button button-primary button-sm" onClick={onRepeat}>Repeat order</button>}</div><div className="order-action-secondary">{onReverse && order.received > 0 && <button className="button button-quiet button-sm" onClick={onReverse}>Undo last</button>}{!order.cancelled && !order.archived && remaining > 0 && <button className="button button-quiet button-sm" onClick={onCancel}>Cancel order</button>}{!order.archived && (order.cancelled || status === 'Fulfilled') && <button className="button button-quiet button-sm" onClick={onArchive}><Archive size={13} /> Archive</button>}</div></div></div>{order.notes && <p className="order-notes">{order.notes}</p>}</div>;
}

export function OrderCheckModal({ state, order, projectName, onClose, onEdit, onReceive, onCancel, onArchive, onReverse, onRepeat }: { state: AppState; order: BuyOrder; projectName: string; onClose: () => void; onEdit: () => void; onReceive: () => void; onCancel: () => void; onArchive: () => void; onReverse: () => void; onRepeat: () => void }) {
  return <ModalShell title="Daily buy-order check" subtitle={`${order.city} · ${displayMaterialName(order.materialId, order.materialName)} · ${projectName}`} onClose={onClose} wide>
    <div className="order-check-modal-body"><p>Check this order in Albion Online, then update its status here. Enter the current number of units still left on the order. The planner calculates the quantity bought since your previous check.</p>
      <OrderRow state={state} order={order} onEdit={onEdit} onReceive={onReceive} onCancel={onCancel} onArchive={onArchive} onReverse={onReverse} onRepeat={onRepeat} />
    </div>
  </ModalShell>;
}

export function ShortageOverviewRow({ row }: { row: MaterialShortageSummary }) {
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

