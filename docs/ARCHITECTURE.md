# Architecture

Forge Ledger is a small React and TypeScript single-page app. It has no server-side account or database layer: the browser owns the saved planner state, while catalog and crafting-fame data are bundled JSON files.

## Main responsibilities

- `src/main.tsx` mounts the React app.
- `src/App.tsx` owns the current screen, selected project, modal state, app-wide planner state, and the callbacks that save user changes. It composes each screen from the app's existing UI and feature components.
- `src/features/dialogs/PlannerDialogs.tsx` contains the project, purchase, buy-order, price, allocation, and inventory dialogs. Project display names and price-review helpers used by those flows are exported here for reuse.
- `src/features/settings/SettingsPage.tsx` contains market preferences, crafting assumptions, and backup/restore controls.
- `src/features/enchantCraft/` contains the native Enchant Craft workspace, validated calculator state, legacy import, and pure quality/material/food/profit estimates. Estimates remain isolated from acquisitions. An explicit create-project action stores the .0 recipe plus enchantment materials on a regular Forge project so existing inventory, shortage, order, and completion flows remain the source of truth.
- `src/components/` contains shared controls and repeated display elements such as the item picker, modal frame, progress bar, project cards, material rows, and order rows.
- `src/data/catalog.ts` enriches the bundled recipe catalog with display-ready material names and crafting-fame factors. It also provides the catalog lookup map.
- `src/domain.ts` defines persisted state types and contains pure project, inventory, material, order, price, and journal calculations.
- `src/storage.ts` loads and saves browser local storage and handles backup and purchase-history exports.
- `src/market.ts` fetches optional market-price snapshots. Market responses update price estimates; they are separate from recorded purchases.
- `src/utils/formatting.ts` holds shared labels for item quality and timestamps.
- `src/styles.css` holds the current global layout and visual styles.
- `scripts/Start-ForgeLedger.ps1` starts Vite directly through Node, reuses an already-running local copy, and opens the browser. `scripts/Stop-ForgeLedger.ps1` stops a server started by the shortcut. `scripts/Create-DesktopShortcuts.ps1` creates the Windows shortcuts and their app icon.

## Data flow and persistence

`App` loads state once through `loadState()` and saves updated state through `saveState()` whenever React state changes. User actions call app callbacks, which create a new state object; the domain functions provide the accounting and requirement calculations those callbacks and views use. Views derive material readiness, shortages, costs, and order status from the current state rather than storing duplicate totals.

State uses the existing `albion-crafting-planner.v1` browser storage key. Enchant Craft calculator data and per-project enchant details/material requirements are optional fields so old Forge saves continue to load. Same-origin legacy calculator localStorage keys are copied once without deleting their source. The feature also supports a dedicated JSON format, while full Forge backups include the calculator state. The Settings screen validates a full backup before restoring it. Keep that key and the persisted object shape stable when making structural changes; implement and test migrations separately.

## Common changes

- Change crafting, inventory allocation, readiness, or order accounting in `src/domain.ts`, and add a focused test in `src/domain.test.ts`.
- Change a dialog's inputs or validation in `src/features/dialogs/PlannerDialogs.tsx`.
- Change a repeated material or buy-order display in `src/components/PlannerRows.tsx`.
- Change a shared control such as the item search, modal frame, or progress bar in `src/components/`.
- Change settings or backup interactions in `src/features/settings/SettingsPage.tsx`.
- Change calculator calculations in `src/features/enchantCraft/calculations.ts`, field validation and migration in `validation.ts`, and the workspace in `EnchantCraftPage.tsx`.
- Change optional API request behavior in `src/market.ts`.
- Change how planner state is loaded, saved, or exported in `src/storage.ts`.
- Change layout or colors in `src/styles.css`; keep component class names intact unless the corresponding styles are updated too.
- Refresh bundled recipe and item data with `npm.cmd run update:data`.

## Checks

Run `npm.cmd test` for the domain/accounting suite and the app mount/dialog smoke test. Run `npm.cmd run build` for TypeScript checking and the production build. The project does not currently define a separate lint script.
