import { emptyState, validateState, type AppState } from './domain';

export const STORAGE_KEY = 'albion-crafting-planner.v1';

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed: unknown = JSON.parse(raw);
    if (!validateState(parsed)) return emptyState();
    // Earlier versions assigned an order receipt directly to its project. Keep
    // the order as its history link, but move the acquired units into shared stock.
    if (parsed.purchases.some((purchase) => purchase.orderId && purchase.projectId != null)) {
      return { ...parsed, purchases: parsed.purchases.map((purchase) => purchase.orderId ? { ...purchase, projectId: null } : purchase) };
    }
    return parsed;
  } catch {
    return emptyState();
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function downloadBlob(name: string, content: BlobPart, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportPurchasesCsv(state: AppState) {
  const quote = (value: string | number | null | undefined) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [
    ['Date', 'Project', 'Material', 'City', 'Quantity', 'Actual unit price', 'Total cost', 'Notes'],
    ...state.purchases.map((purchase) => [
      purchase.date,
      state.projects.find((project) => project.id === purchase.projectId)?.name || (purchase.projectId == null ? 'Shared inventory' : 'Deleted project'),
      purchase.materialName, purchase.city, purchase.quantity * (purchase.reversesPurchaseId ? -1 : 1), purchase.unitPrice,
      purchase.unitPrice == null ? '' : purchase.quantity * purchase.unitPrice * (purchase.reversesPurchaseId ? -1 : 1),
      purchase.reversesPurchaseId ? `Reversal of ${purchase.reversesPurchaseId}: ${purchase.notes}` : purchase.notes,
    ]),
  ];
  downloadBlob('albion-purchase-history.csv', rows.map((row) => row.map(quote).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
