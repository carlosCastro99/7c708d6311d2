# MX-Inventory Integration Follow-Up (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-built counting/reconciliation workflow into app routing with a persisted session, enforce third-pass completeness before an inventory can close, ship a backup UI, and close the remaining Important findings from the Phase 1 final whole-branch review.

**Architecture:** A new `CountingSessionContext` (persisted to `localStorage`) tracks `{ userId, inventoryId, passId, zoneId?, materialId? }`; a new `CountingWizard` component reads it and swaps between the existing, unchanged Task 12–16 page components based on local step state. Third-pass completeness moves into a new repository function so it can't be bypassed by a UI caller. A shared `useAsyncAction` hook + `ErrorBanner` component gives every async button real error feedback.

**Tech Stack:** Same as Phase 1 — React 18, TypeScript, Vite, Dexie 4, react-router-dom 6, Vitest + React Testing Library. No new dependencies.

## Global Constraints

- Offline-first, no backend: every new page/hook is pure client-side Dexie + React state, no network calls.
- Mobile-first, touch-friendly: every new interactive element is a plain `button`/`input`/`select` (covered by the existing global `min-height: 44px` CSS rule) or `Link`.
- The counting session (`{ userId, inventoryId, passId, zoneId?, materialId? }`) is a *navigation aid only*, never a source of counting truth — actual progress always comes from Dexie. Losing the session (e.g. clearing browser storage) must never corrupt or lose counted data, only require re-navigating via the Inventories list.
- Importing a backup replaces all local data (clears every table first) — it never merges.
- No new Dexie table changes an existing table's structure; the schema version bumps from 1 to 2 additively (Dexie requires all prior table definitions to be re-listed in a new `.version(2).stores({...})` call alongside the new table).
- Every existing page component's public props interface is unchanged unless a task below explicitly says otherwise — this plan is additive integration, not a rewrite.

---

## File Structure

```
src/
  hooks/
    useAsyncAction.ts              — shared async-action-with-error-state hook
    useAsyncAction.test.ts
  components/
    ErrorBanner.tsx                — renders an error message inline
    BarcodeScanner.tsx             — MODIFY: fix camera-stream leak
  context/
    CountingSession.tsx            — CountingSessionProvider + useCountingSession hook, localStorage-backed
    CountingSession.test.tsx
  db/
    types.ts                       — MODIFY: add ExpectedQuantity
    schema.ts                      — MODIFY: version 2, add expectedQuantities table
    repositories/
      expectedQuantityRepository.ts
      expectedQuantityRepository.test.ts
      inventoryRepository.ts       — MODIFY: add closeInventoryAfterReconciliation, parent-pass guard in setCountLine
      inventoryRepository.test.ts  — MODIFY: new tests + full pass1->pass2->pass3 integration test
  domain/
    backup.ts                      — MODIFY: preserve photo type/createdAt, add formatVersion, add clearAllData
    backup.test.ts                 — MODIFY
  pages/
    HomePage.tsx                   — MODIFY: add Inventories + Backup links
    ExportPage.tsx                 — MODIFY: real per-line status
    ExportPage.test.tsx            — MODIFY: multi-pass content test
    BackupPage.tsx                 — NEW
    BackupPage.test.tsx            — NEW
    masterData/
      ImportPage.tsx               — MODIFY: third file input for expected quantities
      ImportPage.test.tsx          — MODIFY
    inventory/
      StartInventoryPage.tsx       — MODIFY: write session, navigate into wizard, error handling
      CountingWizard.tsx           — NEW
      CountingWizard.test.tsx      — NEW
      InventoriesListPage.tsx      — NEW
      InventoriesListPage.test.tsx — NEW
      ZonePickerPage.tsx           — MODIFY: stabilize onDetected
      MaterialPickerPage.tsx       — MODIFY: stabilize onDetected
      CountingScreen.tsx           — MODIFY: error handling
      ZoneSummaryPage.tsx          — MODIFY: error handling, zone name lookup
      PassClosePage.tsx            — MODIFY: error handling
      VarianceReportPage.tsx       — MODIFY: error handling, needs_3rd_pass persistence, name lookups
      VarianceReportPage.test.tsx  — MODIFY
      ThirdPassPickerPage.tsx      — MODIFY: name lookups
      ManualResolutionPage.tsx     — MODIFY: use closeInventoryAfterReconciliation, error handling, name lookups
      ManualResolutionPage.test.tsx — MODIFY
  App.tsx                          — MODIFY: wrap in CountingSessionProvider, add wizard/inventories/backup routes
README.md                          — NEW (repo root)
```

---

### Task 1: Shared Async Action Hook and Error Banner

**Files:**
- Create: `src/hooks/useAsyncAction.ts`, `src/hooks/useAsyncAction.test.ts`
- Create: `src/components/ErrorBanner.tsx`

**Interfaces:**
- Produces: `useAsyncAction<Args extends unknown[]>(fn: (...args: Args) => Promise<void>): [(...args: Args) => void, { pending: boolean; error: Error | null }]`
- Produces: `<ErrorBanner message={string} />`

- [ ] **Step 1: Write the failing test — `src/hooks/useAsyncAction.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAsyncAction } from './useAsyncAction'

describe('useAsyncAction', () => {
  it('clears error and sets pending while running, then resolves cleanly', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAsyncAction(fn))

    expect(result.current[1]).toEqual({ pending: false, error: null })

    act(() => {
      result.current[0]()
    })

    await waitFor(() => expect(result.current[1].pending).toBe(false))
    expect(result.current[1].error).toBeNull()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('captures a thrown error and clears pending', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useAsyncAction(fn))

    act(() => {
      result.current[0]()
    })

    await waitFor(() => expect(result.current[1].error).not.toBeNull())
    expect(result.current[1].error?.message).toBe('boom')
    expect(result.current[1].pending).toBe(false)
  })

  it('forwards arguments to the wrapped function', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAsyncAction(fn))

    act(() => {
      result.current[0]('a', 2)
    })

    await waitFor(() => expect(fn).toHaveBeenCalledWith('a', 2))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useAsyncAction.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/hooks/useAsyncAction.ts`**

```ts
import { useCallback, useState } from 'react'

interface AsyncActionState {
  pending: boolean
  error: Error | null
}

export function useAsyncAction<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void>,
): [(...args: Args) => void, AsyncActionState] {
  const [state, setState] = useState<AsyncActionState>({ pending: false, error: null })

  const run = useCallback(
    (...args: Args) => {
      setState({ pending: true, error: null })
      fn(...args)
        .then(() => setState({ pending: false, error: null }))
        .catch((err: unknown) => {
          setState({ pending: false, error: err instanceof Error ? err : new Error(String(err)) })
        })
    },
    [fn],
  )

  return [run, state]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useAsyncAction.test.ts`
Expected: PASS

- [ ] **Step 5: Create `src/components/ErrorBanner.tsx`** (no dedicated test — trivial presentational component, exercised indirectly wherever it's used)

```tsx
interface ErrorBannerProps {
  message: string
}

export default function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div role="alert" style={{ background: '#fdecea', color: '#d93025', padding: '0.75rem', borderRadius: 8, marginBottom: '1rem' }}>
      {message}
    </div>
  )
}
```

- [ ] **Step 6: Run build to confirm no type errors**

Run: `npm run build`
Expected: PASS, exit code 0

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useAsyncAction.ts src/hooks/useAsyncAction.test.ts src/components/ErrorBanner.tsx
git commit -m "feat: add shared useAsyncAction hook and ErrorBanner component"
```

---

### Task 2: Counting Session Context

**Files:**
- Create: `src/context/CountingSession.tsx`, `src/context/CountingSession.test.tsx`

**Interfaces:**
- Produces:
  - `interface CountingSessionValue { userId: string; inventoryId: string; passId: string; zoneId?: string; materialId?: string }`
  - `<CountingSessionProvider>{children}</CountingSessionProvider>` — wraps the app once, in `App.tsx`.
  - `useCountingSession(): { session: CountingSessionValue | null; setSession: (session: CountingSessionValue | null) => void }`
- Storage key: `'mx-inventory-counting-session'` in `localStorage`, JSON-serialized. `setSession(null)` clears it.

- [ ] **Step 1: Write the failing test — `src/context/CountingSession.test.tsx`**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CountingSessionProvider, useCountingSession } from './CountingSession'

afterEach(() => {
  window.localStorage.clear()
})

function TestConsumer() {
  const { session, setSession } = useCountingSession()
  return (
    <div>
      <div data-testid="session">{session ? JSON.stringify(session) : 'none'}</div>
      <button
        onClick={() =>
          setSession({ userId: 'u1', inventoryId: 'inv1', passId: 'p1', zoneId: 'z1', materialId: 'm1' })
        }
      >
        set
      </button>
      <button onClick={() => setSession(null)}>clear</button>
    </div>
  )
}

describe('CountingSession', () => {
  it('starts with no session, persists on set, and clears on null', () => {
    const { unmount } = render(
      <CountingSessionProvider>
        <TestConsumer />
      </CountingSessionProvider>,
    )

    expect(screen.getByTestId('session').textContent).toBe('none')

    fireEvent.click(screen.getByText('set'))
    expect(screen.getByTestId('session').textContent).toContain('"inventoryId":"inv1"')
    expect(window.localStorage.getItem('mx-inventory-counting-session')).toContain('"inventoryId":"inv1"')

    fireEvent.click(screen.getByText('clear'))
    expect(screen.getByTestId('session').textContent).toBe('none')
    expect(window.localStorage.getItem('mx-inventory-counting-session')).toBeNull()

    unmount()
  })

  it('rehydrates an existing session from localStorage on mount', () => {
    window.localStorage.setItem(
      'mx-inventory-counting-session',
      JSON.stringify({ userId: 'u1', inventoryId: 'inv1', passId: 'p1' }),
    )

    render(
      <CountingSessionProvider>
        <TestConsumer />
      </CountingSessionProvider>,
    )

    expect(screen.getByTestId('session').textContent).toContain('"inventoryId":"inv1"')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/context/CountingSession.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/context/CountingSession.tsx`**

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'mx-inventory-counting-session'

export interface CountingSessionValue {
  userId: string
  inventoryId: string
  passId: string
  zoneId?: string
  materialId?: string
}

interface CountingSessionContextValue {
  session: CountingSessionValue | null
  setSession: (session: CountingSessionValue | null) => void
}

const CountingSessionContext = createContext<CountingSessionContextValue | undefined>(undefined)

function readInitialSession(): CountingSessionValue | null {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as CountingSessionValue
  } catch {
    return null
  }
}

export function CountingSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<CountingSessionValue | null>(readInitialSession)

  const setSession = (next: CountingSessionValue | null) => {
    setSessionState(next)
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }

  return (
    <CountingSessionContext.Provider value={{ session, setSession }}>
      {children}
    </CountingSessionContext.Provider>
  )
}

export function useCountingSession(): CountingSessionContextValue {
  const ctx = useContext(CountingSessionContext)
  if (!ctx) throw new Error('useCountingSession must be used within a CountingSessionProvider')
  return ctx
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/context/CountingSession.test.tsx`
Expected: PASS

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: PASS, exit code 0

- [ ] **Step 6: Commit**

```bash
git add src/context/CountingSession.tsx src/context/CountingSession.test.tsx
git commit -m "feat: add persisted counting session context"
```

---

### Task 3: Expected Quantity Storage

**Files:**
- Modify: `src/db/types.ts` (add `ExpectedQuantity`)
- Modify: `src/db/schema.ts` (version 2, add `expectedQuantities` table)
- Create: `src/db/repositories/expectedQuantityRepository.ts`, `src/db/repositories/expectedQuantityRepository.test.ts`

**Interfaces:**
- Produces (types.ts addition): `interface ExpectedQuantity { id: ID; zoneId: ID; materialId: ID; expectedQuantity: number }`
- Produces (repository): `setExpectedQuantity(zoneId: string, materialId: string, expectedQuantity: number): Promise<void>` (upsert — one row per zoneId+materialId), `getExpectedQuantity(zoneId: string, materialId: string): Promise<number | undefined>`, `listExpectedPairs(): Promise<Array<{ zoneId: string; materialId: string }>>` (every zone+material pair with an expected quantity — used by `ProgressDashboardPage`'s existing `expectedPairs` prop, wired in Task 5).

- [ ] **Step 1: Modify `src/db/types.ts`** — add after the `PhotoBlob` interface (end of file):

```ts
export interface ExpectedQuantity {
  id: ID
  zoneId: ID
  materialId: ID
  expectedQuantity: number
}
```

- [ ] **Step 2: Write the failing test — `src/db/repositories/expectedQuantityRepository.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { setExpectedQuantity, getExpectedQuantity, listExpectedPairs } from './expectedQuantityRepository'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('expectedQuantityRepository', () => {
  it('sets and gets an expected quantity for a zone+material pair', async () => {
    await setExpectedQuantity('zone-1', 'material-1', 150)
    expect(await getExpectedQuantity('zone-1', 'material-1')).toBe(150)
    expect(await getExpectedQuantity('zone-1', 'material-2')).toBeUndefined()
  })

  it('upserts rather than duplicating on a second call for the same pair', async () => {
    await setExpectedQuantity('zone-1', 'material-1', 150)
    await setExpectedQuantity('zone-1', 'material-1', 200)
    expect(await getExpectedQuantity('zone-1', 'material-1')).toBe(200)
    expect(await db.expectedQuantities.count()).toBe(1)
  })

  it('lists every zone+material pair with an expected quantity', async () => {
    await setExpectedQuantity('zone-1', 'material-1', 150)
    await setExpectedQuantity('zone-2', 'material-2', 50)
    const pairs = await listExpectedPairs()
    expect(pairs.sort((a, b) => a.zoneId.localeCompare(b.zoneId))).toEqual([
      { zoneId: 'zone-1', materialId: 'material-1' },
      { zoneId: 'zone-2', materialId: 'material-2' },
    ])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/db/repositories/expectedQuantityRepository.test.ts`
Expected: FAIL — module not found (schema also doesn't yet have the table).

- [ ] **Step 4: Modify `src/db/schema.ts`** — replace the whole file:

```ts
import Dexie, { type Table } from 'dexie'
import type {
  User, UnitOfMeasure, Material, Zone, Inventory, InventoryPass,
  ZoneCount, MaterialCountLine, CountAuditEntry, ReopenLog, PhotoBlob, ExpectedQuantity,
} from './types'

export class MxInventoryDB extends Dexie {
  users!: Table<User, string>
  units!: Table<UnitOfMeasure, string>
  materials!: Table<Material, string>
  zones!: Table<Zone, string>
  inventories!: Table<Inventory, string>
  passes!: Table<InventoryPass, string>
  zoneCounts!: Table<ZoneCount, string>
  countLines!: Table<MaterialCountLine, string>
  auditEntries!: Table<CountAuditEntry, string>
  reopenLogs!: Table<ReopenLog, string>
  photos!: Table<PhotoBlob, string>
  expectedQuantities!: Table<ExpectedQuantity, string>

  constructor(name = 'mx-inventory') {
    super(name)
    this.version(1).stores({
      users: 'id, name',
      units: 'id, code',
      materials: 'id, name, sapMaterialNumber, barcodeValue, active',
      zones: 'id, name, sapStorageLocation, barcodeValue',
      inventories: 'id, status, createdAt',
      passes: 'id, inventoryId, passNumber',
      zoneCounts: 'id, passId, zoneId, status',
      countLines: 'id, zoneCountId, materialId',
      auditEntries: 'id, materialCountLineId, timestamp',
      reopenLogs: 'id, targetType, targetId, timestamp',
      photos: 'id',
    })
    this.version(2).stores({
      users: 'id, name',
      units: 'id, code',
      materials: 'id, name, sapMaterialNumber, barcodeValue, active',
      zones: 'id, name, sapStorageLocation, barcodeValue',
      inventories: 'id, status, createdAt',
      passes: 'id, inventoryId, passNumber',
      zoneCounts: 'id, passId, zoneId, status',
      countLines: 'id, zoneCountId, materialId',
      auditEntries: 'id, materialCountLineId, timestamp',
      reopenLogs: 'id, targetType, targetId, timestamp',
      photos: 'id',
      expectedQuantities: 'id, zoneId, materialId',
    })
  }
}

export const db = new MxInventoryDB()
```

- [ ] **Step 5: Create `src/db/repositories/expectedQuantityRepository.ts`**

```ts
import { db } from '../schema'
import { newId } from '../id'

export async function setExpectedQuantity(zoneId: string, materialId: string, expectedQuantity: number): Promise<void> {
  const existing = await db.expectedQuantities.where({ zoneId, materialId }).first()
  if (existing) {
    await db.expectedQuantities.put({ ...existing, expectedQuantity })
  } else {
    await db.expectedQuantities.add({ id: newId(), zoneId, materialId, expectedQuantity })
  }
}

export async function getExpectedQuantity(zoneId: string, materialId: string): Promise<number | undefined> {
  const row = await db.expectedQuantities.where({ zoneId, materialId }).first()
  return row?.expectedQuantity
}

export async function listExpectedPairs(): Promise<Array<{ zoneId: string; materialId: string }>> {
  const rows = await db.expectedQuantities.toArray()
  return rows.map((r) => ({ zoneId: r.zoneId, materialId: r.materialId }))
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/db/repositories/expectedQuantityRepository.test.ts`
Expected: PASS

- [ ] **Step 7: Run the full suite once** (schema version bump touches every test that opens `db`)

Run: `npx vitest run`
Expected: PASS — every existing test still passes against schema version 2.

- [ ] **Step 8: Run build**

Run: `npm run build`
Expected: PASS, exit code 0

- [ ] **Step 9: Commit**

```bash
git add src/db/types.ts src/db/schema.ts src/db/repositories/expectedQuantityRepository.ts src/db/repositories/expectedQuantityRepository.test.ts
git commit -m "feat: add expected-quantity storage (schema v2 + repository)"
```

---

### Task 4: Third-Pass Completeness Enforcement and Reopen Safety

**Files:**
- Modify: `src/db/repositories/inventoryRepository.ts`
- Modify: `src/db/repositories/inventoryRepository.test.ts`

**Interfaces:**
- Consumes: existing `db`, `newId`, `comparePasses` (from `../../domain/reconciliation`), `resolveThirdPass`, `getPassLines`, `closePass`, `closeInventory`.
- Produces: `closeInventoryAfterReconciliation(inventoryId: string, pass1Id: string, pass2Id: string, pass3Id: string, userId: string): Promise<void>` — throws `Error` (message lists the outstanding `zoneId::materialId` pairs) if any pass1-vs-pass2 mismatch has no corresponding pass-3 line; otherwise closes pass 3 and the inventory as `'successful'`.
- Modifies `setCountLine`'s existing closed-check to also reject when the zone count's parent pass is closed.

- [ ] **Step 1: Write the failing tests** — add to `src/db/repositories/inventoryRepository.test.ts` (new `describe` blocks; keep all existing tests in the file unchanged):

```ts
import { comparePasses } from '../../domain/reconciliation'
import { closeInventoryAfterReconciliation } from './inventoryRepository'

describe('setCountLine rejects edits under a closed pass', () => {
  it('throws even if the zone count itself was reopened while the pass stays closed', async () => {
    const { inventory, pass } = await startInventory('Inv', 'user-1')
    const zc = await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')
    await setCountLine(zc.id, 'material-1', 5, 'user-1')
    await closeZoneCount(zc.id, 'user-1')
    await closePass(pass.id, 'user-1')

    await reopenTarget('zoneCount', zc.id, 'user-1', 'testing parent-pass guard')
    await expect(setCountLine(zc.id, 'material-1', 9, 'user-1')).rejects.toThrow(/pass/i)
  })
})

describe('closeInventoryAfterReconciliation', () => {
  async function countAndClose(passId: string, zoneId: string, materialId: string, qty: number) {
    const zc = await getOrOpenZoneCount(passId, zoneId, 'user-1')
    await setCountLine(zc.id, materialId, qty, 'user-1')
    await closeZoneCount(zc.id, 'user-1')
  }

  it('refuses to close when a mismatched pair was never recounted in pass 3', async () => {
    const { inventory, pass } = await startInventory('Inv', 'user-1')
    await countAndClose(pass.id, 'zone-1', 'material-1', 10)
    await countAndClose(pass.id, 'zone-2', 'material-2', 10)
    await closePass(pass.id, 'user-1')

    const pass2 = await startNextPass(inventory.id, 2)
    await countAndClose(pass2.id, 'zone-1', 'material-1', 12)
    await countAndClose(pass2.id, 'zone-2', 'material-2', 20)
    await closePass(pass2.id, 'user-1')

    const pass3 = await startNextPass(inventory.id, 3)
    // Only zone-1/material-1 gets recounted; zone-2/material-2 is left out.
    await countAndClose(pass3.id, 'zone-1', 'material-1', 12)

    await expect(
      closeInventoryAfterReconciliation(inventory.id, pass.id, pass2.id, pass3.id, 'user-1'),
    ).rejects.toThrow(/zone-2.*material-2|material-2.*zone-2/i)

    const updated = await db.inventories.get(inventory.id)
    expect(updated?.status).toBe('in_progress')
  })

  it('closes pass 3 and the inventory as successful once every mismatched pair is covered', async () => {
    const { inventory, pass } = await startInventory('Inv', 'user-1')
    await countAndClose(pass.id, 'zone-1', 'material-1', 10)
    await closePass(pass.id, 'user-1')

    const pass2 = await startNextPass(inventory.id, 2)
    await countAndClose(pass2.id, 'zone-1', 'material-1', 12)
    await closePass(pass2.id, 'user-1')

    const pass3 = await startNextPass(inventory.id, 3)
    await countAndClose(pass3.id, 'zone-1', 'material-1', 12)

    await closeInventoryAfterReconciliation(inventory.id, pass.id, pass2.id, pass3.id, 'user-1')

    const updatedInventory = await db.inventories.get(inventory.id)
    expect(updatedInventory?.status).toBe('successful')
    const updatedPass3 = await db.passes.get(pass3.id)
    expect(updatedPass3?.status).toBe('closed')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/db/repositories/inventoryRepository.test.ts`
Expected: FAIL — `closeInventoryAfterReconciliation` not exported; parent-pass guard test fails because the guard doesn't exist yet.

- [ ] **Step 3: Modify `setCountLine` in `src/db/repositories/inventoryRepository.ts`** — inside the `db.transaction(...)` callback, replace the existing zone-count check:

```ts
    const zoneCount = await db.zoneCounts.get(zoneCountId)
    if (!zoneCount) throw new Error('Zone count not found')
    if (zoneCount.status === 'closed') throw new Error('Cannot edit a closed zone count')
```

with:

```ts
    const zoneCount = await db.zoneCounts.get(zoneCountId)
    if (!zoneCount) throw new Error('Zone count not found')
    if (zoneCount.status === 'closed') throw new Error('Cannot edit a closed zone count')

    const parentPass = await db.passes.get(zoneCount.passId)
    if (parentPass?.status === 'closed') throw new Error('Cannot edit a count line under a closed pass')
```

Note: `db.passes` must be added to the transaction's table list. Change the transaction call from:

```ts
  return db.transaction('rw', db.zoneCounts, db.countLines, db.auditEntries, async () => {
```

to:

```ts
  return db.transaction('rw', db.zoneCounts, db.countLines, db.auditEntries, db.passes, async () => {
```

- [ ] **Step 4: Add `closeInventoryAfterReconciliation` to `src/db/repositories/inventoryRepository.ts`** — add this import at the top of the file:

```ts
import { comparePasses } from '../../domain/reconciliation'
```

and append this function at the end of the file:

```ts
export async function closeInventoryAfterReconciliation(
  inventoryId: string,
  pass1Id: string,
  pass2Id: string,
  pass3Id: string,
  userId: string,
): Promise<void> {
  const pass1Lines = await getPassLines(pass1Id)
  const pass2Lines = await getPassLines(pass2Id)
  const pass3Lines = await getPassLines(pass3Id)

  const { mismatched } = comparePasses(pass1Lines, pass2Lines)
  const pass3Keys = new Set(pass3Lines.map((l) => `${l.zoneId}::${l.materialId}`))
  const missing = mismatched.filter((m) => !pass3Keys.has(`${m.zoneId}::${m.materialId}`))

  if (missing.length > 0) {
    const pairList = missing.map((m) => `${m.zoneId}::${m.materialId}`).join(', ')
    throw new Error(`Cannot close inventory: these pairs still need a third-pass recount: ${pairList}`)
  }

  await closePass(pass3Id, userId)
  await closeInventory(inventoryId, 'successful')
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/db/repositories/inventoryRepository.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full suite once** (the `setCountLine` transaction signature change and parent-pass guard are used by every existing counting-flow test)

Run: `npx vitest run`
Expected: PASS — no existing test writes to a count line under a closed pass, so the new guard shouldn't break anything, but confirm.

- [ ] **Step 7: Run build**

Run: `npm run build`
Expected: PASS, exit code 0

- [ ] **Step 8: Commit**

```bash
git add src/db/repositories/inventoryRepository.ts src/db/repositories/inventoryRepository.test.ts
git commit -m "feat: enforce third-pass completeness before close, guard setCountLine against closed parent pass"
```

---

### Task 5: Counting Wizard, App Routing, and Start Inventory

**Files:**
- Create: `src/pages/inventory/CountingWizard.tsx`, `src/pages/inventory/CountingWizard.test.tsx`
- Modify: `src/pages/inventory/StartInventoryPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useCountingSession` (Task 2); `useAsyncAction`, `ErrorBanner` (Task 1); `getExpectedQuantity` (Task 3); all existing Task 12–16 page components with their existing props (`ZonePickerPage`, `MaterialPickerPage`, `CountingScreen`, `ZoneSummaryPage`, `PassClosePage`, `VarianceReportPage`, `ThirdPassPickerPage`, `ManualResolutionPage`, `ProgressDashboardPage`); `closeInventoryAfterReconciliation` is consumed by `ManualResolutionPage` in Task 6, not here.
- Produces: `<CountingWizard />` (reads everything from `useCountingSession`, takes no props — mounted at route `/inventory/:inventoryId/pass/:passId`; no nested routing inside the wizard, so no trailing `/*`).

- [ ] **Step 1: Write the failing test — `src/pages/inventory/CountingWizard.test.tsx`**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../../db/schema'
import { CountingSessionProvider } from '../../context/CountingSession'
import { createZone } from '../../db/repositories/zoneRepository'
import { createUnit } from '../../db/repositories/unitRepository'
import { createMaterial } from '../../db/repositories/materialRepository'
import { startInventory } from '../../db/repositories/inventoryRepository'
import CountingWizard from './CountingWizard'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  window.localStorage.clear()
})

describe('CountingWizard', () => {
  it('walks zone pick -> material pick -> count -> zone summary -> close zone', async () => {
    const zone = await createZone({ name: 'Warehouse A' })
    const unit = await createUnit('KG', 'Kilogram')
    const material = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const { inventory, pass } = await startInventory('Inv', 'user-1')

    // Seed the session the same way CountingSessionProvider reads it on mount
    // (see Task 2), rather than calling setSession during another component's
    // render, which React does not guarantee handles cleanly.
    window.localStorage.setItem(
      'mx-inventory-counting-session',
      JSON.stringify({ userId: 'user-1', inventoryId: inventory.id, passId: pass.id }),
    )

    const user = userEvent.setup()
    render(
      <CountingSessionProvider>
        <MemoryRouter initialEntries={[`/inventory/${inventory.id}/pass/${pass.id}`]}>
          <Routes>
            <Route path="/inventory/:inventoryId/pass/:passId" element={<CountingWizard />} />
          </Routes>
        </MemoryRouter>
      </CountingSessionProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Warehouse A' }))
    await user.click(await screen.findByRole('button', { name: 'Kraft Paper' }))
    await user.click(await screen.findByRole('button', { name: '+1' }))
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(async () => {
      const line = await db.countLines.where('materialId').equals(material.id).first()
      expect(line?.quantity).toBe(1)
    })

    expect(await screen.findByText(/zone summary/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /close zone/i }))

    await waitFor(async () => {
      const zc = await db.zoneCounts.where({ passId: pass.id, zoneId: zone.id }).first()
      expect(zc?.status).toBe('closed')
    })

    // Back at the zone picker; "Finish this pass" moves into PassClosePage.
    expect(await screen.findByRole('button', { name: /finish this pass/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /finish this pass/i }))
    expect(await screen.findByRole('button', { name: /finish with one pass/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/inventory/CountingWizard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/pages/inventory/CountingWizard.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useCountingSession } from '../../context/CountingSession'
import { getOrOpenZoneCount, getPassLines } from '../../db/repositories/inventoryRepository'
import { getExpectedQuantity } from '../../db/repositories/expectedQuantityRepository'
import { comparePasses } from '../../domain/reconciliation'
import { db } from '../../db/schema'
import ZonePickerPage from './ZonePickerPage'
import MaterialPickerPage from './MaterialPickerPage'
import CountingScreen from './CountingScreen'
import ZoneSummaryPage from './ZoneSummaryPage'
import PassClosePage from './PassClosePage'
import VarianceReportPage from './VarianceReportPage'
import ThirdPassPickerPage from './ThirdPassPickerPage'
import ManualResolutionPage from './ManualResolutionPage'

type Step = 'zone-picker' | 'material-picker' | 'counting' | 'zone-summary' | 'pass-close' | 'third-pass-picker'

export default function CountingWizard() {
  const { session, setSession } = useCountingSession()
  const [step, setStep] = useState<Step>('zone-picker')
  const [zoneCountId, setZoneCountId] = useState<string | null>(null)
  const [initialQuantity, setInitialQuantity] = useState(0)
  const [expectedQuantity, setExpectedQuantity] = useState<number | undefined>(undefined)
  // pass1Id is captured once, when the wizard first mounts with a valid session
  // (always true in real usage -- StartInventoryRoute / InventoriesListPage
  // write the session before navigating here). It stays fixed across the
  // pass1 -> pass2 -> pass3 transitions that happen within this same mount.
  const [pass1Id] = useState<string | null>(() => session?.passId ?? null)
  const [pass2Id, setPass2Id] = useState<string | null>(null)
  const [pass3Id, setPass3Id] = useState<string | null>(null)
  const [mismatchedPairs, setMismatchedPairs] = useState<Array<{ zoneId: string; materialId: string }>>([])

  // Compute the scoped third-pass mismatch list once pass 3 starts -- this is
  // what ThirdPassPickerPage's `mismatches` prop needs, and nothing else in
  // this component populates it otherwise.
  useEffect(() => {
    if (!pass1Id || !pass2Id || !pass3Id) return
    (async () => {
      const pass1Lines = await getPassLines(pass1Id)
      const pass2Lines = await getPassLines(pass2Id)
      const { mismatched } = comparePasses(pass1Lines, pass2Lines)
      setMismatchedPairs(mismatched.map((m) => ({ zoneId: m.zoneId, materialId: m.materialId })))
    })()
  }, [pass1Id, pass2Id, pass3Id])

  if (!session) return <div className="screen">No active session — go to Inventories to resume.</div>

  const { userId, inventoryId } = session
  const passId = session.passId
  const onThirdPass = passId === pass3Id

  if (step === 'zone-picker') {
    return (
      <div>
        <div className="screen" style={{ paddingBottom: 0 }}>
          <button
            type="button"
            className="secondary"
            onClick={() => setStep(onThirdPass ? 'third-pass-picker' : 'pass-close')}
          >
            {onThirdPass ? 'Back to mismatch list' : 'Finish this pass'}
          </button>
        </div>
        <ZonePickerPage
          onZoneChosen={async (zoneId) => {
            setSession({ ...session, zoneId })
            await getOrOpenZoneCount(passId, zoneId, userId)
            setStep('material-picker')
          }}
        />
      </div>
    )
  }

  if (step === 'material-picker') {
    return (
      <MaterialPickerPage
        onMaterialChosen={async (materialId) => {
          const zoneId = session.zoneId!
          setSession({ ...session, materialId })
          const zc = await getOrOpenZoneCount(passId, zoneId, userId)
          setZoneCountId(zc.id)
          const existingLine = await db.countLines.where({ zoneCountId: zc.id, materialId }).first()
          setInitialQuantity(existingLine?.quantity ?? 0)
          setExpectedQuantity(await getExpectedQuantity(zoneId, materialId))
          setStep('counting')
        }}
      />
    )
  }

  if (step === 'counting') {
    return (
      <CountingScreen
        zoneCountId={zoneCountId!}
        materialId={session.materialId!}
        userId={userId}
        expectedQuantity={expectedQuantity}
        initialQuantity={initialQuantity}
        onSaved={() => setStep('zone-summary')}
      />
    )
  }

  if (step === 'zone-summary') {
    return (
      <ZoneSummaryPage
        zoneCountId={zoneCountId!}
        userId={userId}
        onClosed={() => setStep(onThirdPass ? 'third-pass-picker' : 'zone-picker')}
      />
    )
  }

  if (step === 'third-pass-picker') {
    return (
      <ThirdPassPickerPage
        mismatches={mismatchedPairs}
        onPairChosen={async (zoneId, materialId) => {
          setSession({ ...session, zoneId, materialId })
          const zc = await getOrOpenZoneCount(passId, zoneId, userId)
          setZoneCountId(zc.id)
          setInitialQuantity(0)
          setExpectedQuantity(await getExpectedQuantity(zoneId, materialId))
          setStep('counting')
        }}
      />
    )
  }

  // step === 'pass-close': which component renders depends on which pass is
  // currently active, since PassClosePage/VarianceReportPage/ManualResolutionPage
  // each own a different transition (pass1->pass2 or pass1->done, pass2 compare,
  // pass3 resolve).
  if (passId === pass2Id) {
    return (
      <VarianceReportPage
        inventoryId={inventoryId}
        pass1Id={pass1Id!}
        pass2Id={pass2Id}
        onResolved={(outcome, newPass3Id) => {
          if (outcome === 'successful') {
            setSession(null)
          } else if (newPass3Id) {
            setPass3Id(newPass3Id)
            setSession({ ...session, passId: newPass3Id, zoneId: undefined, materialId: undefined })
            setStep('third-pass-picker')
          }
        }}
      />
    )
  }

  if (onThirdPass) {
    return (
      <ManualResolutionPage
        inventoryId={inventoryId}
        pass1Id={pass1Id!}
        pass2Id={pass2Id!}
        pass3Id={pass3Id!}
        userId={userId}
        onResolved={() => setSession(null)}
      />
    )
  }

  return (
    <PassClosePage
      passId={passId}
      inventoryId={inventoryId}
      userId={userId}
      onFinishedSinglePass={() => setSession(null)}
      onSecondPassStarted={(newPass2Id) => {
        setPass2Id(newPass2Id)
        setSession({ ...session, passId: newPass2Id, zoneId: undefined, materialId: undefined })
        setStep('zone-picker')
      }}
    />
  )
}
```

Note two behaviors this component owns that no individual page component provides on its own:
1. `ZonePickerPage` has no "I've counted every zone" affordance — `CountingWizard` adds a "Finish this pass" / "Back to mismatch list" button above it, keeping `ZonePickerPage`'s own tested interface untouched.
2. During pass 3, closing a zone (`ZoneSummaryPage`'s `onClosed`) returns to `third-pass-picker` (the scoped mismatch list), not the general `zone-picker` — this is what keeps pass 3 actually scoped to the mismatched pairs at the UI level, matching the invariant `closeInventoryAfterReconciliation` (Task 4) enforces at the data level.

- [ ] **Step 4: Modify `src/pages/inventory/StartInventoryPage.tsx`** — add session writing and error handling. Replace the whole file:

```tsx
import { useEffect, useState } from 'react'
import { listUsers } from '../../db/repositories/userRepository'
import { startInventory } from '../../db/repositories/inventoryRepository'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import ErrorBanner from '../../components/ErrorBanner'
import type { User } from '../../db/types'

interface StartInventoryPageProps {
  onStarted: (inventoryId: string, passId: string, userId: string) => void
}

export default function StartInventoryPage({ onStarted }: StartInventoryPageProps) {
  const [users, setUsers] = useState<User[]>([])
  const [userId, setUserId] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    listUsers().then((u) => {
      setUsers(u)
      if (u.length > 0) setUserId(u[0].id)
    })
  }, [])

  const [submit, { pending, error }] = useAsyncAction(async () => {
    if (!userId || !name.trim()) return
    const { inventory, pass } = await startInventory(name.trim(), userId)
    onStarted(inventory.id, pass.id, userId)
  })

  return (
    <div className="screen">
      <h1>Start Inventory</h1>
      {error && <ErrorBanner message={error.message} />}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="form-row">
          <label htmlFor="start-inv-user">User</label>
          <select id="start-inv-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="start-inv-name">Inventory name</label>
          <input id="start-inv-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="submit" disabled={pending}>Start inventory</button>
      </form>
    </div>
  )
}
```

Note: `onStarted`'s signature gains a third `userId` argument — this is a deliberate, documented interface change (per the Global Constraints exception for this task). Task 5 Step 5 updates the one caller (`App.tsx`) to match; no other task calls `StartInventoryPage`.

- [ ] **Step 5: Modify `src/App.tsx`** — replace the whole file:

```tsx
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom'
import { CountingSessionProvider, useCountingSession } from './context/CountingSession'
import HomePage from './pages/HomePage'
import UsersPage from './pages/masterData/UsersPage'
import UnitsPage from './pages/masterData/UnitsPage'
import ZonesPage from './pages/masterData/ZonesPage'
import MaterialsPage from './pages/masterData/MaterialsPage'
import ImportPage from './pages/masterData/ImportPage'
import StartInventoryPage from './pages/inventory/StartInventoryPage'
import CountingWizard from './pages/inventory/CountingWizard'
import InventoriesListPage from './pages/inventory/InventoriesListPage'
import ExportPage from './pages/ExportPage'
import BackupPage from './pages/BackupPage'

function MasterDataHome() {
  return (
    <div className="screen">
      <h1>Master Data</h1>
      <ul>
        <li><Link to="/master-data/users">Users</Link></li>
        <li><Link to="/master-data/units">Units</Link></li>
        <li><Link to="/master-data/zones">Zones</Link></li>
        <li><Link to="/master-data/materials">Materials</Link></li>
        <li><Link to="/master-data/import">Import from CSV</Link></li>
      </ul>
    </div>
  )
}

function StartInventoryRoute() {
  const navigate = useNavigate()
  const { setSession } = useCountingSession()
  return (
    <StartInventoryPage
      onStarted={(inventoryId, passId, userId) => {
        setSession({ userId, inventoryId, passId })
        navigate(`/inventory/${inventoryId}/pass/${passId}`)
      }}
    />
  )
}

function ExportRoute() {
  const { inventoryId } = useParams<{ inventoryId: string }>()
  return <ExportPage inventoryId={inventoryId!} />
}

function App() {
  return (
    <CountingSessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/master-data" element={<MasterDataHome />} />
          <Route path="/master-data/users" element={<UsersPage />} />
          <Route path="/master-data/units" element={<UnitsPage />} />
          <Route path="/master-data/zones" element={<ZonesPage />} />
          <Route path="/master-data/materials" element={<MaterialsPage />} />
          <Route path="/master-data/import" element={<ImportPage />} />
          <Route path="/inventory/new" element={<StartInventoryRoute />} />
          <Route path="/inventory/:inventoryId/pass/:passId" element={<CountingWizard />} />
          <Route path="/inventory/:inventoryId/export" element={<ExportRoute />} />
          <Route path="/inventories" element={<InventoriesListPage />} />
          <Route path="/backup" element={<BackupPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </BrowserRouter>
    </CountingSessionProvider>
  )
}

export default App
```

Note: `InventoriesListPage` (Task 9) and `BackupPage` (Task 10) don't exist yet at this point in a strict linear read of the plan — if this task is implemented before Tasks 9/10 land, stub them minimally so the build passes (`export default function InventoriesListPage() { return <div className="screen">Inventories</div> }` and the equivalent for `BackupPage`), and Tasks 9/10 will replace the stub with the real implementation. If Tasks 9/10 are implemented first or in parallel, skip the stub and import the real files directly.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/pages/inventory/CountingWizard.test.tsx`
Expected: PASS

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS — `App.test.tsx` (from Phase 1) still passes since `HomePage`'s links/heading are unchanged by this task; `StartInventoryPage.test.tsx` needs its `onStarted` mock call-site checked against the new 3-arg signature — update the assertion from `expect(onStarted).toHaveBeenCalledWith(expect.any(String), expect.any(String))` to `expect(onStarted).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(String))` in `src/pages/inventory/StartInventoryPage.test.tsx`.

- [ ] **Step 8: Run build**

Run: `npm run build`
Expected: PASS, exit code 0

- [ ] **Step 9: Commit**

```bash
git add src/pages/inventory/CountingWizard.tsx src/pages/inventory/CountingWizard.test.tsx src/pages/inventory/StartInventoryPage.tsx src/pages/inventory/StartInventoryPage.test.tsx src/App.tsx
git commit -m "feat: wire counting/reconciliation wizard into app routing with persisted session"
```

---

### Task 6: Manual Resolution Page — Completeness Check, Error Handling, Name Lookups

**Files:**
- Modify: `src/pages/inventory/ManualResolutionPage.tsx`
- Modify: `src/pages/inventory/ManualResolutionPage.test.tsx`

**Interfaces:**
- Consumes: `closeInventoryAfterReconciliation` (Task 4), `useAsyncAction` + `ErrorBanner` (Task 1).
- No prop-interface change — `ManualResolutionPageProps` stays as `{ inventoryId, pass1Id, pass2Id, pass3Id, userId, onResolved }`.

- [ ] **Step 1: Write the failing test** — add to `src/pages/inventory/ManualResolutionPage.test.tsx` (keep the existing test in the file):

```tsx
it('shows an error and does not resolve when the completeness check rejects', async () => {
  const { inventory, pass } = await startInventory('Inv', 'user-1')
  await countAndClose(pass.id, 'zone-1', 'material-1', 10)
  await countAndClose(pass.id, 'zone-2', 'material-2', 10)
  await closePass(pass.id, 'user-1')

  const pass2 = await startNextPass(inventory.id, 2)
  await countAndClose(pass2.id, 'zone-1', 'material-1', 12)
  await countAndClose(pass2.id, 'zone-2', 'material-2', 20)
  await closePass(pass2.id, 'user-1')

  const pass3 = await startNextPass(inventory.id, 3)
  // Only recount zone-1/material-1 (all three differ) -- zone-2/material-2 is left uncounted.
  await countAndClose(pass3.id, 'zone-1', 'material-1', 14)

  const onResolved = vi.fn()
  const user = userEvent.setup()
  render(
    <ManualResolutionPage
      inventoryId={inventory.id} pass1Id={pass.id} pass2Id={pass2.id} pass3Id={pass3.id}
      userId="user-1" onResolved={onResolved}
    />,
  )

  await user.type(await screen.findByLabelText(/final quantity/i), '13')
  await user.type(screen.getByLabelText(/reason/i), 'supervisor recount')
  await user.click(screen.getByRole('button', { name: /confirm final count/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/zone-2.*material-2|material-2.*zone-2/i)
  expect(onResolved).not.toHaveBeenCalled()
  const updated = await db.inventories.get(inventory.id)
  expect(updated?.status).toBe('in_progress')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/inventory/ManualResolutionPage.test.tsx`
Expected: FAIL — no error banner rendered, inventory still gets closed as `'successful'` by the current unconditional `closeInventory` call.

- [ ] **Step 3: Modify `src/pages/inventory/ManualResolutionPage.tsx`** — replace the whole file:

```tsx
import { useEffect, useState } from 'react'
import {
  getPassLines, setCountLine, getOrOpenZoneCount, reopenTarget, closeZoneCount,
  closeInventoryAfterReconciliation,
} from '../../db/repositories/inventoryRepository'
import { resolveThirdPass, type ThirdPassResolution } from '../../domain/reconciliation'
import type { CountLineSnapshot } from '../../domain/reconciliation'
import { db } from '../../db/schema'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import ErrorBanner from '../../components/ErrorBanner'

interface ManualResolutionPageProps {
  inventoryId: string
  pass1Id: string
  pass2Id: string
  pass3Id: string
  userId: string
  onResolved: () => void
}

interface NeedsManualDisplay extends ThirdPassResolution {
  zoneName: string
  materialName: string
}

export default function ManualResolutionPage({
  inventoryId, pass1Id, pass2Id, pass3Id, userId, onResolved,
}: ManualResolutionPageProps) {
  const [needsManual, setNeedsManual] = useState<NeedsManualDisplay[]>([])
  const [entries, setEntries] = useState<Record<string, { quantity: string; reason: string }>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    (async () => {
      const pass1Lines: CountLineSnapshot[] = await getPassLines(pass1Id)
      const pass2Lines: CountLineSnapshot[] = await getPassLines(pass2Id)
      const pass3Lines: CountLineSnapshot[] = await getPassLines(pass3Id)
      const resolutions = resolveThirdPass(pass1Lines, pass2Lines, pass3Lines)
      const manual = resolutions.filter((r) => r.resolution === 'needs_manual_resolution')
      const withNames = await Promise.all(
        manual.map(async (item) => {
          const zone = await db.zones.get(item.zoneId)
          const material = await db.materials.get(item.materialId)
          return { ...item, zoneName: zone?.name ?? item.zoneId, materialName: material?.name ?? item.materialId }
        }),
      )
      setNeedsManual(withNames)
      setLoaded(true)
    })()
  }, [pass1Id, pass2Id, pass3Id])

  const [submit, { pending, error }] = useAsyncAction(async () => {
    const allComplete = needsManual.every((item) => {
      const key = `${item.zoneId}-${item.materialId}`
      const entry = entries[key]
      return entry && entry.quantity !== '' && entry.reason.trim()
    })
    if (!allComplete) return

    for (const item of needsManual) {
      const key = `${item.zoneId}-${item.materialId}`
      const entry = entries[key]!
      const zoneCount = await getOrOpenZoneCount(pass3Id, item.zoneId, userId)
      if (zoneCount.status === 'closed') {
        await reopenTarget('zoneCount', zoneCount.id, userId, entry.reason)
      }
      await setCountLine(zoneCount.id, item.materialId, Number(entry.quantity), userId)
      await closeZoneCount(zoneCount.id, userId)
    }
    await closeInventoryAfterReconciliation(inventoryId, pass1Id, pass2Id, pass3Id, userId)
    onResolved()
  })

  if (!loaded) return <div className="screen">Loading…</div>

  return (
    <div className="screen">
      <h1>Manual Resolution Needed</h1>
      {error && <ErrorBanner message={error.message} />}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {needsManual.map((item) => {
          const key = `${item.zoneId}-${item.materialId}`
          return (
            <div key={key} className="form-row">
              <p>Needs manual resolution — Zone {item.zoneName} / Material {item.materialName}</p>
              <label htmlFor={`qty-${key}`}>Final quantity</label>
              <input
                id={`qty-${key}`}
                aria-label={`final quantity for zone ${item.zoneId} material ${item.materialId}`}
                type="number"
                value={entries[key]?.quantity ?? ''}
                onChange={(e) =>
                  setEntries((prev) => ({ ...prev, [key]: { quantity: e.target.value, reason: prev[key]?.reason ?? '' } }))
                }
              />
              <label htmlFor={`reason-${key}`}>Reason</label>
              <input
                id={`reason-${key}`}
                aria-label={`reason for zone ${item.zoneId} material ${item.materialId}`}
                value={entries[key]?.reason ?? ''}
                onChange={(e) =>
                  setEntries((prev) => ({ ...prev, [key]: { quantity: prev[key]?.quantity ?? '', reason: e.target.value } }))
                }
              />
            </div>
          )
        })}
        <button type="submit" disabled={pending}>Confirm final count</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/inventory/ManualResolutionPage.test.tsx`
Expected: PASS (both the original test and the new one — the original test's single-mismatch scenario has no missing pairs, so `closeInventoryAfterReconciliation` succeeds and behaves like the old direct `closeInventory` call).

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: PASS, exit code 0

- [ ] **Step 6: Commit**

```bash
git add src/pages/inventory/ManualResolutionPage.tsx src/pages/inventory/ManualResolutionPage.test.tsx
git commit -m "feat: enforce completeness check, add error handling and name lookups to ManualResolutionPage"
```

---

### Task 7: Error Handling, Name Lookups, and needs_3rd_pass Persistence on the Remaining Wizard Pages

**Files:**
- Modify: `src/pages/inventory/PassClosePage.tsx`
- Modify: `src/pages/inventory/CountingScreen.tsx`
- Modify: `src/pages/inventory/CountingScreen.test.tsx`
- Modify: `src/pages/inventory/ZoneSummaryPage.tsx`
- Modify: `src/pages/inventory/VarianceReportPage.tsx`
- Modify: `src/pages/inventory/VarianceReportPage.test.tsx`

**Interfaces:**
- Consumes: `useAsyncAction`, `ErrorBanner` (Task 1). No prop-interface changes to any of these four components.

- [ ] **Step 1: Modify `src/pages/inventory/PassClosePage.tsx`** — replace the whole file:

```tsx
import { closePass, startNextPass, closeInventory } from '../../db/repositories/inventoryRepository'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import ErrorBanner from '../../components/ErrorBanner'

interface PassClosePageProps {
  passId: string
  inventoryId: string
  userId: string
  onFinishedSinglePass: () => void
  onSecondPassStarted: (passId: string) => void
}

export default function PassClosePage({
  passId, inventoryId, userId, onFinishedSinglePass, onSecondPassStarted,
}: PassClosePageProps) {
  const [finishSinglePass, finishState] = useAsyncAction(async () => {
    await closePass(passId, userId)
    await closeInventory(inventoryId, 'closed_single_pass')
    onFinishedSinglePass()
  })

  const [startSecondPass, secondPassState] = useAsyncAction(async () => {
    await closePass(passId, userId)
    const pass = await startNextPass(inventoryId, 2)
    onSecondPassStarted(pass.id)
  })

  const error = finishState.error ?? secondPassState.error

  return (
    <div className="screen">
      <h1>Pass 1 Complete</h1>
      {error && <ErrorBanner message={error.message} />}
      <p>Choose how to proceed:</p>
      <button type="button" disabled={finishState.pending} onClick={() => finishSinglePass()}>
        Finish with one pass
      </button>
      <button type="button" className="secondary" disabled={secondPassState.pending} onClick={() => startSecondPass()}>
        Start second pass
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Modify `src/pages/inventory/CountingScreen.tsx`** — replace the whole file:

```tsx
import { useState } from 'react'
import { setCountLine } from '../../db/repositories/inventoryRepository'
import { savePhoto } from '../../db/repositories/photoRepository'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import ErrorBanner from '../../components/ErrorBanner'
import TapCounter from '../../components/TapCounter'
import PhotoCapture from '../../components/PhotoCapture'

interface CountingScreenProps {
  zoneCountId: string
  materialId: string
  userId: string
  expectedQuantity?: number
  initialQuantity: number
  onSaved: () => void
}

export default function CountingScreen({
  zoneCountId, materialId, userId, expectedQuantity, initialQuantity, onSaved,
}: CountingScreenProps) {
  const [quantity, setQuantity] = useState(initialQuantity)
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)

  const [save, { pending, error }] = useAsyncAction(async () => {
    const photoBlobId = photoBlob ? await savePhoto(photoBlob) : undefined
    await setCountLine(zoneCountId, materialId, quantity, userId, expectedQuantity, photoBlobId)
    onSaved()
  })

  return (
    <div className="screen">
      <h1>Count</h1>
      {error && <ErrorBanner message={error.message} />}
      {expectedQuantity !== undefined && (
        <p>
          Expected: {expectedQuantity}{' '}
          {Math.abs(quantity - expectedQuantity) / Math.max(expectedQuantity, 1) > 0.1 && (
            <span className="variance-warning">Variance: {quantity - expectedQuantity}</span>
          )}
        </p>
      )}
      <TapCounter value={quantity} onChange={setQuantity} />
      <PhotoCapture onCapture={setPhotoBlob} />
      <button type="button" disabled={pending} onClick={() => save()}>
        Save count
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Add a failing test for the error path** — add to `src/pages/inventory/CountingScreen.test.tsx` (keep existing tests):

```tsx
it('shows an error banner if saving fails', async () => {
  // No matching zoneCount exists in the DB, so setCountLine will throw "Zone count not found".
  const onSaved = vi.fn()
  const user = userEvent.setup()
  render(
    <CountingScreen
      zoneCountId="nonexistent-zc"
      materialId="material-1"
      userId="user-1"
      initialQuantity={0}
      onSaved={onSaved}
    />,
  )

  await user.click(screen.getByRole('button', { name: /save/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/zone count not found/i)
  expect(onSaved).not.toHaveBeenCalled()
})
```

- [ ] **Step 4: Run test to verify it fails, then passes**

Run: `npx vitest run src/pages/inventory/CountingScreen.test.tsx`
Expected: first FAIL against the pre-Step-2 file (no error banner exists), then PASS once Step 2's implementation is in place — run once now to confirm PASS (both the pre-existing and new test).

- [ ] **Step 5: Modify `src/pages/inventory/ZoneSummaryPage.tsx`** — replace the whole file:

```tsx
import { useEffect, useState } from 'react'
import { closeZoneCount } from '../../db/repositories/inventoryRepository'
import { db } from '../../db/schema'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import ErrorBanner from '../../components/ErrorBanner'
import type { MaterialCountLine, Material } from '../../db/types'

interface ZoneSummaryPageProps {
  zoneCountId: string
  userId: string
  onClosed: () => void
}

export default function ZoneSummaryPage({ zoneCountId, userId, onClosed }: ZoneSummaryPageProps) {
  const [lines, setLines] = useState<Array<MaterialCountLine & { materialName: string }>>([])

  useEffect(() => {
    (async () => {
      const rawLines = await db.countLines.where('zoneCountId').equals(zoneCountId).toArray()
      const withNames = await Promise.all(
        rawLines.map(async (l) => {
          const material: Material | undefined = await db.materials.get(l.materialId)
          return { ...l, materialName: material?.name ?? l.materialId }
        }),
      )
      setLines(withNames)
    })()
  }, [zoneCountId])

  const [close, { pending, error }] = useAsyncAction(async () => {
    await closeZoneCount(zoneCountId, userId)
    onClosed()
  })

  return (
    <div className="screen">
      <h1>Zone Summary</h1>
      {error && <ErrorBanner message={error.message} />}
      <ul>
        {lines.map((l) => (
          <li key={l.id} className="list-item">{l.materialName}: {l.quantity}</li>
        ))}
      </ul>
      <button type="button" disabled={pending} onClick={() => close()}>
        Close zone
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Modify `src/pages/inventory/VarianceReportPage.tsx`** — replace the whole file:

```tsx
import { useEffect, useState } from 'react'
import { getPassLines, closeInventory, startNextPass } from '../../db/repositories/inventoryRepository'
import { comparePasses } from '../../domain/reconciliation'
import type { CountLineSnapshot } from '../../domain/reconciliation'
import { db } from '../../db/schema'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import ErrorBanner from '../../components/ErrorBanner'

interface VarianceReportPageProps {
  inventoryId: string
  pass1Id: string
  pass2Id: string
  onResolved: (outcome: 'successful' | 'needs_3rd_pass', pass3Id?: string) => void
}

interface MismatchDisplay {
  zoneId: string
  materialId: string
  zoneName: string
  materialName: string
  passAQuantity: number
  passBQuantity: number
}

export default function VarianceReportPage({ inventoryId, pass1Id, pass2Id, onResolved }: VarianceReportPageProps) {
  const [mismatched, setMismatched] = useState<MismatchDisplay[] | null>(null)
  const [loadError, setLoadError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const pass1Lines: CountLineSnapshot[] = await getPassLines(pass1Id)
        const pass2Lines: CountLineSnapshot[] = await getPassLines(pass2Id)
        const { mismatched: diffs } = comparePasses(pass1Lines, pass2Lines)

        if (cancelled) return

        if (diffs.length === 0) {
          await closeInventory(inventoryId, 'successful')
          if (cancelled) return
          setMismatched([])
          onResolved('successful')
        } else {
          await closeInventory(inventoryId, 'needs_3rd_pass')
          if (cancelled) return
          const withNames = await Promise.all(
            diffs.map(async (d) => {
              const zone = await db.zones.get(d.zoneId)
              const material = await db.materials.get(d.materialId)
              return { ...d, zoneName: zone?.name ?? d.zoneId, materialName: material?.name ?? d.materialId }
            }),
          )
          if (cancelled) return
          setMismatched(withNames)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err : new Error(String(err)))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [inventoryId, pass1Id, pass2Id, onResolved])

  const [startThirdPass, { pending, error: startError }] = useAsyncAction(async () => {
    const pass3 = await startNextPass(inventoryId, 3)
    onResolved('needs_3rd_pass', pass3.id)
  })

  const error = loadError ?? startError

  if (error && mismatched === null) {
    return (
      <div className="screen">
        <ErrorBanner message={error.message} />
      </div>
    )
  }

  if (mismatched === null) return <div className="screen">Comparing passes…</div>

  if (mismatched.length === 0) {
    return (
      <div className="screen">
        <h1>Inventory Successful</h1>
        <p>Both passes matched on every zone and material.</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <h1>Pass 1 vs Pass 2 Mismatches</h1>
      {error && <ErrorBanner message={error.message} />}
      <ul>
        {mismatched.map((m) => (
          <li key={`${m.zoneId}-${m.materialId}`} className="list-item">
            Zone {m.zoneName} / Material {m.materialName}: {m.passAQuantity} vs {m.passBQuantity}
          </li>
        ))}
      </ul>
      <button type="button" disabled={pending} onClick={() => startThirdPass()}>
        Start third pass
      </button>
    </div>
  )
}
```

- [ ] **Step 7: Update the existing mismatch test's assertion in `src/pages/inventory/VarianceReportPage.test.tsx`** — the "lists mismatches and starts a third pass" test currently asserts on raw text via `screen.findByText(/10/)`; zone/material names are now shown instead of ids, but the quantities `10`/`12` still render as visible text, so no change is needed there. Add one new assertion to that same test, directly after the existing `expect(screen.getByText(/12/)).toBeInTheDocument()` line, to lock in the new `needs_3rd_pass` persistence behavior:

```tsx
const updatedInventory = await db.inventories.get(inventory.id)
expect(updatedInventory?.status).toBe('needs_3rd_pass')
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/pages/inventory/PassClosePage.test.tsx src/pages/inventory/CountingScreen.test.tsx src/pages/inventory/ZoneSummaryPage.test.tsx src/pages/inventory/VarianceReportPage.test.tsx`
Expected: PASS. (`ZoneSummaryPage` has no dedicated test file per Phase 1's plan — it's exercised indirectly through `CountingWizard.test.tsx`; running the other three explicitly is sufficient here.)

- [ ] **Step 9: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: both PASS, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add src/pages/inventory/PassClosePage.tsx src/pages/inventory/CountingScreen.tsx src/pages/inventory/CountingScreen.test.tsx src/pages/inventory/ZoneSummaryPage.tsx src/pages/inventory/VarianceReportPage.tsx src/pages/inventory/VarianceReportPage.test.tsx
git commit -m "feat: add error handling, name lookups, and needs_3rd_pass persistence to remaining wizard pages"
```

---

### Task 8: Third Pass Picker — Name Lookups

**Files:**
- Modify: `src/pages/inventory/ThirdPassPickerPage.tsx`

**Interfaces:**
- No prop-interface change (`ThirdPassPickerPageProps` stays `{ mismatches, onPairChosen }`) — this component looks up names itself since `mismatches` only carries ids.

- [ ] **Step 1: Modify `src/pages/inventory/ThirdPassPickerPage.tsx`** — replace the whole file:

```tsx
import { useEffect, useState } from 'react'
import { db } from '../../db/schema'

interface ThirdPassPickerPageProps {
  mismatches: Array<{ zoneId: string; materialId: string }>
  onPairChosen: (zoneId: string, materialId: string) => void
}

interface DisplayPair {
  zoneId: string
  materialId: string
  zoneName: string
  materialName: string
}

export default function ThirdPassPickerPage({ mismatches, onPairChosen }: ThirdPassPickerPageProps) {
  const [pairs, setPairs] = useState<DisplayPair[]>([])

  useEffect(() => {
    (async () => {
      const withNames = await Promise.all(
        mismatches.map(async (m) => {
          const zone = await db.zones.get(m.zoneId)
          const material = await db.materials.get(m.materialId)
          return { ...m, zoneName: zone?.name ?? m.zoneId, materialName: material?.name ?? m.materialId }
        }),
      )
      setPairs(withNames)
    })()
  }, [mismatches])

  return (
    <div className="screen">
      <h1>Third Pass — Recount Mismatches</h1>
      <ul>
        {pairs.map((m) => (
          <li key={`${m.zoneId}-${m.materialId}`}>
            <button
              className="secondary"
              style={{ width: '100%' }}
              onClick={() => onPairChosen(m.zoneId, m.materialId)}
            >
              {m.zoneName} / {m.materialName}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: both PASS, exit code 0. (No dedicated test file existed for this component in Phase 1 — it remains exercised indirectly through `CountingWizard.test.tsx` and manual verification.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/inventory/ThirdPassPickerPage.tsx
git commit -m "feat: show zone/material names instead of ids on third pass picker"
```

---

### Task 9: Inventories List Page

**Files:**
- Create: `src/pages/inventory/InventoriesListPage.tsx`, `src/pages/inventory/InventoriesListPage.test.tsx`
- Modify: `src/pages/HomePage.tsx`

**Interfaces:**
- Consumes: `useCountingSession` (Task 2); `db` directly for reads.
- Produces: `<InventoriesListPage />` — mounted at route `/inventories` (added to `App.tsx` in Task 5; if Task 9 lands after Task 5, this replaces that task's stub).

- [ ] **Step 1: Write the failing test — `src/pages/inventory/InventoriesListPage.test.tsx`**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../../db/schema'
import { CountingSessionProvider } from '../../context/CountingSession'
import { startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount, closePass } from '../../db/repositories/inventoryRepository'
import InventoriesListPage from './InventoriesListPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  window.localStorage.clear()
})

describe('InventoriesListPage', () => {
  it('lists inventories with a Resume link for in-progress ones and a View/Export link for closed ones', async () => {
    const { inventory: openInv } = await startInventory('Open Inventory', 'user-1')

    const { inventory: closedInv, pass } = await startInventory('Closed Inventory', 'user-1')
    const zc = await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')
    await setCountLine(zc.id, 'material-1', 5, 'user-1')
    await closeZoneCount(zc.id, 'user-1')
    await closePass(pass.id, 'user-1')
    await db.inventories.put({ ...(await db.inventories.get(closedInv.id))!, status: 'closed_single_pass' })

    render(
      <CountingSessionProvider>
        <MemoryRouter>
          <InventoriesListPage />
        </MemoryRouter>
      </CountingSessionProvider>,
    )

    expect(await screen.findByText('Open Inventory')).toBeInTheDocument()
    expect(screen.getByText('Closed Inventory')).toBeInTheDocument()

    const openRow = screen.getByText('Open Inventory').closest('li')!
    expect(within(openRow).getByRole('link', { name: /resume/i })).toHaveAttribute(
      'href',
      expect.stringContaining(`/inventory/${openInv.id}/pass/`),
    )

    const closedRow = screen.getByText('Closed Inventory').closest('li')!
    expect(within(closedRow).getByRole('link', { name: /view.*export/i })).toHaveAttribute(
      'href',
      `/inventory/${closedInv.id}/export`,
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/inventory/InventoriesListPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/pages/inventory/InventoriesListPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../db/schema'
import { useCountingSession } from '../../context/CountingSession'
import type { Inventory, InventoryPass } from '../../db/types'

export default function InventoriesListPage() {
  const { setSession } = useCountingSession()
  const [rows, setRows] = useState<Array<{ inventory: Inventory; currentPass: InventoryPass | undefined }>>([])

  useEffect(() => {
    (async () => {
      const inventories = (await db.inventories.toArray()).sort((a, b) => b.createdAt - a.createdAt)
      const withPasses = await Promise.all(
        inventories.map(async (inventory) => {
          const passes = await db.passes.where('inventoryId').equals(inventory.id).toArray()
          const currentPass = passes.sort((a, b) => b.passNumber - a.passNumber)[0]
          return { inventory, currentPass }
        }),
      )
      setRows(withPasses)
    })()
  }, [])

  return (
    <div className="screen">
      <h1>Inventories</h1>
      <ul>
        {rows.map(({ inventory, currentPass }) => (
          <li key={inventory.id} className="list-item">
            <span>{inventory.name} ({inventory.status})</span>
            {(inventory.status === 'in_progress' || inventory.status === 'needs_3rd_pass') && currentPass && (
              <Link
                to={`/inventory/${inventory.id}/pass/${currentPass.id}`}
                onClick={() => setSession({ userId: inventory.createdByUserId, inventoryId: inventory.id, passId: currentPass.id })}
              >
                Resume
              </Link>
            )}
            {(inventory.status === 'closed_single_pass' || inventory.status === 'successful') && (
              <Link to={`/inventory/${inventory.id}/export`}>View / Export</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/inventory/InventoriesListPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Modify `src/pages/HomePage.tsx`** — replace the whole file:

```tsx
import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div className="screen">
      <h1>MX Inventory</h1>
      <ul>
        <li><Link to="/inventory/new">Start Inventory</Link></li>
        <li><Link to="/inventories">Inventories</Link></li>
        <li><Link to="/master-data">Master Data</Link></li>
        <li><Link to="/backup">Backup</Link></li>
      </ul>
    </div>
  )
}
```

- [ ] **Step 6: Run the full suite** — `App.test.tsx` (Phase 1) asserts `getByRole('link', { name: /start inventory/i })` and `/master-data/i` exist; both still do. Confirm it still passes alongside everything else.

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Run build**

Run: `npm run build`
Expected: PASS, exit code 0

- [ ] **Step 8: Commit**

```bash
git add src/pages/inventory/InventoriesListPage.tsx src/pages/inventory/InventoriesListPage.test.tsx src/pages/HomePage.tsx
git commit -m "feat: add inventories list page with resume/view-export, link from home"
```

---

### Task 10: Backup Page and Backup Fidelity Fixes

**Files:**
- Modify: `src/domain/backup.ts`
- Modify: `src/domain/backup.test.ts`
- Create: `src/pages/BackupPage.tsx`, `src/pages/BackupPage.test.tsx`

**Interfaces:**
- Produces (backup.ts additions): `clearAllData(): Promise<void>` (clears every Dexie table, including `photos` and `expectedQuantities`); backup JSON gains a top-level `formatVersion: 1` field and a `photoMeta: Array<{ id: string; type: string; createdAt: number }>` alongside the existing `photoIds`.
- Produces (page): `<BackupPage />` — mounted at `/backup`.

- [ ] **Step 1: Write the failing test additions** — add to `src/domain/backup.test.ts` (keep the existing test):

```ts
import { clearAllData } from './backup'

it('preserves photo MIME type and original createdAt through export and import', async () => {
  const originalBlob = new Blob(['fake-bytes'], { type: 'image/jpeg' })
  const photoId = await savePhoto(originalBlob)
  const before = await db.photos.get(photoId)

  const zip = await exportBackup()
  await Promise.all(db.tables.map((t) => t.clear()))
  await importBackup(zip)

  const after = await db.photos.get(photoId)
  expect(after?.blob.type).toBe('image/jpeg')
  expect(after?.createdAt).toBe(before?.createdAt)
})

it('clearAllData empties every table', async () => {
  await createUser('Alex')
  await savePhoto(new Blob(['x']))
  await clearAllData()

  expect(await db.users.count()).toBe(0)
  expect(await db.photos.count()).toBe(0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/backup.test.ts`
Expected: FAIL — `clearAllData` not exported; photo `type`/`createdAt` not preserved (current `importBackup` always writes `new Blob([bytes])` with no type, and `createdAt: Date.now()`).

- [ ] **Step 3: Modify `src/domain/backup.ts`** — replace the whole file:

```ts
import JSZip from 'jszip'
import { db } from '../db/schema'

const DATA_TABLES = [
  'users', 'units', 'materials', 'zones', 'inventories', 'passes',
  'zoneCounts', 'countLines', 'auditEntries', 'reopenLogs', 'expectedQuantities',
] as const

const FORMAT_VERSION = 1

export async function exportBackup(): Promise<Blob> {
  const zip = new JSZip()

  const data: Record<string, unknown[]> = {}
  for (const tableName of DATA_TABLES) {
    data[tableName] = await db.table(tableName).toArray()
  }

  const photos = await db.photos.toArray()
  data.photoMeta = photos.map((p) => ({ id: p.id, type: p.blob.type, createdAt: p.createdAt }))
  data.formatVersion = FORMAT_VERSION

  zip.file('data.json', JSON.stringify(data))
  const photosFolder = zip.folder('photos')!
  for (const photo of photos) {
    const bytes = new Uint8Array(await photo.blob.arrayBuffer())
    photosFolder.file(`${photo.id}.bin`, bytes)
  }

  return zip.generateAsync({ type: 'blob' })
}

export async function importBackup(zipBlob: Blob): Promise<void> {
  const zipBytes = new Uint8Array(await zipBlob.arrayBuffer())
  const zip = await JSZip.loadAsync(zipBytes)
  const dataFile = zip.file('data.json')
  if (!dataFile) throw new Error('Invalid backup: missing data.json')

  const data = JSON.parse(await dataFile.async('string')) as Record<string, unknown[]> & {
    photoMeta?: Array<{ id: string; type: string; createdAt: number }>
    photoIds?: string[]
    formatVersion?: number
  }

  for (const tableName of DATA_TABLES) {
    const rows = (data[tableName] ?? []) as Array<Record<string, unknown>>
    if (rows.length > 0) await db.table(tableName).bulkPut(rows)
  }

  // photoMeta is the current format; photoIds is kept as a fallback so a
  // backup produced by an older version of this app can still restore its
  // photos (just without the original MIME type/timestamp).
  const photoMeta = data.photoMeta ?? (data.photoIds ?? []).map((id) => ({ id, type: '', createdAt: Date.now() }))

  for (const meta of photoMeta) {
    const file = zip.file(`photos/${meta.id}.bin`)
    if (!file) continue
    const bytes = await file.async('uint8array')
    const blob = new Blob([new Uint8Array(bytes)], meta.type ? { type: meta.type } : undefined)
    await db.photos.put({ id: meta.id, blob, createdAt: meta.createdAt })
  }
}

export async function clearAllData(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/backup.test.ts`
Expected: PASS — all three tests (the original round-trip test, and the two new ones). Run a few times in a row to confirm stability, matching this project's established pattern for Blob/JSZip-adjacent code.

- [ ] **Step 5: Write the failing test — `src/pages/BackupPage.test.tsx`**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../db/schema'
import { createUser } from '../db/repositories/userRepository'
import BackupPage from './BackupPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('BackupPage', () => {
  it('renders an export link once a backup is generated', async () => {
    await createUser('Alex')
    render(<BackupPage />)

    const link = await screen.findByRole('link', { name: /export backup/i })
    expect(link).toHaveAttribute('download', 'mx-inventory-backup.zip')
  })

  it('warns before import and replaces all data on confirm', async () => {
    await createUser('Old User')
    render(<BackupPage />)

    // Build a real backup blob from a *different* dataset to import.
    await Promise.all(db.tables.map((t) => t.clear()))
    await createUser('New User')
    const { exportBackup } = await import('../domain/backup')
    const zip = await exportBackup()
    await Promise.all(db.tables.map((t) => t.clear()))
    await createUser('Old User')

    const file = new File([zip], 'backup.zip', { type: 'application/zip' })
    const input = screen.getByLabelText(/restore from backup/i) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/replaces all data/i)).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(async () => {
      const users = await db.users.toArray()
      expect(users.map((u) => u.name)).toEqual(['New User'])
    })
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/pages/BackupPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Create `src/pages/BackupPage.tsx`**

```tsx
import { useState } from 'react'
import { exportBackup, importBackup, clearAllData } from '../domain/backup'
import { useAsyncAction } from '../hooks/useAsyncAction'
import ErrorBanner from '../components/ErrorBanner'

export default function BackupPage() {
  const [exportUrl, setExportUrl] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const [runExport, exportState] = useAsyncAction(async () => {
    const blob = await exportBackup()
    setExportUrl(URL.createObjectURL(blob))
  })

  const [confirmImport, importState] = useAsyncAction(async () => {
    if (!pendingFile) return
    await clearAllData()
    await importBackup(pendingFile)
    setPendingFile(null)
  })

  const error = exportState.error ?? importState.error

  return (
    <div className="screen">
      <h1>Backup</h1>
      {error && <ErrorBanner message={error.message} />}

      <div className="form-row">
        <button type="button" disabled={exportState.pending} onClick={() => runExport()}>
          Export backup
        </button>
        {exportUrl && (
          <a href={exportUrl} download="mx-inventory-backup.zip">Download backup file</a>
        )}
      </div>

      <div className="form-row">
        <label htmlFor="restore-backup-input">Restore from backup</label>
        <input
          id="restore-backup-input"
          aria-label="Restore from backup"
          type="file"
          accept=".zip"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) setPendingFile(file)
          }}
        />
      </div>

      {pendingFile && (
        <div className="form-row">
          <p>This replaces all data currently on this device — continue?</p>
          <button type="button" disabled={importState.pending} onClick={() => confirmImport()}>
            Confirm
          </button>
          <button type="button" className="secondary" onClick={() => setPendingFile(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/pages/BackupPage.test.tsx`
Expected: PASS

- [ ] **Step 9: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: both PASS, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add src/domain/backup.ts src/domain/backup.test.ts src/pages/BackupPage.tsx src/pages/BackupPage.test.tsx
git commit -m "feat: add backup page, preserve photo fidelity, add clearAllData and formatVersion"
```

---

### Task 11: Expected-Quantity CSV Import

**Files:**
- Modify: `src/pages/masterData/ImportPage.tsx`
- Modify: `src/pages/masterData/ImportPage.test.tsx`

**Interfaces:**
- Consumes: `parseExpectedQuantitiesCsv` (already exists in `src/domain/csv.ts`), `setExpectedQuantity` (Task 3), `listZones`, `listMaterials`.

- [ ] **Step 1: Write the failing test** — add to `src/pages/masterData/ImportPage.test.tsx` (keep existing tests):

```tsx
it('imports expected quantities matched by zone and material name', async () => {
  const zone = await createZone({ name: 'Warehouse A' })
  const unit = await createUnit('KG', 'Kilogram')
  const material = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })

  render(<ImportPage />)

  const csv = 'zoneName,materialName,expectedQuantity\nWarehouse A,Kraft Paper,150\nUnknown Zone,Kraft Paper,10'
  const file = new File([csv], 'expected.csv', { type: 'text/csv' })
  const input = screen.getByLabelText(/expected quantities csv/i) as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })

  expect(await screen.findByText(/imported 1 expected quantit/i)).toBeInTheDocument()
  expect(await getExpectedQuantity(zone.id, material.id)).toBe(150)
})
```

This requires importing `createZone`, `createUnit`, `createMaterial`, and `getExpectedQuantity` at the top of the test file alongside the existing imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/masterData/ImportPage.test.tsx`
Expected: FAIL — no "expected quantities csv" label exists yet.

- [ ] **Step 3: Modify `src/pages/masterData/ImportPage.tsx`** — replace the whole file:

```tsx
import { useState } from 'react'
import { parseZonesCsv, parseMaterialsCsv, parseExpectedQuantitiesCsv } from '../../domain/csv'
import { createZone, listZones } from '../../db/repositories/zoneRepository'
import { createMaterial, listMaterials } from '../../db/repositories/materialRepository'
import { listUnits } from '../../db/repositories/unitRepository'
import { setExpectedQuantity } from '../../db/repositories/expectedQuantityRepository'

async function readFileText(file: File): Promise<string> {
  return file.text()
}

export default function ImportPage() {
  const [status, setStatus] = useState('')

  const importZones = async (file: File) => {
    const rows = parseZonesCsv(await readFileText(file))
    const existing = await listZones()
    const existingNames = new Set(existing.map((z) => z.name))
    let created = 0
    for (const row of rows) {
      if (existingNames.has(row.name)) continue
      await createZone({ name: row.name, sapStorageLocation: row.sapStorageLocation })
      existingNames.add(row.name)
      created++
    }
    setStatus(`Imported ${created} zone(s).`)
  }

  const importMaterials = async (file: File) => {
    const rows = parseMaterialsCsv(await readFileText(file))
    const units = await listUnits()
    const unitByCode = new Map(units.map((u) => [u.code, u.id]))
    let created = 0
    const skipped: string[] = []
    for (const row of rows) {
      const unitId = unitByCode.get(row.unitCode)
      if (!unitId) {
        skipped.push(`${row.name} (unknown unit ${row.unitCode})`)
        continue
      }
      await createMaterial({ name: row.name, unitId, sapMaterialNumber: row.sapMaterialNumber })
      created++
    }
    setStatus(`Imported ${created} material(s).${skipped.length ? ` Skipped: ${skipped.join(', ')}` : ''}`)
  }

  const importExpectedQuantities = async (file: File) => {
    const rows = parseExpectedQuantitiesCsv(await readFileText(file))
    const zones = await listZones()
    const materials = await listMaterials()
    const zoneByName = new Map(zones.map((z) => [z.name, z.id]))
    const materialByName = new Map(materials.map((m) => [m.name, m.id]))
    let created = 0
    const skipped: string[] = []
    for (const row of rows) {
      const zoneId = zoneByName.get(row.zoneName)
      const materialId = materialByName.get(row.materialName)
      if (!zoneId || !materialId) {
        skipped.push(`${row.zoneName} / ${row.materialName} (unknown zone or material)`)
        continue
      }
      await setExpectedQuantity(zoneId, materialId, row.expectedQuantity)
      created++
    }
    setStatus(`Imported ${created} expected quantit${created === 1 ? 'y' : 'ies'}.${skipped.length ? ` Skipped: ${skipped.join(', ')}` : ''}`)
  }

  return (
    <div className="screen">
      <h1>Import from CSV</h1>
      <div className="form-row">
        <label htmlFor="import-zones">Zones CSV (name,sapStorageLocation)</label>
        <input
          id="import-zones"
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) importZones(file)
          }}
        />
      </div>
      <div className="form-row">
        <label htmlFor="import-materials">Materials CSV (name,unitCode,sapMaterialNumber)</label>
        <input
          id="import-materials"
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) importMaterials(file)
          }}
        />
      </div>
      <div className="form-row">
        <label htmlFor="import-expected-quantities">Expected quantities CSV (zoneName,materialName,expectedQuantity)</label>
        <input
          id="import-expected-quantities"
          aria-label="Expected quantities CSV"
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) importExpectedQuantities(file)
          }}
        />
      </div>
      {status && <p>{status}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/masterData/ImportPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: both PASS, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/masterData/ImportPage.tsx src/pages/masterData/ImportPage.test.tsx
git commit -m "feat: import expected quantities from CSV, matched by zone and material name"
```

---

### Task 12: BarcodeScanner Camera Leak Fix and Stable Callbacks

**Files:**
- Modify: `src/components/BarcodeScanner.tsx`
- Modify: `src/pages/inventory/ZonePickerPage.tsx`
- Modify: `src/pages/inventory/MaterialPickerPage.tsx`

**Interfaces:**
- No prop-interface changes anywhere in this task.

- [ ] **Step 1: Modify `src/components/BarcodeScanner.tsx`** — replace the whole file:

```tsx
import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

interface BarcodeScannerProps {
  onDetected: (value: string) => void
}

export default function BarcodeScanner({ onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    if (!scanning || !videoRef.current) return
    const reader = new BrowserMultiFormatReader()
    let cancelled = false

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result) {
          onDetected(result.getText())
          setScanning(false)
        }
      })
      .then((controls) => {
        if (cancelled) {
          controls.stop()
        }
      })
      .catch(() => setScanning(false))

    return () => {
      cancelled = true
    }
  }, [scanning, onDetected])

  return (
    <div className="form-row">
      {!scanning && (
        <button type="button" className="secondary" onClick={() => setScanning(true)}>
          Scan barcode / QR
        </button>
      )}
      {scanning && (
        <>
          <video ref={videoRef} style={{ width: '100%' }} />
          <button type="button" className="secondary" onClick={() => setScanning(false)}>
            Cancel scan
          </button>
        </>
      )}
    </div>
  )
}
```

Note: this replaces the previous `stop` closure variable (assigned inside `.then()`, called unconditionally in cleanup — a no-op if `.then()` hasn't resolved yet) with a `cancelled` flag checked *inside* `.then()`. If the effect tears down before `decodeFromVideoDevice` resolves, the `.then()` callback still runs later and now correctly calls `controls.stop()` because it sees `cancelled === true`.

- [ ] **Step 2: Modify `src/pages/inventory/ZonePickerPage.tsx`** — replace the whole file:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { listZones, findZoneByBarcode } from '../../db/repositories/zoneRepository'
import type { Zone } from '../../db/types'
import BarcodeScanner from '../../components/BarcodeScanner'

interface ZonePickerPageProps {
  onZoneChosen: (zoneId: string) => void
}

export default function ZonePickerPage({ onZoneChosen }: ZonePickerPageProps) {
  const [zones, setZones] = useState<Zone[]>([])

  useEffect(() => {
    listZones().then(setZones)
  }, [])

  const handleDetected = useCallback(
    async (value: string) => {
      const zone = await findZoneByBarcode(value)
      if (zone) onZoneChosen(zone.id)
    },
    [onZoneChosen],
  )

  return (
    <div className="screen">
      <h1>Pick a Zone</h1>
      <BarcodeScanner onDetected={handleDetected} />
      <ul>
        {zones.map((z) => (
          <li key={z.id}>
            <button className="secondary" style={{ width: '100%' }} onClick={() => onZoneChosen(z.id)}>
              {z.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Modify `src/pages/inventory/MaterialPickerPage.tsx`** — replace the whole file:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { listMaterials, findMaterialByBarcode } from '../../db/repositories/materialRepository'
import type { Material } from '../../db/types'
import BarcodeScanner from '../../components/BarcodeScanner'

interface MaterialPickerPageProps {
  onMaterialChosen: (materialId: string) => void
}

export default function MaterialPickerPage({ onMaterialChosen }: MaterialPickerPageProps) {
  const [materials, setMaterials] = useState<Material[]>([])

  useEffect(() => {
    listMaterials().then(setMaterials)
  }, [])

  const handleDetected = useCallback(
    async (value: string) => {
      const material = await findMaterialByBarcode(value)
      if (material) onMaterialChosen(material.id)
    },
    [onMaterialChosen],
  )

  return (
    <div className="screen">
      <h1>Pick a Material</h1>
      <BarcodeScanner onDetected={handleDetected} />
      <ul>
        {materials.map((m) => (
          <li key={m.id}>
            <button className="secondary" style={{ width: '100%' }} onClick={() => onMaterialChosen(m.id)}>
              {m.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run the full suite and build** (no automated test covers camera behavior per Phase 1's established pattern — this is a manual-verification-only fix, same as the rest of `BarcodeScanner`)

Run: `npx vitest run && npm run build`
Expected: both PASS, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/BarcodeScanner.tsx src/pages/inventory/ZonePickerPage.tsx src/pages/inventory/MaterialPickerPage.tsx
git commit -m "fix: prevent camera-stream leak on fast unmount, stabilize onDetected callbacks"
```

---

### Task 13: CSV Export — Real Per-Line Status and Multi-Pass Test

**Files:**
- Modify: `src/pages/ExportPage.tsx`
- Modify: `src/pages/ExportPage.test.tsx`

**Interfaces:**
- Consumes: `comparePasses` (from `../domain/reconciliation`) — newly imported into `ExportPage.tsx`.
- No change to `buildDetailCsv`/`buildSummaryCsv`'s signatures (both already accept a `status: string` field per row; this task changes what value `ExportPage` computes for it, not the CSV builder itself).

- [ ] **Step 1: Write the failing test** — add to `src/pages/ExportPage.test.tsx` (keep the existing test):

```tsx
it('computes matched/mismatched/manually_resolved status per line across a full multi-pass inventory', async () => {
  const user = await createUser('Alex')
  const zone = await createZone({ name: 'Warehouse A' })
  const unit = await createUnit('KG', 'Kilogram')
  const materialA = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
  const materialB = await createMaterial({ name: 'Pulp', unitId: unit.id })

  const { inventory, pass } = await startInventory('Multi-pass Inv', user.id)
  const zc1 = await getOrOpenZoneCount(pass.id, zone.id, user.id)
  await setCountLine(zc1.id, materialA.id, 10, user.id)
  await setCountLine(zc1.id, materialB.id, 10, user.id)
  await closeZoneCount(zc1.id, user.id)
  await closePass(pass.id, user.id)

  const pass2 = await startNextPass(inventory.id, 2)
  const zc2 = await getOrOpenZoneCount(pass2.id, zone.id, user.id)
  await setCountLine(zc2.id, materialA.id, 10, user.id) // matches pass 1
  await setCountLine(zc2.id, materialB.id, 12, user.id) // mismatches pass 1
  await closeZoneCount(zc2.id, user.id)
  await closePass(pass2.id, user.id)

  const pass3 = await startNextPass(inventory.id, 3)
  const zc3 = await getOrOpenZoneCount(pass3.id, zone.id, user.id)
  await setCountLine(zc3.id, materialB.id, 12, user.id) // pass3 matches pass2
  await closeZoneCount(zc3.id, user.id)
  await closePass(pass3.id, user.id)
  await db.inventories.put({ ...(await db.inventories.get(inventory.id))!, status: 'successful' })

  render(<ExportPage inventoryId={inventory.id} />)
  const detailLink = await screen.findByRole('link', { name: /download detail csv/i })
  const detailUrl = detailLink.getAttribute('href')!
  const detailCsv = await (await fetch(detailUrl)).text()

  expect(detailCsv).toContain('matched')
  expect(detailCsv).toContain('mismatched')
  expect(detailCsv).toContain('manually_resolved')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/ExportPage.test.tsx`
Expected: FAIL — `status` is always `'recorded'` in the current implementation.

- [ ] **Step 3: Modify `src/pages/ExportPage.tsx`** — replace the whole file:

```tsx
import { useEffect, useState } from 'react'
import { db } from '../db/schema'
import { buildDetailCsv, buildSummaryCsv, type DetailRow, type SummaryRow } from '../domain/csv'
import { comparePasses } from '../domain/reconciliation'
import type { CountLineSnapshot } from '../domain/reconciliation'

interface ExportPageProps {
  inventoryId: string
}

export default function ExportPage({ inventoryId }: ExportPageProps) {
  const [detailUrl, setDetailUrl] = useState<string | null>(null)
  const [summaryUrl, setSummaryUrl] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const inventory = await db.inventories.get(inventoryId)
      if (!inventory) return
      const passes = (await db.passes.where('inventoryId').equals(inventoryId).toArray())
        .sort((a, b) => a.passNumber - b.passNumber)

      // Precompute a status per zone+material key using the same reconciliation
      // logic the app uses to drive the wizard, so the export reflects reality
      // rather than a hardcoded placeholder.
      const statusByKey = new Map<string, 'matched' | 'mismatched' | 'manually_resolved'>()
      const pass1 = passes.find((p) => p.passNumber === 1)
      const pass2 = passes.find((p) => p.passNumber === 2)
      const pass3 = passes.find((p) => p.passNumber === 3)
      if (pass1 && pass2) {
        const getSnapshot = async (passId: string): Promise<CountLineSnapshot[]> => {
          const zcs = await db.zoneCounts.where('passId').equals(passId).toArray()
          const snapshot: CountLineSnapshot[] = []
          for (const zc of zcs) {
            const lines = await db.countLines.where('zoneCountId').equals(zc.id).toArray()
            for (const line of lines) snapshot.push({ zoneId: zc.zoneId, materialId: line.materialId, quantity: line.quantity })
          }
          return snapshot
        }
        const pass1Lines = await getSnapshot(pass1.id)
        const pass2Lines = await getSnapshot(pass2.id)
        const { matched, mismatched } = comparePasses(pass1Lines, pass2Lines)
        for (const m of matched) statusByKey.set(`${m.zoneId}::${m.materialId}`, 'matched')
        for (const m of mismatched) statusByKey.set(`${m.zoneId}::${m.materialId}`, 'mismatched')
        if (pass3) {
          const pass3Lines = await getSnapshot(pass3.id)
          for (const line of pass3Lines) statusByKey.set(`${line.zoneId}::${line.materialId}`, 'manually_resolved')
        }
      }

      const detailRows: DetailRow[] = []
      const officialByZoneMaterial = new Map<string, SummaryRow>()

      for (const pass of passes) {
        const zoneCounts = await db.zoneCounts.where('passId').equals(pass.id).toArray()
        for (const zc of zoneCounts) {
          const zone = await db.zones.get(zc.zoneId)
          const lines = await db.countLines.where('zoneCountId').equals(zc.id).toArray()
          for (const line of lines) {
            const material = await db.materials.get(line.materialId)
            const unit = material ? await db.units.get(material.unitId) : undefined
            const updatedBy = await db.users.get(line.updatedByUserId)
            const variance = line.expectedQuantity !== undefined ? line.quantity - line.expectedQuantity : undefined
            const key = `${zc.zoneId}::${line.materialId}`

            detailRows.push({
              inventoryName: inventory.name,
              passNumber: pass.passNumber,
              zoneName: zone?.name ?? zc.zoneId,
              sapStorageLocation: zone?.sapStorageLocation,
              materialName: material?.name ?? line.materialId,
              sapMaterialNumber: material?.sapMaterialNumber,
              unitCode: unit?.code ?? '',
              expectedQuantity: line.expectedQuantity,
              countedQuantity: line.quantity,
              variance,
              status: statusByKey.get(key) ?? 'matched',
              countedByUser: updatedBy?.name ?? line.updatedByUserId,
              timestamp: new Date(line.updatedAt).toISOString(),
            })

            officialByZoneMaterial.set(key, {
              zoneName: zone?.name ?? zc.zoneId,
              materialName: material?.name ?? line.materialId,
              officialQuantity: line.quantity,
              expectedQuantity: line.expectedQuantity,
              variance,
            })
          }
        }
      }

      const detailCsv = buildDetailCsv(detailRows)
      const summaryCsv = buildSummaryCsv([...officialByZoneMaterial.values()])

      setDetailUrl(URL.createObjectURL(new Blob([detailCsv], { type: 'text/csv' })))
      setSummaryUrl(URL.createObjectURL(new Blob([summaryCsv], { type: 'text/csv' })))
    })()
  }, [inventoryId])

  return (
    <div className="screen">
      <h1>Export</h1>
      {detailUrl && <a href={detailUrl} download="inventory-detail.csv">Download detail CSV</a>}
      <br />
      {summaryUrl && <a href={summaryUrl} download="inventory-summary.csv">Download summary CSV</a>}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/ExportPage.test.tsx`
Expected: PASS (both the original single-pass test and the new multi-pass test — the original test has no pass 2, so `pass1 && pass2` is false and every line falls back to `statusByKey.get(key) ?? 'matched'`, preserving that test's existing behavior).

- [ ] **Step 5: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: both PASS, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ExportPage.tsx src/pages/ExportPage.test.tsx
git commit -m "feat: compute real per-line CSV export status from reconciliation data"
```

---

### Task 14: Repository-to-Domain Integration Test

**Files:**
- Modify: `src/db/repositories/inventoryRepository.test.ts`

**Interfaces:**
- Consumes only already-existing functions — this task adds test coverage, no production code.

- [ ] **Step 1: Add the integration test** — append to `src/db/repositories/inventoryRepository.test.ts`:

```ts
describe('full pass1 -> pass2 -> mismatch -> pass3 -> resolve lifecycle', () => {
  async function countAndClose(passId: string, zoneId: string, materialId: string, qty: number) {
    const zc = await getOrOpenZoneCount(passId, zoneId, 'user-1')
    await setCountLine(zc.id, materialId, qty, 'user-1')
    await closeZoneCount(zc.id, 'user-1')
  }

  it('drives a real inventory through matched and mismatched lines to a correct final state', async () => {
    const { inventory, pass } = await startInventory('Lifecycle Inv', 'user-1')

    // zone-1/material-1 will match across pass 1 and 2 (no third-pass involvement).
    // zone-2/material-2 will mismatch and resolve via 2-of-3 (pass3 matches pass2).
    // zone-3/material-3 will mismatch and require manual resolution (all three differ).
    await countAndClose(pass.id, 'zone-1', 'material-1', 10)
    await countAndClose(pass.id, 'zone-2', 'material-2', 20)
    await countAndClose(pass.id, 'zone-3', 'material-3', 30)
    await closePass(pass.id, 'user-1')

    const pass2 = await startNextPass(inventory.id, 2)
    await countAndClose(pass2.id, 'zone-1', 'material-1', 10)
    await countAndClose(pass2.id, 'zone-2', 'material-2', 22)
    await countAndClose(pass2.id, 'zone-3', 'material-3', 33)
    await closePass(pass2.id, 'user-1')

    const pass1Lines = await getPassLines(pass.id)
    const pass2Lines = await getPassLines(pass2.id)
    const { matched, mismatched } = comparePasses(pass1Lines, pass2Lines)
    expect(matched).toHaveLength(1)
    expect(mismatched).toHaveLength(2)

    const pass3 = await startNextPass(inventory.id, 3)
    // Recount only the mismatched pairs, per the app's scoped third-pass rule.
    await countAndClose(pass3.id, 'zone-2', 'material-2', 22) // matches pass 2
    await countAndClose(pass3.id, 'zone-3', 'material-3', 36) // matches neither -> manual

    const pass3Lines = await getPassLines(pass3.id)
    const resolutions = resolveThirdPass(pass1Lines, pass2Lines, pass3Lines)
    expect(resolutions).toHaveLength(2)
    expect(resolutions.find((r) => r.zoneId === 'zone-2')?.resolution).toBe('pass3_matches_pass2')
    expect(resolutions.find((r) => r.zoneId === 'zone-3')?.resolution).toBe('needs_manual_resolution')

    // The manual line gets a supervisor-entered final value before closing.
    const zc3 = await getOrOpenZoneCount(pass3.id, 'zone-3', 'user-1')
    await reopenTarget('zoneCount', zc3.id, 'user-1', 'supervisor agreed final count')
    await setCountLine(zc3.id, 'material-3', 35, 'user-1')
    await closeZoneCount(zc3.id, 'user-1')

    await closeInventoryAfterReconciliation(inventory.id, pass.id, pass2.id, pass3.id, 'user-1')

    const finalInventory = await db.inventories.get(inventory.id)
    expect(finalInventory?.status).toBe('successful')

    const finalZone3Line = await db.countLines.where({ zoneCountId: zc3.id, materialId: 'material-3' }).first()
    expect(finalZone3Line?.quantity).toBe(35)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/db/repositories/inventoryRepository.test.ts`
Expected: PASS

- [ ] **Step 3: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: both PASS, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/db/repositories/inventoryRepository.test.ts
git commit -m "test: add full pass1->pass2->mismatch->pass3->resolve integration test"
```

---

### Task 15: README

**Files:**
- Create: `README.md` (repo root)

- [ ] **Step 1: Create `README.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with run/test/build/deploy instructions and data model overview"
```

---

## Self-Review Notes

- **Spec coverage:** Wizard + session (Task 5), inventories list + resume (Task 9), third-pass completeness (Task 4, wired in Task 6), backup UI + fidelity fixes (Task 10), shared error handling (Task 1, applied in Tasks 5–7, 10), expected-quantity import (Tasks 3, 11, consumed in Task 5's wizard), `needs_3rd_pass` persistence (Task 7), name lookups (Tasks 6–8), camera leak (Task 12), reopen safety via parent-pass guard (Task 4), CSV export accuracy (Task 13), integration test (Task 14), README (Task 15) — every section of the Phase 2 design spec maps to a task above.
- **Type consistency verified:** `closeInventoryAfterReconciliation`'s signature (Task 4) matches its call site in `ManualResolutionPage.tsx` (Task 6) exactly. `useAsyncAction`'s return tuple shape (Task 1) is used identically across every consumer (Tasks 5–7, 10). `CountingSessionValue`'s shape (Task 2) is used identically in `CountingWizard.tsx`, `StartInventoryPage.tsx`, `InventoriesListPage.tsx`, and `App.tsx` (Task 5, 9). `getExpectedQuantity`/`setExpectedQuantity`/`listExpectedPairs` (Task 3) signatures match their call sites in `CountingWizard.tsx` (Task 5) and `ImportPage.tsx` (Task 11).
- **No placeholders remain** — every step contains runnable code; the one explicit deferral (Task 5's note about `CountingWizard` needing a "Finish this pass" affordance rather than modifying `ZonePickerPage`'s tested interface) is a documented design choice with a concrete code diff, not a vague TODO.
- **Parallelization note for execution:** Tasks 1, 2, 3, 12, 13, 14, 15 touch entirely disjoint files and have no interface dependency on each other — safe to dispatch to separate agents in parallel. Task 4 depends on nothing but existing Phase 1 code. Task 5 depends on Tasks 1, 2, 3. Tasks 6, 7, 8 depend on Tasks 1 and (for Task 6) Task 4, but not on each other or on Task 5's `CountingWizard.tsx` file directly (they modify the page components Task 5 *imports*, not `CountingWizard.tsx` itself) — some risk of merge friction if Task 5 and Tasks 6–8 run fully concurrently against the same page files' surrounding code, so run Task 5 before Tasks 6–8 if parallelizing, or accept a rebase step. Task 9 depends on Task 2. Task 10 depends on Task 3 (for the `expectedQuantities` table to include in `DATA_TABLES`) and Task 1. Task 11 depends on Task 3.
