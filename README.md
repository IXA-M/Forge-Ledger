# Albion Crafting Planner

A local browser app for Albion Online crafting projects, material acquisition, city buy orders, crafting sessions, and task tracking.

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
