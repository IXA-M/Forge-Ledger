import { emptyState, today, validateState, type AppState } from './domain';
import { createDefaultEnchantCraftState, migrateLegacyCalculatorData, normalizeEnchantCraftState, validateEnchantCraftState } from './features/enchantCraft/validation';

export const STORAGE_KEY = 'albion-crafting-planner.v1';
const DAILY_BACKUP_DB = 'forge-ledger-daily-backups';
const DAILY_BACKUP_STORE = 'snapshots';
const DAILY_BACKUP_LIMIT = 30;

export type DailyBackup = { date: string; savedAt: string; projectCount: number; state: AppState };

function hasUserData(state: AppState) {
  return state.projects.length > 0 || state.purchases.length > 0 || state.allocations.length > 0
    || state.orders.length > 0 || state.sessions.length > 0 || state.tasks.length > 0
    || Boolean(state.inventoryBalances?.length) || Object.keys(state.prices).length > 0
    || Object.keys(state.manualPrices).length > 0;
}

function openBackupDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('This browser does not support local daily backups.'));
    const request = indexedDB.open(DAILY_BACKUP_DB, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DAILY_BACKUP_STORE)) {
        database.createObjectStore(DAILY_BACKUP_STORE, { keyPath: 'date' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open daily backups.'));
  });
}

export async function createDailyBackup(state: AppState, date = today()): Promise<void> {
  const database = await openBackupDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(DAILY_BACKUP_STORE, 'readwrite');
      const store = transaction.objectStore(DAILY_BACKUP_STORE);
      const read = store.get(date);
      read.onsuccess = () => {
        // Keep that day's first snapshot so accidental edits later in the day
        // can be rolled back to the known starting point. Replace an initial
        // empty launch snapshot if the user adds data later that same day.
        const previous = read.result as DailyBackup | undefined;
        if (!previous || (!hasUserData(previous.state) && hasUserData(state))) {
          store.put({ date, savedAt: new Date().toISOString(), projectCount: state.projects.length, state } satisfies DailyBackup);
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not create a daily backup.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Daily backup was cancelled.'));
    });
    await pruneDailyBackups(database);
  } finally {
    database.close();
  }
}

async function pruneDailyBackups(database: IDBDatabase) {
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DAILY_BACKUP_STORE, 'readwrite');
    const store = transaction.objectStore(DAILY_BACKUP_STORE);
    const request = store.getAllKeys();
    request.onsuccess = () => {
      const dates = request.result.map(String).sort().reverse();
      dates.slice(DAILY_BACKUP_LIMIT).forEach((date) => store.delete(date));
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not rotate old backups.'));
  });
}

export async function listDailyBackups(): Promise<DailyBackup[]> {
  const database = await openBackupDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(DAILY_BACKUP_STORE, 'readonly');
      const request = transaction.objectStore(DAILY_BACKUP_STORE).getAll();
      request.onsuccess = () => resolve((request.result as DailyBackup[])
        .filter((backup) => backup && typeof backup.date === 'string' && validateState(backup.state))
        .sort((a, b) => b.date.localeCompare(a.date)));
      request.onerror = () => reject(request.error ?? new Error('Could not read daily backups.'));
    });
  } finally {
    database.close();
  }
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyState();
    const rawState = parsed as AppState;
    // A damaged optional calculator record should not hide the user's existing Forge data.
    const normalizedEnchant = normalizeEnchantCraftState(rawState.enchantCraft);
    const base = { ...rawState, enchantCraft: validateEnchantCraftState(normalizedEnchant) ? normalizedEnchant : createDefaultEnchantCraftState() };
    if (!validateState(base)) return emptyState();
    let normalized = base;
    // Earlier versions assigned an order receipt directly to its project. Keep
    // the order as its history link, but move the acquired units into shared stock.
    if (normalized.purchases.some((purchase) => purchase.orderId && purchase.projectId != null)) {
      normalized = { ...normalized, purchases: normalized.purchases.map((purchase) => purchase.orderId ? { ...purchase, projectId: null } : purchase) };
    }
    // A same-origin legacy calculator may be available when both apps ran under
    // the same browser origin. Import it once and retain the source keys.
    if (!normalized.enchantCraft?.legacyImportedAt) {
      const savedRaw = localStorage.getItem('crafting-cost-calculator-items');
      const planRaw = localStorage.getItem('crafting-cost-calculator-plan');
      if (savedRaw || planRaw) {
        let saved: unknown = [];
        let plan: unknown = [];
        try { saved = savedRaw ? JSON.parse(savedRaw) : []; } catch { /* keep safe empty legacy list */ }
        try { plan = planRaw ? JSON.parse(planRaw) : []; } catch { /* keep safe empty legacy list */ }
        normalized = { ...normalized, enchantCraft: migrateLegacyCalculatorData(normalized.enchantCraft || createDefaultEnchantCraftState(), saved, plan) };
      }
    }
    return normalized;
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
