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
src/
  App.tsx                       App state, navigation, and page composition
  components/                   Shared controls and reusable row/table UI
  data/catalog.ts               Catalog display names and fame-factor enrichment
  features/dialogs/              Project, purchase, order, and inventory dialogs
  features/settings/             Market, crafting, and backup settings
  utils/formatting.ts             Shared display formatting
  domain.ts                      Shared types and crafting/inventory calculations
  market.ts                      Albion market snapshot requests
  storage.ts                     Local storage and exports
  styles.css                     Existing application styles
  App.test.tsx                   App mount and project-dialog smoke test
  domain.test.ts                 Domain and accounting tests
```

The app entry point is `src/main.tsx`. Screen navigation and app-wide state are coordinated in `src/App.tsx`; feature dialogs and reusable display components are kept in their own modules. Core calculations and shared data types belong in `src/domain.ts`, while browser persistence stays in `src/storage.ts`.

There is no separate lint command configured. `npm.cmd run build` runs the TypeScript project check before creating the production bundle. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the state flow and a quick guide to common changes.
