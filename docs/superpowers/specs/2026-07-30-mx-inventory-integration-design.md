# MX-Inventory — Integration Follow-Up (Phase 2)

**Date:** 2026-07-30
**Status:** Approved design, pending implementation plan
**Supersedes/extends:** `2026-07-29-mx-inventory-design.md` (original spec) and `2026-07-29-mx-inventory-implementation.md` (Tasks 1–21, all complete and individually reviewed)

## 1. Purpose

The first 21-task implementation built every screen and repository the original design called for, and each task passed its own review — but a final whole-branch review found the pieces were never fully wired together into a usable app. This spec covers the integration work needed to close that gap: routing the counting/reconciliation wizard, giving backup export/import a UI, enforcing third-pass completeness before an inventory can close, and a bundle of smaller correctness/UX fixes the same review surfaced.

Full findings are recorded in `.superpowers/sdd/2026-07-29-mx-inventory-implementation/progress.md` under "Final whole-branch review" — this spec is the design response to that review, not a fresh feature request.

## 2. Scope

In scope (all findings from the final review, Critical and Important):
- Counting/reconciliation wizard routing with a persisted session.
- Inventories list with resume, and export access from that list (replaces hand-typed-URL-only access).
- Repository-level third-pass completeness check before an inventory can close.
- Backup export/import UI, with a "replace all local data" import semantic and two data-fidelity fixes (photo MIME type and original timestamp preserved through the round trip).
- Shared async-error-handling hook applied across every page with an async action.
- Expected-quantity CSV import wired to the counting screen (unblocks variance highlighting and not-counted detection, which are otherwise permanently inert).
- `needs_3rd_pass` status actually persisted.
- Zone/material name lookups replacing raw ids on the four reconciliation screens.
- `BarcodeScanner` camera-stream leak fix and stabilized `onDetected` callbacks.
- `setCountLine` also validates the zone count's parent pass isn't closed (closes a lock-bypass gap without building unused generic reopen-cascade machinery).
- CSV export: real per-line status instead of a hardcoded value, plus a multi-pass content test.
- One integration test driving the full two-pass-then-third-pass reconciliation lifecycle against real Dexie data.
- README.

Out of scope (unchanged from the original spec's deferred list): multi-device sync, automated SAP push, negative-stock guard, per-category variance tolerance, multi-language UI.

## 3. Architecture: Counting Session & Wizard

- **`CountingSessionContext`** (new): React context holding `{ userId, inventoryId, passId, zoneId?, materialId? }`. A `CountingSessionProvider` persists the session to `localStorage` on every change and rehydrates it on load, so a locked/backgrounded/refreshed phone doesn't lose the worker's place mid-session. This is deliberately *not* a source of counting truth — it only tracks "where am I in the flow"; actual progress (which zones/materials are counted) always comes from Dexie.
- **`CountingWizard`** (new, at route `/inventory/:inventoryId/pass/:passId/*`): reads the session, holds a local `step` state (`'zone-picker' | 'material-picker' | 'counting' | 'zone-summary' | 'pass-close' | 'variance-report' | 'third-pass-picker' | 'manual-resolution'`), and renders the matching existing Task 12–16 page component, passing it the session values and a callback that both updates wizard `step` and updates the session. None of the existing page components change — they're already plain props-in/callback-out, which is exactly what makes this wiring layer thin.
- **`StartInventoryPage`** (modified): on `onStarted`, writes the initial session (`{ userId, inventoryId, passId, passId: pass.id }`, no zone/material yet) and navigates into `/inventory/:id/pass/:passId` instead of the current dead route.

## 4. Inventories List & Resume

- **`InventoriesListPage`** (new, linked from `HomePage`): lists all `db.inventories` rows, newest first, with name, status, and a contextual action:
  - `in_progress` → "Resume" — writes a session for the inventory's current open pass (no zone/material selected) and enters the wizard at the zone picker.
  - `needs_3rd_pass` → "Resume" — writes a session for the pass-3 id and enters the wizard directly at `ThirdPassPickerPage`.
  - `closed_single_pass` / `successful` → "View / Export" — links to `/inventory/:id/export`.
- This is also how `ExportPage` becomes reachable through the UI at all (previously only reachable by hand-typing a URL with a generated id).

## 5. Third-Pass Completeness Enforcement

- **`closeInventoryAfterReconciliation(inventoryId, pass1Id, pass2Id, pass3Id, userId)`** (new function in `inventoryRepository.ts`): recomputes `comparePasses(pass1Lines, pass2Lines)` from live Dexie data, and asserts every mismatched `{zoneId, materialId}` pair has a corresponding line in pass 3. If any are missing, it throws an error listing exactly which pairs still need counting — it does not touch the database in that case. If complete, it closes pass 3 (`closePass(pass3Id, userId)`) and then closes the inventory as `successful` (`closeInventory(inventoryId, 'successful')`), which by construction satisfies `closeInventory`'s existing "all passes closed" guard from Task 10.
- `ManualResolutionPage` calls this instead of `closeInventory` directly. This moves the app's one already-proven-fragile safety check (Task 16 needed a fix-round for a closely related bug) out of a component and into a repository function that's independently unit-testable without React — matching the pattern already used for `closePass`/`closeZoneCount`'s own guards.

## 6. Backup UI

- **`BackupPage`** (new, linked from `HomePage`): "Export backup" button calls `exportBackup()` and downloads the result via `URL.createObjectURL`. "Restore from backup" is a file input; on selection, shows an inline confirmation ("This replaces all data currently on this device — continue?") before calling a new `clearAllData()` (clears every Dexie table) followed by `importBackup()`.
- **`backup.ts` fixes:** the photo round-trip currently drops the original `Blob.type` and overwrites `createdAt` with the import time — both get preserved through the zip (store `type` in `data.json`'s per-photo metadata alongside `photoIds`, restore `createdAt` from the original record). Add a `formatVersion: 1` field to the backup JSON for future compatibility checks.

## 7. Shared Error Handling

- **`useAsyncAction`** (new hook): `const [run, { pending, error }] = useAsyncAction(fn)`. Wraps an async handler, catches thrown errors (including the new completeness-check error from §5), and exposes `pending`/`error` for the component to render. A small shared `<ErrorBanner message={error.message} />` renders above the triggering button when `error` is set.
- Applied to every page with an async submit/action currently missing error feedback: `PassClosePage`, `ManualResolutionPage`, `CountingScreen`, `ZoneSummaryPage`, `VarianceReportPage`, `StartInventoryPage`, `ImportPage`, and the new `BackupPage`.

## 8. Expected-Quantity Import

- `ImportPage` gets a third file input for the expected-quantities CSV, using Task 9's already-built `parseExpectedQuantitiesCsv`. Rows are matched to existing Zone/Material records by name; unmatched rows are skipped and reported in the status message (same pattern as the existing zone/material import).
- Expected quantities are stored in a new lookup the wizard queries when entering `CountingScreen` for a given zone+material, passing the value through as the existing `expectedQuantity` prop — no change needed to `CountingScreen` itself, since it already accepts and displays this prop (built in Task 13, wired to nothing until now).

## 9. Smaller Fixes

- **`needs_3rd_pass` persistence:** `VarianceReportPage`'s mismatch branch calls `closeInventory(inventoryId, 'needs_3rd_pass')` (already a valid status per the Task 2 schema) instead of only updating local component state.
- **Name lookups:** `VarianceReportPage`, `ThirdPassPickerPage`, `ManualResolutionPage`, `ZoneSummaryPage` look up and display zone/material names via `db.zones.get`/`db.materials.get`, matching the pattern already used correctly in `ProgressDashboardPage`.
- **Camera-stream leak:** `BarcodeScanner`'s effect cleanup uses a `cancelled` flag checked inside the `decodeFromVideoDevice(...).then()` callback (not an unconditional `stop?.()` that can run before `stop` is assigned). `ZonePickerPage`/`MaterialPickerPage` wrap their `onDetected` callbacks in `useCallback` so an unrelated parent re-render doesn't restart the camera.
- **Reopen safety:** `setCountLine` additionally checks that the zone count's parent `InventoryPass` is not `closed` (previously only checked the zone count itself), closing the gap where a reopened zone count under a still-closed pass could be edited. No generic cascading-reopen API is built — there's no caller that needs one yet, and adding it now would be speculative.
- **CSV export accuracy:** `ExportPage`'s detail rows compute a real per-line `status` (`matched` / `mismatched` / `manually_resolved`) from the same reconciliation data already available, instead of the current hardcoded `'recorded'`. `ExportPage.test.tsx` gains a multi-pass scenario asserting actual CSV row content, not just that the download links render.
- **Integration test:** a new test (in `inventoryRepository.test.ts` or a new `integration.test.ts`) drives a full pass-1 → pass-2 (mismatch) → pass-3 → resolve lifecycle against real Dexie data, asserting the final `MaterialCountLine` values and `Inventory.status` — closing the coverage gap the final review flagged as the one place a Critical bug already slipped through.
- **README:** run/test/build/deploy commands, the SPA-fallback hosting requirement (client-side routing needs the host to serve `index.html` for unknown paths), and a short overview of the data model (`Inventory → Pass → ZoneCount → MaterialCountLine → CountAuditEntry`).

## 10. Testing Considerations

- The wizard and session context are UI orchestration with no business logic of their own — covered by exercising the existing, already-tested page components through it, not by testing the wizard's internals in isolation.
- `closeInventoryAfterReconciliation` and the parent-pass check in `setCountLine` are pure repository logic — unit-tested directly against `fake-indexeddb`, same pattern as the rest of `inventoryRepository.test.ts`.
- `useAsyncAction` gets its own small unit test (success path clears error/pending; failure path sets error, clears pending) since it's now load-bearing across eight pages.
