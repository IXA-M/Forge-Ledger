# Albion Forge Ledger

This is a browser app for Albion Online crafting projects, material acquisition, city buy orders, crafting sessions, and task tracking, its intended for personal use but you can also use it.

## Run it

Requirements: Node.js 20 or newer and npm.

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite. Project data is saved in this browser's local storage. Use **Settings → Export full backup** to keep a portable JSON backup. **Restore from JSON** replaces the saved browser data after confirmation. Purchase history can also be exported as CSV.

For a production build:

```powershell
npm.cmd run build
npm.cmd run preview
```

Run the core calculation and accounting checks with `npm.cmd test`.

## Enchant Craft estimates

Open **Enchant Craft** from the workspace navigation to estimate enchant crafting costs, Brecilien rune/soul/relic sell quotes, quality rerolls, food, tax, and projected profit. Forge recipe data and custom material rows are both supported, with RRR applied only to materials marked returnable. Market and saved-setup values remain estimates and never record purchases or reserve inventory. From **Projects**, open **Enchant Craft** and use **Create Forge project** to turn the selected .0 recipe, target enchantment, and Rune/Soul/Relic needs into one normal Forge project. That project appears in the project list and uses the existing materials, inventory, buy-order, and completion workflows. From a project detail page, **Use in Enchant Craft** opens a read-only estimate based on that project. Calculator presets, plan entries, and the current form are included in Forge backups. Calculator data can also be exported or imported independently. Same-origin legacy calculator browser data is imported when available. If the old HTML used a separate `file://` origin, open its browser developer console and copy its saved data as JSON, then import that file in Forge:

```js
copy(JSON.stringify({
  savedItems: JSON.parse(localStorage.getItem('crafting-cost-calculator-items') || '[]'),
  plannedItems: JSON.parse(localStorage.getItem('crafting-cost-calculator-plan') || '[]')
}, null, 2))
```

Paste the copied text into a `.json` file. The importer accepts that legacy shape and preserves existing Forge data. Prices are Albion Online Data Project snapshots, not live guarantees.

## Start it from the desktop on Windows

Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Create-DesktopShortcuts.ps1` once. This creates **Albion Forge Ledger** and **Stop Albion Forge Ledger** shortcuts on your Windows Desktop. After that, double-click the first shortcut to start the local app and open it in your default browser; the server runs in the background without leaving a terminal window open. Click the Stop shortcut when you are finished. The first launch installs dependencies automatically if needed. Startup logs are saved under `%LOCALAPPDATA%\AlbionForgeLedger`.

You can also run `scripts\Start-ForgeLedger.ps1` directly. The launcher reuses an existing Forge Ledger server when it finds one and checks a range of local ports so it can avoid common port conflicts.

## Recipe data

The bundled `src/catalog.json` was generated from the maintained [`ao-data/ao-bin-dumps`](https://github.com/ao-data/ao-bin-dumps) game data export. It contains the English item names and all source crafting requirements available in the export, with recipe alternatives, yields, enchanted variants, and non-returnable materials kept separate. Recipe data is separate from saved project data.

Refresh the catalog with:

```powershell
npm.cmd run update:data
```

The updater downloads the source item export and its formatted names, then rebuilds the compact catalog. The catalog includes items for which the source provides resource crafting requirements; items without resource ingredients are omitted. This third-party game data can lag patches. The app does not claim the exported recipe data has been independently verified against every in-game station.

## Market prices

Optional city snapshots come from the Albion Online Data Project API (`west`, `east`, or `europe`). A manual refresh requests the selected item quality for configured cities; quality prices are cached separately, and enchanted item IDs remain distinct. Automatic refresh is off by default and can be enabled in Settings. Every price shows its city, quality, source status, and timestamp when supplied. Missing results remain **UNAVAILABLE**; unknown timestamps are **AUTO — Unverified**. Saved prices are retained when a refresh fails. The app never calls market snapshots real-time, and market values are not treated as actual purchase records.

Optional extra purchase costs affect only future cost estimates and planned order totals. The default is 0%; recorded transaction costs change only when you enter actual unit prices.

## Data handling

All project records live in local storage for the current browser profile. They do not sync between browsers or devices. Browser storage can be cleared outside the app, so export backups regularly. Icons load from Albion's public item render service; planning and saved data continue to work without icons or market access.

## Project structure

```text
.
  scripts/                       Catalog update and Windows desktop launch helpers
  src/
    App.tsx                      App state, navigation, and page composition
    components/                  Shared controls and reusable row/table UI
    data/catalog.ts              Catalog display names and fame-factor enrichment
    features/dialogs/             Project, purchase, order, and inventory dialogs
    features/settings/            Market, crafting, and backup settings
    features/enchantCraft/         Calculator estimates, presets, plan and migration
    utils/formatting.ts            Shared display formatting
    domain.ts                     Shared types and crafting/inventory calculations
    market.ts                     Albion market snapshot requests
    storage.ts                    Local storage and exports
    styles.css                    Existing application styles
    App.test.tsx                  App mount and project-dialog smoke test
    domain.test.ts                Domain and accounting tests
```

The app entry point is `src/main.tsx`. Screen navigation and app-wide state are coordinated in `src/App.tsx`; feature dialogs and reusable display components are kept in their own modules. Core calculations and shared data types belong in `src/domain.ts`, while browser persistence stays in `src/storage.ts`.

There is no separate lint command configured. `npm.cmd run build` runs the TypeScript project check before creating the production bundle. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the state flow and a quick guide to common changes.
