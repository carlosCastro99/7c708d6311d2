# MX-Inventory

An offline-first Progressive Web App for conducting physical stock inventories on a factory floor — counting by zone and material, multi-pass reconciliation, CSV export, and full backup/restore. See `docs/superpowers/specs/2026-07-29-mx-inventory-design.md` for the original design and `docs/superpowers/specs/2026-07-30-mx-inventory-integration-design.md` for the Phase 2 integration design.

## Running locally

```bash
npm install
npm run dev
```

Opens a dev server at `http://localhost:5173`. The app works fully offline once loaded — no backend, no network calls; all data lives in the browser's IndexedDB.

## Testing

```bash
npm test        # run the full Vitest suite once
npm run build   # type-check (tsc -b) and produce a production build in dist/
```

## Deployment

`npm run build` produces a static `dist/` folder. Any static host works, with one requirement: **the host must serve `index.html` for any unknown path** (a "SPA fallback" / "history API fallback"), since navigation is client-side via React Router. Without this, refreshing the browser on a route like `/inventory/abc123/pass/def456` will 404 instead of loading the app.

The app is installable via "Add to Home Screen" on Android and iOS (no app store required), and functions offline after the first load thanks to the generated service worker (`vite-plugin-pwa`).

## Data model

```
Inventory ──1:N──> InventoryPass ──1:N──> ZoneCount ──1:N──> MaterialCountLine ──1:N──> CountAuditEntry
```

- **Inventory**: one physical stock count. Status: `in_progress` → (`closed_single_pass` | `needs_3rd_pass` → `successful`).
- **InventoryPass**: one full counting pass (1, 2, or optionally 3) through the inventory's zones.
- **ZoneCount**: one zone's count within one pass. Locked (`closed`) when the worker finishes that zone.
- **MaterialCountLine**: one material's counted quantity within one zone count. Every edit appends a `CountAuditEntry` (old value → new value), never overwrites silently.
- **ReopenLog**: records who reopened a closed Zone/Pass/Inventory, when, and why — the only sanctioned way to edit after closing.
- **Zone**, **Material**, **UnitOfMeasure**, **User**: master data, reused across inventories.
- **ExpectedQuantity**: optional book-stock value per Zone+Material, imported from CSV, used for variance highlighting and "not counted" detection.

Reconciliation rule: after passes 1 and 2 both close, the app compares them automatically. If every line matches, the inventory closes as `successful`. If any line mismatches, a scoped third pass re-counts *only* those lines — if pass 3 matches either pass 1 or pass 2, that value is official; if all three differ, a supervisor enters a final value with a required reason.

## Key directories

- `src/db/` — Dexie (IndexedDB) schema, entity types, and per-entity repositories (all writes go through these, never raw `db.table.put()` from a page).
- `src/domain/` — pure business logic with no DB or DOM dependency: reconciliation rules, CSV building/parsing, backup zip format.
- `src/pages/` — one file per screen; each takes plain props and callbacks, no router awareness (router-aware wrapper components live in `src/App.tsx`).
- `src/context/CountingSession.tsx` — tracks which inventory/pass/zone/material a worker is currently counting, persisted to `localStorage` so it survives a backgrounded/refreshed phone. This is a navigation aid only — actual counted data always lives in IndexedDB via the repositories above.
