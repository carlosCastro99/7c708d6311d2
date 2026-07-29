# MX-Inventory — Offline Factory Stock Inventory Tool

**Date:** 2026-07-29
**Status:** Approved design, pending implementation plan

## 1. Purpose

An installable, fully offline mobile web app for conducting physical stock inventories on the floor of a raw paper factory. Workers count materials by zone, using a large "+1" counter, with support for multi-pass reconciliation (2 matching passes = success, a 3rd pass resolves disagreements), photo documentation, CSV export, and a path toward future SAP integration.

## 2. Scope decisions

- **One device drives one inventory at a time.** No multi-device sync/merge in this version. Data can be moved between devices only via manual export/import.
- **User identity** is a simple local profile picker (name only, no password) — the phone itself is the security boundary.
- **Fully offline, no backend/server.** All data lives in the browser's local storage on-device. The only way data leaves the device is CSV export or a manual full-backup file.
- **Lot/batch tracking is out of scope.** MaterialCountLine tracks one quantity per Zone+Material per pass.
- **SAP integration is not built now** — the data model reserves optional fields so a later integration doesn't require a rework (see §7).

## 3. Architecture & Tech Stack

- **Type of app:** Installable Progressive Web App (PWA). No app store distribution — installed via "Add to Home Screen" from a browser, on Android or iOS, working around the constraint of no store access while still being installable.
- **Framework:** React + TypeScript + Vite.
- **Local storage:** IndexedDB via Dexie.js — structured, durable, on-device database for zones, materials, inventories, counts, audit log, and photo blobs.
- **Offline support:** Workbox-managed service worker caches the full app shell so the app loads and runs with zero connectivity after first install.
- **Barcode/QR scanning:** browser camera access + `@zxing/browser`, fully client-side/offline.
- **No backend.** All persistence is local; export/import files are the only data interchange mechanism.

## 4. Data Model

| Entity | Key fields |
|---|---|
| **User** | name |
| **UnitOfMeasure** | code, label (e.g. `KG`, `EA`, `ROLL`, `PALLET`) |
| **Material** | name, unit (FK), optional SAP material number, optional photo, optional barcode/QR value, active flag |
| **Zone** | name, optional SAP storage location code, optional photo, optional barcode/QR value |
| **Inventory** | name/label, status (`in_progress` / `closed_single_pass` / `needs_3rd_pass` / `successful`), created-by user, created date, closed date |
| **InventoryPass** | belongs to Inventory, pass number (1/2/3), status (`in_progress` / `closed`) |
| **ZoneCount** | belongs to InventoryPass + Zone, status (`open` / `closed`), opened/closed-by user + timestamps, optional photo |
| **MaterialCountLine** | belongs to ZoneCount + Material, quantity, optional expected/book quantity, optional photo, last-updated user + timestamp |
| **CountAuditEntry** | belongs to MaterialCountLine, user, timestamp, old value → new value (every +1/-1 click and manual edit is logged, not just overwritten) |
| **ReopenLog** | target (Zone/Pass/Inventory), user, timestamp, free-text reason |

Relationships: `Inventory 1—N InventoryPass 1—N ZoneCount 1—N MaterialCountLine 1—N CountAuditEntry`. Zones and Materials are global masters, reused across inventories. Units are a small managed list, not free text, to keep values consistent for later SAP matching.

## 5. Core Workflow

1. **Setup (anytime, not tied to an inventory):**
   - Manage Users, Units of Measure, Zones, Materials — create manually, or import Zones/Materials from CSV (matched by optional SAP code where present).
   - Optionally import expected/book quantities per Zone+Material (e.g. from a SAP stock extract) before a count starts.
2. **Start Inventory:** pick current user, name the inventory. Creates `Inventory` + `InventoryPass` #1, both `in_progress`.
3. **Count a zone:**
   - Pick or scan a Zone → zone screen opens (optional photo capture here).
   - Pick or scan a Material within that zone → counting screen shows material name, unit, expected qty (if set), a large **+1** button, a **-1** button, and a manual quantity entry field, plus optional photo.
   - Save the line, return to the material picker to count the next material **in the same zone**, repeating until the zone is done.
4. **Close Zone:** locks all `MaterialCountLine`s under that `ZoneCount`. Further edits require an explicit reopen with a logged reason (`ReopenLog`). Worker proceeds to the next zone.
5. **Close Inventory (Pass 1):** available once all intended zones are closed. Locks Pass 1. The app then presents two manual choices — **Finish with one pass** (export available, no reconciliation performed) or **Start Second Pass** (recommended, for a verified count). Whether a second pass happens is the worker/supervisor's decision, not automatic.
6. **Second pass:** repeats the same flow (fresh `ZoneCount`s under Pass 2, same Zones/Materials). On closing Pass 2, the app auto-compares every Zone+Material line between Pass 1 and Pass 2:
   - All lines match → Inventory auto-closes as **Successful**.
   - Any mismatch → Inventory status becomes **Needs 3rd pass**; a variance report lists only the mismatched Zone+Material lines.
7. **Third pass (only if needed):** worker re-counts **only the mismatched Zone+Material lines** identified in step 6 (not the whole inventory). On close, per line:
   - Pass 3 matches Pass 1 or Pass 2 → that value becomes the official count.
   - All three passes differ → line is flagged **Needs manual resolution**; a supervisor enters the final agreed value directly, with a required reason note (recorded like a reopen action).
8. **Close Inventory (final):** once every line has an official value, the inventory closes for good and cannot be reopened without an explicit reopen action against the whole inventory (logged in `ReopenLog`).

## 6. Export & Backup

- **CSV export** (available any time; prompted at inventory close):
  - **Detail CSV:** one row per Zone+Material+Pass line — Inventory name, Pass #, Zone name, SAP storage location, Material name, SAP material number, Unit, Expected qty, Counted qty, Variance, Status (matched/mismatched/manually resolved), counted-by user, timestamp.
  - **Summary CSV:** one row per Zone+Material with the final official quantity and variance vs. expected qty — the file intended for SAP reconciliation.
- **Full JSON/zip backup:** on-demand export of every entity (users, units, zones, materials, inventories, passes, counts, audit log, reopen log, photos) to one file, with a matching **Import backup** to restore on a new or reset device. Manual, not automatic — the worker/supervisor is responsible for storing the file (email, USB, shared drive).
- Photos are stored locally as IndexedDB blobs; backups include them as files in the export archive. CSV rows only note whether a photo exists (not embedded).

## 7. SAP Integration — Brainstorm for a Later Phase

Not built now; the data model's optional SAP fields (material number, storage location) exist specifically to make this addable without rework.

- **Inbound (SAP → app):** export material master (material number, description, base unit of measure) and current stock per storage location from SAP (e.g. via MB52/MMBE or a custom extract) as CSV, import into the app to seed/refresh Materials, Zones, and expected quantities before counting starts.
- **Outbound (app → SAP), two realistic paths:**
  - **Manual (works today):** supervisor takes the summary CSV and keys results into SAP's physical inventory transactions (MI04/MI05/MI07) or uses SAP's own CSV/LSMW upload tooling.
  - **Automated (future, needs connectivity):** a middleware step (SAP PI/CPI, or a script using SAP's OData/RFC APIs) pushes counts directly into a physical inventory document. The app would export a SAP-shaped payload alongside/instead of CSV.

## 8. Additional Industrial Features (v1 scope)

- **Variance highlighting:** auto-flag lines where counted vs. expected quantity exceeds a configurable threshold (percentage or absolute), so mismatches are visible immediately rather than only at pass-close time.
- **Progress dashboard:** per inventory — zones closed vs. total, materials counted, mismatches pending — for oversight during a count.
- **"Not counted" detection:** if a Zone+Material with an imported expected quantity never received a count line, flag it explicitly rather than treating it as an implicit zero.

### Deferred (not v1, noted for later)

- Multi-language UI.
- Negative-stock guard (warn before a manual edit or -1 pushes a count below zero).
- Per-material-category variance tolerance configuration (vs. one global threshold).
- Multi-device sync for parallel counting of the same inventory.
- Automated SAP push integration.

## 9. Testing Considerations

- Core reconciliation logic (pass comparison, 2-of-3 matching, mismatch detection) is pure logic over the data model and should be unit-tested independently of the UI.
- Offline behavior (service worker caching, IndexedDB persistence across app restarts) needs manual verification on real devices per the platform's `run` workflow, since these behaviors aren't easily captured by unit tests alone.
- CSV/backup export and import should be round-trip tested (export then re-import reproduces the same data).
