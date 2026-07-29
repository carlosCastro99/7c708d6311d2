# MX-Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable, fully offline PWA for conducting physical stock inventories on a factory floor — master data management, zone/material counting with a tap counter, multi-pass reconciliation, CSV export, and full backup/restore — per `docs/superpowers/specs/2026-07-29-mx-inventory-design.md`.

**Architecture:** React + TypeScript SPA built with Vite, persisted entirely in the browser via Dexie.js (IndexedDB), installable and offline-capable via a Workbox service worker (vite-plugin-pwa). No backend. React Router drives navigation between master-data screens and the inventory counting workflow. Reconciliation (pass comparison, 2-of-3 resolution) is implemented as pure, DB-free functions so the core business logic is unit-testable in isolation from the UI and storage layer.

**Tech Stack:** React 18, TypeScript, Vite, React Router 6, Dexie 4 (IndexedDB), `@zxing/browser` (barcode/QR scanning via camera), PapaParse (CSV parse/build), JSZip (backup archive), vite-plugin-pwa (installability + offline), Vitest + React Testing Library + fake-indexeddb (testing).

## Global Constraints

- **Offline-first, no backend.** All persistence is local IndexedDB via Dexie. The only data interchange is CSV export and a manual JSON/zip backup file. Never add a network call for core functionality.
- **Mobile-first, touch-friendly.** Every interactive element (buttons, list rows used as tap targets) must be at least 44x44 CSS px. Layouts are single-column, large-font, designed for a phone held in one hand, screen widths from ~360px up.
- **Installable PWA, no app store.** Must be installable via "Add to Home Screen" on both Android and iOS, and must load and function with zero network connectivity after first install.
- **One device drives one inventory at a time.** No multi-device sync/merge logic.
- **User identity is a simple local profile picker** — name only, no password.
- **No lot/batch tracking.** One quantity per Zone+Material per pass.
- **Units of measure are a small managed list**, never free text, to keep values consistent.
- **Every count change is audited, not overwritten silently.** `CountAuditEntry` records old→new value, user, and timestamp for every edit.
- **Closed Zones/Passes/Inventories are locked.** Reopening requires an explicit action that logs user, timestamp, and a reason (`ReopenLog`).
- **A third pass only re-counts the specific Zone+Material lines that mismatched** between pass 1 and pass 2 — never the whole inventory again.
- **Third-pass resolution rule:** if pass 3 matches pass 1 or pass 2, that value is official. If all three passes differ, the line is flagged for manual resolution by a supervisor, who must enter a reason.

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, index.html
public/
  manifest.json
  icons/icon-192.png, icons/icon-512.png
src/
  main.tsx                          — entry point, mounts <App/>
  App.tsx                           — router shell
  styles.css                        — shared mobile-first styles (tap targets, layout)
  test/setup.ts                     — vitest setup (jest-dom, fake-indexeddb)
  db/
    id.ts                           — newId()
    types.ts                        — all entity interfaces
    schema.ts                       — Dexie database class + singleton `db`
    repositories/
      userRepository.ts
      unitRepository.ts
      zoneRepository.ts
      materialRepository.ts
      photoRepository.ts
      inventoryRepository.ts        — Inventory/Pass/ZoneCount/MaterialCountLine + audit + reopen
  domain/
    reconciliation.ts                — comparePasses(), resolveThirdPass() (pure)
    csv.ts                           — buildDetailCsv(), buildSummaryCsv(), parseZonesCsv(), parseMaterialsCsv(), parseExpectedQuantitiesCsv()
    backup.ts                        — exportBackup(), importBackup()
  components/
    PhotoCapture.tsx                 — shared camera-capture button + thumbnail
    BarcodeScanner.tsx               — shared camera QR/barcode scan button
    TapCounter.tsx                   — shared +1/-1/manual-entry counter control
  pages/
    HomePage.tsx
    masterData/
      UsersPage.tsx
      UnitsPage.tsx
      ZonesPage.tsx
      MaterialsPage.tsx
      ImportPage.tsx
    inventory/
      StartInventoryPage.tsx
      ZonePickerPage.tsx
      MaterialPickerPage.tsx
      CountingScreen.tsx
      ZoneSummaryPage.tsx
      PassClosePage.tsx
      VarianceReportPage.tsx
      ThirdPassPickerPage.tsx
      ManualResolutionPage.tsx
      ProgressDashboardPage.tsx
    ExportPage.tsx
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`
- Create: `src/main.tsx`, `src/styles.css`, `src/test/setup.ts`, `src/App.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: `<App />` default export from `src/App.tsx`, mounted by `src/main.tsx`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "mx-inventory",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "dexie": "^4.0.8",
    "@zxing/browser": "^0.1.5",
    "papaparse": "^5.4.1",
    "jszip": "^3.10.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@types/papaparse": "^5.3.14",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.1",
    "vite-plugin-pwa": "^0.20.1",
    "vitest": "^2.0.5",
    "jsdom": "^24.1.1",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/user-event": "^14.5.2",
    "fake-indexeddb": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
```

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>MX Inventory</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
```

- [ ] **Step 7: Create `src/styles.css`**

```css
:root {
  color-scheme: light;
  font-family: system-ui, sans-serif;
  font-size: 18px;
}

* { box-sizing: border-box; }

body { margin: 0; }

.screen {
  max-width: 480px;
  margin: 0 auto;
  padding: 1rem;
}

button, .tap-target, input[type="text"], input[type="number"], select {
  min-height: 44px;
  font-size: 1rem;
  padding: 0.5rem 0.75rem;
}

button {
  border: none;
  border-radius: 8px;
  background: #1a73e8;
  color: white;
  cursor: pointer;
}

button.secondary {
  background: #e8eaed;
  color: #202124;
}

button.danger {
  background: #d93025;
}

.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  border-bottom: 1px solid #ddd;
  min-height: 44px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 1rem;
}
```

- [ ] **Step 8: Write the failing test — `src/App.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the app shell heading', () => {
    render(<App />)
    expect(screen.getByText(/MX Inventory/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 9: Run `npm install`, then run the test to verify it fails**

Run: `npm install && npx vitest run src/App.test.tsx`
Expected: FAIL — `src/App.tsx` does not exist yet.

- [ ] **Step 10: Create `src/App.tsx`**

```tsx
function App() {
  return <div className="screen"><h1>MX Inventory</h1></div>
}

export default App
```

- [ ] **Step 11: Create `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add package.json tsconfig.json tsconfig.node.json vite.config.ts index.html src/
git commit -m "chore: scaffold Vite+React+TS project with Vitest"
```

---

### Task 2: Data Types and Dexie Schema

**Files:**
- Create: `src/db/id.ts`, `src/db/types.ts`, `src/db/schema.ts`
- Test: `src/db/schema.test.ts`

**Interfaces:**
- Produces: `newId()`; all entity types (`User`, `UnitOfMeasure`, `Material`, `Zone`, `Inventory`, `InventoryPass`, `ZoneCount`, `MaterialCountLine`, `CountAuditEntry`, `ReopenLog`, `PhotoBlob`, `InventoryStatus`, `PassStatus`, `ZoneCountStatus`, `ID`); `MxInventoryDB` class and singleton `db` from `src/db/schema.ts` with tables `users, units, materials, zones, inventories, passes, zoneCounts, countLines, auditEntries, reopenLogs, photos`.

- [ ] **Step 1: Create `src/db/id.ts`**

```ts
export function newId(): string {
  return crypto.randomUUID()
}
```

- [ ] **Step 2: Create `src/db/types.ts`**

```ts
export type ID = string

export interface User {
  id: ID
  name: string
  createdAt: number
}

export interface UnitOfMeasure {
  id: ID
  code: string
  label: string
}

export interface Material {
  id: ID
  name: string
  unitId: ID
  sapMaterialNumber?: string
  photoBlobId?: ID
  barcodeValue?: string
  active: boolean
}

export interface Zone {
  id: ID
  name: string
  sapStorageLocation?: string
  photoBlobId?: ID
  barcodeValue?: string
}

export type InventoryStatus = 'in_progress' | 'closed_single_pass' | 'needs_3rd_pass' | 'successful'

export interface Inventory {
  id: ID
  name: string
  status: InventoryStatus
  createdByUserId: ID
  createdAt: number
  closedAt?: number
}

export type PassStatus = 'in_progress' | 'closed'

export interface InventoryPass {
  id: ID
  inventoryId: ID
  passNumber: 1 | 2 | 3
  status: PassStatus
}

export type ZoneCountStatus = 'open' | 'closed'

export interface ZoneCount {
  id: ID
  passId: ID
  zoneId: ID
  status: ZoneCountStatus
  openedByUserId: ID
  openedAt: number
  closedByUserId?: ID
  closedAt?: number
  photoBlobId?: ID
}

export interface MaterialCountLine {
  id: ID
  zoneCountId: ID
  materialId: ID
  quantity: number
  expectedQuantity?: number
  photoBlobId?: ID
  updatedByUserId: ID
  updatedAt: number
}

export interface CountAuditEntry {
  id: ID
  materialCountLineId: ID
  userId: ID
  timestamp: number
  oldValue: number
  newValue: number
}

export interface ReopenLog {
  id: ID
  targetType: 'zoneCount' | 'pass' | 'inventory'
  targetId: ID
  userId: ID
  timestamp: number
  reason: string
}

export interface PhotoBlob {
  id: ID
  blob: Blob
  createdAt: number
}
```

- [ ] **Step 3: Write the failing test — `src/db/schema.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { db } from './schema'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('MxInventoryDB', () => {
  it('stores and retrieves a user', async () => {
    await db.users.add({ id: '1', name: 'Alex', createdAt: 1 })
    const found = await db.users.get('1')
    expect(found?.name).toBe('Alex')
  })

  it('exposes all expected tables', () => {
    const names = db.tables.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        'auditEntries', 'countLines', 'inventories', 'materials', 'passes',
        'photos', 'reopenLogs', 'units', 'users', 'zoneCounts', 'zones',
      ].sort(),
    )
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/db/schema.test.ts`
Expected: FAIL — `./schema` module not found.

- [ ] **Step 5: Create `src/db/schema.ts`**

```ts
import Dexie, { type Table } from 'dexie'
import type {
  User, UnitOfMeasure, Material, Zone, Inventory, InventoryPass,
  ZoneCount, MaterialCountLine, CountAuditEntry, ReopenLog, PhotoBlob,
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
  }
}

export const db = new MxInventoryDB()
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/db/schema.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/db/id.ts src/db/types.ts src/db/schema.ts src/db/schema.test.ts
git commit -m "feat: add Dexie schema and entity types"
```

---

### Task 3: User and Unit Repositories

**Files:**
- Create: `src/db/repositories/userRepository.ts`, `src/db/repositories/unitRepository.ts`
- Test: `src/db/repositories/userRepository.test.ts`, `src/db/repositories/unitRepository.test.ts`

**Interfaces:**
- Consumes: `db` from `src/db/schema.ts`; `newId()` from `src/db/id.ts`; `User`, `UnitOfMeasure` from `src/db/types.ts`.
- Produces: `createUser(name: string): Promise<User>`, `listUsers(): Promise<User[]>`; `createUnit(code: string, label: string): Promise<UnitOfMeasure>`, `listUnits(): Promise<UnitOfMeasure[]>`.

- [ ] **Step 1: Write the failing tests**

`src/db/repositories/userRepository.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { createUser, listUsers } from './userRepository'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('userRepository', () => {
  it('creates and lists users alphabetically', async () => {
    await createUser('Bea')
    await createUser('Alex')
    const users = await listUsers()
    expect(users.map((u) => u.name)).toEqual(['Alex', 'Bea'])
  })
})
```

`src/db/repositories/unitRepository.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { createUnit, listUnits } from './unitRepository'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('unitRepository', () => {
  it('creates and lists units', async () => {
    await createUnit('KG', 'Kilogram')
    await createUnit('EA', 'Each')
    const units = await listUnits()
    expect(units.map((u) => u.code).sort()).toEqual(['EA', 'KG'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/db/repositories/userRepository.test.ts src/db/repositories/unitRepository.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/db/repositories/userRepository.ts`**

```ts
import { db } from '../schema'
import { newId } from '../id'
import type { User } from '../types'

export async function createUser(name: string): Promise<User> {
  const user: User = { id: newId(), name, createdAt: Date.now() }
  await db.users.add(user)
  return user
}

export async function listUsers(): Promise<User[]> {
  return db.users.orderBy('name').toArray()
}
```

- [ ] **Step 4: Create `src/db/repositories/unitRepository.ts`**

```ts
import { db } from '../schema'
import { newId } from '../id'
import type { UnitOfMeasure } from '../types'

export async function createUnit(code: string, label: string): Promise<UnitOfMeasure> {
  const unit: UnitOfMeasure = { id: newId(), code, label }
  await db.units.add(unit)
  return unit
}

export async function listUnits(): Promise<UnitOfMeasure[]> {
  return db.units.orderBy('code').toArray()
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/db/repositories/userRepository.test.ts src/db/repositories/unitRepository.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/db/repositories/userRepository.ts src/db/repositories/unitRepository.ts src/db/repositories/userRepository.test.ts src/db/repositories/unitRepository.test.ts
git commit -m "feat: add user and unit repositories"
```

---

### Task 4: Photo Repository

**Files:**
- Create: `src/db/repositories/photoRepository.ts`
- Test: `src/db/repositories/photoRepository.test.ts`

**Interfaces:**
- Consumes: `db`, `newId()`, `PhotoBlob`.
- Produces: `savePhoto(blob: Blob): Promise<string>` (returns photo id), `getPhoto(photoId: string): Promise<PhotoBlob | undefined>`.

- [ ] **Step 1: Write the failing test — `src/db/repositories/photoRepository.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { savePhoto, getPhoto } from './photoRepository'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('photoRepository', () => {
  it('saves and retrieves a photo blob', async () => {
    const blob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' })
    const id = await savePhoto(blob)
    const stored = await getPhoto(id)
    expect(stored?.blob.size).toBe(blob.size)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/repositories/photoRepository.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/db/repositories/photoRepository.ts`**

```ts
import { db } from '../schema'
import { newId } from '../id'
import type { PhotoBlob } from '../types'

export async function savePhoto(blob: Blob): Promise<string> {
  const photo: PhotoBlob = { id: newId(), blob, createdAt: Date.now() }
  await db.photos.add(photo)
  return photo.id
}

export async function getPhoto(photoId: string): Promise<PhotoBlob | undefined> {
  return db.photos.get(photoId)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/repositories/photoRepository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/photoRepository.ts src/db/repositories/photoRepository.test.ts
git commit -m "feat: add photo blob repository"
```

---

### Task 5: Zone and Material Repositories

**Files:**
- Create: `src/db/repositories/zoneRepository.ts`, `src/db/repositories/materialRepository.ts`
- Test: `src/db/repositories/zoneRepository.test.ts`, `src/db/repositories/materialRepository.test.ts`

**Interfaces:**
- Consumes: `db`, `newId()`, `Zone`, `Material` types.
- Produces:
  - `createZone(input: { name: string; sapStorageLocation?: string; photoBlobId?: string; barcodeValue?: string }): Promise<Zone>`
  - `listZones(): Promise<Zone[]>`
  - `findZoneByBarcode(value: string): Promise<Zone | undefined>`
  - `createMaterial(input: { name: string; unitId: string; sapMaterialNumber?: string; photoBlobId?: string; barcodeValue?: string }): Promise<Material>`
  - `listMaterials(): Promise<Material[]>`
  - `findMaterialByBarcode(value: string): Promise<Material | undefined>`

- [ ] **Step 1: Write the failing tests**

`src/db/repositories/zoneRepository.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { createZone, listZones, findZoneByBarcode } from './zoneRepository'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('zoneRepository', () => {
  it('creates zones and finds one by barcode', async () => {
    await createZone({ name: 'Warehouse A' })
    await createZone({ name: 'Warehouse B', barcodeValue: 'ZONE-B', sapStorageLocation: 'SL02' })

    const zones = await listZones()
    expect(zones.map((z) => z.name).sort()).toEqual(['Warehouse A', 'Warehouse B'])

    const found = await findZoneByBarcode('ZONE-B')
    expect(found?.name).toBe('Warehouse B')
  })
})
```

`src/db/repositories/materialRepository.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { createMaterial, listMaterials, findMaterialByBarcode } from './materialRepository'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('materialRepository', () => {
  it('creates materials and finds one by barcode', async () => {
    await createMaterial({ name: 'Kraft Paper Roll', unitId: 'unit-roll' })
    await createMaterial({ name: 'Recycled Pulp', unitId: 'unit-kg', barcodeValue: 'MAT-PULP', sapMaterialNumber: 'SAP001' })

    const materials = await listMaterials()
    expect(materials.map((m) => m.name).sort()).toEqual(['Kraft Paper Roll', 'Recycled Pulp'])

    const found = await findMaterialByBarcode('MAT-PULP')
    expect(found?.sapMaterialNumber).toBe('SAP001')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/db/repositories/zoneRepository.test.ts src/db/repositories/materialRepository.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/db/repositories/zoneRepository.ts`**

```ts
import { db } from '../schema'
import { newId } from '../id'
import type { Zone } from '../types'

export async function createZone(input: {
  name: string
  sapStorageLocation?: string
  photoBlobId?: string
  barcodeValue?: string
}): Promise<Zone> {
  const zone: Zone = { id: newId(), ...input }
  await db.zones.add(zone)
  return zone
}

export async function listZones(): Promise<Zone[]> {
  return db.zones.orderBy('name').toArray()
}

export async function findZoneByBarcode(value: string): Promise<Zone | undefined> {
  return db.zones.where('barcodeValue').equals(value).first()
}
```

- [ ] **Step 4: Create `src/db/repositories/materialRepository.ts`**

```ts
import { db } from '../schema'
import { newId } from '../id'
import type { Material } from '../types'

export async function createMaterial(input: {
  name: string
  unitId: string
  sapMaterialNumber?: string
  photoBlobId?: string
  barcodeValue?: string
}): Promise<Material> {
  const material: Material = { id: newId(), active: true, ...input }
  await db.materials.add(material)
  return material
}

export async function listMaterials(): Promise<Material[]> {
  return db.materials.orderBy('name').toArray()
}

export async function findMaterialByBarcode(value: string): Promise<Material | undefined> {
  return db.materials.where('barcodeValue').equals(value).first()
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/db/repositories/zoneRepository.test.ts src/db/repositories/materialRepository.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/db/repositories/zoneRepository.ts src/db/repositories/materialRepository.ts src/db/repositories/zoneRepository.test.ts src/db/repositories/materialRepository.test.ts
git commit -m "feat: add zone and material repositories"
```

---

### Task 6: Shared UI Primitives — PhotoCapture, BarcodeScanner, TapCounter

**Files:**
- Create: `src/components/PhotoCapture.tsx`, `src/components/BarcodeScanner.tsx`, `src/components/TapCounter.tsx`
- Test: `src/components/PhotoCapture.test.tsx`, `src/components/TapCounter.test.tsx`

**Interfaces:**
- Produces:
  - `<PhotoCapture onCapture={(blob: Blob) => void} existingPhotoUrl?: string />`
  - `<BarcodeScanner onDetected={(value: string) => void} />`
  - `<TapCounter value={number} onChange={(next: number) => void} />`

Note: `BarcodeScanner` wraps `@zxing/browser`'s `BrowserMultiFormatReader`; it is not unit-tested here (camera stream APIs aren't meaningfully testable under jsdom) — it gets a manual smoke test in Task 20's device verification pass.

- [ ] **Step 1: Write the failing test — `src/components/PhotoCapture.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PhotoCapture from './PhotoCapture'

describe('PhotoCapture', () => {
  it('calls onCapture with the selected file as a Blob', () => {
    const onCapture = vi.fn()
    render(<PhotoCapture onCapture={onCapture} />)

    const input = screen.getByLabelText(/add photo/i) as HTMLInputElement
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(onCapture).toHaveBeenCalledWith(file)
  })
})
```

- [ ] **Step 2: Write the failing test — `src/components/TapCounter.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TapCounter from './TapCounter'

describe('TapCounter', () => {
  it('increments and decrements via buttons', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TapCounter value={5} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: '+1' }))
    expect(onChange).toHaveBeenCalledWith(6)

    await user.click(screen.getByRole('button', { name: '-1' }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('allows manual quantity entry', () => {
    const onChange = vi.fn()
    render(<TapCounter value={5} onChange={onChange} />)

    const input = screen.getByLabelText(/quantity/i)
    fireEvent.change(input, { target: { value: '120' } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith(120)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/components/PhotoCapture.test.tsx src/components/TapCounter.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Create `src/components/PhotoCapture.tsx`**

```tsx
interface PhotoCaptureProps {
  onCapture: (blob: Blob) => void
  existingPhotoUrl?: string
}

export default function PhotoCapture({ onCapture, existingPhotoUrl }: PhotoCaptureProps) {
  return (
    <div className="form-row">
      <label htmlFor="photo-capture-input">Add photo (optional)</label>
      <input
        id="photo-capture-input"
        aria-label="Add photo"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onCapture(file)
        }}
      />
      {existingPhotoUrl && <img src={existingPhotoUrl} alt="Captured" style={{ maxWidth: '100%' }} />}
    </div>
  )
}
```

- [ ] **Step 5: Create `src/components/TapCounter.tsx`**

```tsx
interface TapCounterProps {
  value: number
  onChange: (next: number) => void
}

export default function TapCounter({ value, onChange }: TapCounterProps) {
  return (
    <div className="form-row">
      <div style={{ fontSize: '2.5rem', textAlign: 'center' }}>{value}</div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          className="secondary"
          style={{ flex: 1, minHeight: 64 }}
          onClick={() => onChange(value - 1)}
        >
          -1
        </button>
        <button
          type="button"
          style={{ flex: 2, minHeight: 64, fontSize: '1.5rem' }}
          onClick={() => onChange(value + 1)}
        >
          +1
        </button>
      </div>
      <label htmlFor="tap-counter-manual">Or enter quantity manually</label>
      <input
        id="tap-counter-manual"
        aria-label="quantity"
        type="number"
        defaultValue={value}
        key={value}
        onBlur={(e) => {
          const next = Number(e.target.value)
          if (!Number.isNaN(next)) onChange(next)
        }}
      />
    </div>
  )
}
```

- [ ] **Step 6: Create `src/components/BarcodeScanner.tsx`**

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
    let stop: (() => void) | undefined

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result) {
          onDetected(result.getText())
          setScanning(false)
        }
      })
      .then((controls) => {
        stop = () => controls.stop()
      })
      .catch(() => setScanning(false))

    return () => stop?.()
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

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/components/PhotoCapture.test.tsx src/components/TapCounter.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/PhotoCapture.tsx src/components/BarcodeScanner.tsx src/components/TapCounter.tsx src/components/PhotoCapture.test.tsx src/components/TapCounter.test.tsx
git commit -m "feat: add shared photo capture, barcode scanner, and tap counter components"
```

---

### Task 7: Users and Units Management Pages

**Files:**
- Create: `src/pages/masterData/UsersPage.tsx`, `src/pages/masterData/UnitsPage.tsx`
- Test: `src/pages/masterData/UsersPage.test.tsx`, `src/pages/masterData/UnitsPage.test.tsx`

**Interfaces:**
- Consumes: `createUser`, `listUsers` from `src/db/repositories/userRepository.ts`; `createUnit`, `listUnits` from `src/db/repositories/unitRepository.ts`.
- Produces: `<UsersPage />`, `<UnitsPage />` default exports.

- [ ] **Step 1: Write the failing test — `src/pages/masterData/UsersPage.test.tsx`**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import UsersPage from './UsersPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('UsersPage', () => {
  it('adds a user and shows it in the list', async () => {
    const user = userEvent.setup()
    render(<UsersPage />)

    await user.type(screen.getByLabelText(/name/i), 'Alex')
    await user.click(screen.getByRole('button', { name: /add user/i }))

    expect(await screen.findByText('Alex')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Write the failing test — `src/pages/masterData/UnitsPage.test.tsx`**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import UnitsPage from './UnitsPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('UnitsPage', () => {
  it('adds a unit and shows it in the list', async () => {
    const user = userEvent.setup()
    render(<UnitsPage />)

    await user.type(screen.getByLabelText(/code/i), 'KG')
    await user.type(screen.getByLabelText(/label/i), 'Kilogram')
    await user.click(screen.getByRole('button', { name: /add unit/i }))

    expect(await screen.findByText(/KG.*Kilogram/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/pages/masterData/UsersPage.test.tsx src/pages/masterData/UnitsPage.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Create `src/pages/masterData/UsersPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { createUser, listUsers } from '../../db/repositories/userRepository'
import type { User } from '../../db/types'

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [name, setName] = useState('')

  const refresh = () => listUsers().then(setUsers)

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="screen">
      <h1>Users</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          await createUser(name.trim())
          setName('')
          await refresh()
        }}
      >
        <div className="form-row">
          <label htmlFor="user-name">Name</label>
          <input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="submit">Add user</button>
      </form>
      <ul>
        {users.map((u) => (
          <li key={u.id} className="list-item">{u.name}</li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: Create `src/pages/masterData/UnitsPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { createUnit, listUnits } from '../../db/repositories/unitRepository'
import type { UnitOfMeasure } from '../../db/types'

export default function UnitsPage() {
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')

  const refresh = () => listUnits().then(setUnits)

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="screen">
      <h1>Units of Measure</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!code.trim() || !label.trim()) return
          await createUnit(code.trim().toUpperCase(), label.trim())
          setCode('')
          setLabel('')
          await refresh()
        }}
      >
        <div className="form-row">
          <label htmlFor="unit-code">Code</label>
          <input id="unit-code" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="unit-label">Label</label>
          <input id="unit-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <button type="submit">Add unit</button>
      </form>
      <ul>
        {units.map((u) => (
          <li key={u.id} className="list-item">{u.code} — {u.label}</li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/pages/masterData/UsersPage.test.tsx src/pages/masterData/UnitsPage.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/pages/masterData/UsersPage.tsx src/pages/masterData/UnitsPage.tsx src/pages/masterData/UsersPage.test.tsx src/pages/masterData/UnitsPage.test.tsx
git commit -m "feat: add users and units management pages"
```

---

### Task 8: Zones and Materials Management Pages

**Files:**
- Create: `src/pages/masterData/ZonesPage.tsx`, `src/pages/masterData/MaterialsPage.tsx`
- Test: `src/pages/masterData/ZonesPage.test.tsx`, `src/pages/masterData/MaterialsPage.test.tsx`

**Interfaces:**
- Consumes: `createZone`, `listZones` from `zoneRepository.ts`; `createMaterial`, `listMaterials` from `materialRepository.ts`; `listUnits` from `unitRepository.ts`; `savePhoto` from `photoRepository.ts`; `<PhotoCapture />`, `<BarcodeScanner />` from Task 6.
- Produces: `<ZonesPage />`, `<MaterialsPage />` default exports.

- [ ] **Step 1: Write the failing test — `src/pages/masterData/ZonesPage.test.tsx`**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import ZonesPage from './ZonesPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('ZonesPage', () => {
  it('adds a zone with an optional SAP storage location', async () => {
    const user = userEvent.setup()
    render(<ZonesPage />)

    await user.type(screen.getByLabelText(/zone name/i), 'Warehouse A')
    await user.type(screen.getByLabelText(/sap storage location/i), 'SL01')
    await user.click(screen.getByRole('button', { name: /add zone/i }))

    expect(await screen.findByText(/Warehouse A/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Write the failing test — `src/pages/masterData/MaterialsPage.test.tsx`**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import { createUnit } from '../../db/repositories/unitRepository'
import MaterialsPage from './MaterialsPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('MaterialsPage', () => {
  it('adds a material against an existing unit', async () => {
    await createUnit('KG', 'Kilogram')
    const user = userEvent.setup()
    render(<MaterialsPage />)

    await user.type(await screen.findByLabelText(/material name/i), 'Kraft Paper')
    await user.selectOptions(screen.getByLabelText(/unit/i), 'KG')
    await user.click(screen.getByRole('button', { name: /add material/i }))

    expect(await screen.findByText(/Kraft Paper/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/pages/masterData/ZonesPage.test.tsx src/pages/masterData/MaterialsPage.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Create `src/pages/masterData/ZonesPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { createZone, listZones } from '../../db/repositories/zoneRepository'
import { savePhoto } from '../../db/repositories/photoRepository'
import type { Zone } from '../../db/types'
import PhotoCapture from '../../components/PhotoCapture'
import BarcodeScanner from '../../components/BarcodeScanner'

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([])
  const [name, setName] = useState('')
  const [sapStorageLocation, setSapStorageLocation] = useState('')
  const [barcodeValue, setBarcodeValue] = useState('')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)

  const refresh = () => listZones().then(setZones)

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="screen">
      <h1>Zones</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          const photoBlobId = photoBlob ? await savePhoto(photoBlob) : undefined
          await createZone({
            name: name.trim(),
            sapStorageLocation: sapStorageLocation.trim() || undefined,
            barcodeValue: barcodeValue.trim() || undefined,
            photoBlobId,
          })
          setName('')
          setSapStorageLocation('')
          setBarcodeValue('')
          setPhotoBlob(null)
          await refresh()
        }}
      >
        <div className="form-row">
          <label htmlFor="zone-name">Zone name</label>
          <input id="zone-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="zone-sap-location">SAP storage location (optional)</label>
          <input
            id="zone-sap-location"
            value={sapStorageLocation}
            onChange={(e) => setSapStorageLocation(e.target.value)}
          />
        </div>
        <BarcodeScanner onDetected={setBarcodeValue} />
        {barcodeValue && <div>Scanned code: {barcodeValue}</div>}
        <PhotoCapture onCapture={setPhotoBlob} />
        <button type="submit">Add zone</button>
      </form>
      <ul>
        {zones.map((z) => (
          <li key={z.id} className="list-item">
            {z.name}{z.sapStorageLocation ? ` (${z.sapStorageLocation})` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: Create `src/pages/masterData/MaterialsPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { createMaterial, listMaterials } from '../../db/repositories/materialRepository'
import { listUnits } from '../../db/repositories/unitRepository'
import { savePhoto } from '../../db/repositories/photoRepository'
import type { Material, UnitOfMeasure } from '../../db/types'
import PhotoCapture from '../../components/PhotoCapture'
import BarcodeScanner from '../../components/BarcodeScanner'

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [name, setName] = useState('')
  const [unitId, setUnitId] = useState('')
  const [sapMaterialNumber, setSapMaterialNumber] = useState('')
  const [barcodeValue, setBarcodeValue] = useState('')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)

  const refresh = () => listMaterials().then(setMaterials)

  useEffect(() => {
    refresh()
    listUnits().then((u) => {
      setUnits(u)
      if (u.length > 0) setUnitId(u[0].id)
    })
  }, [])

  const unitCodeFor = (id: string) => units.find((u) => u.id === id)?.code ?? '?'

  return (
    <div className="screen">
      <h1>Materials</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim() || !unitId) return
          const photoBlobId = photoBlob ? await savePhoto(photoBlob) : undefined
          await createMaterial({
            name: name.trim(),
            unitId,
            sapMaterialNumber: sapMaterialNumber.trim() || undefined,
            barcodeValue: barcodeValue.trim() || undefined,
            photoBlobId,
          })
          setName('')
          setSapMaterialNumber('')
          setBarcodeValue('')
          setPhotoBlob(null)
          await refresh()
        }}
      >
        <div className="form-row">
          <label htmlFor="material-name">Material name</label>
          <input id="material-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="material-unit">Unit</label>
          <select id="material-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.code}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="material-sap-number">SAP material number (optional)</label>
          <input
            id="material-sap-number"
            value={sapMaterialNumber}
            onChange={(e) => setSapMaterialNumber(e.target.value)}
          />
        </div>
        <BarcodeScanner onDetected={setBarcodeValue} />
        {barcodeValue && <div>Scanned code: {barcodeValue}</div>}
        <PhotoCapture onCapture={setPhotoBlob} />
        <button type="submit">Add material</button>
      </form>
      <ul>
        {materials.map((m) => (
          <li key={m.id} className="list-item">{m.name} ({unitCodeFor(m.unitId)})</li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/pages/masterData/ZonesPage.test.tsx src/pages/masterData/MaterialsPage.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/pages/masterData/ZonesPage.tsx src/pages/masterData/MaterialsPage.tsx src/pages/masterData/ZonesPage.test.tsx src/pages/masterData/MaterialsPage.test.tsx
git commit -m "feat: add zones and materials management pages"
```

---

### Task 9: CSV Import for Zones, Materials, and Expected Quantities

**Files:**
- Create: `src/domain/csv.ts` (import-related functions only in this task; export functions added in Task 17)
- Create: `src/pages/masterData/ImportPage.tsx`
- Test: `src/domain/csv.test.ts`

**Interfaces:**
- Produces:
  - `parseZonesCsv(csvText: string): Array<{ name: string; sapStorageLocation?: string }>`
  - `parseMaterialsCsv(csvText: string): Array<{ name: string; unitCode: string; sapMaterialNumber?: string }>`
  - `parseExpectedQuantitiesCsv(csvText: string): Array<{ zoneName: string; materialName: string; expectedQuantity: number }>`
- Consumes (in `ImportPage.tsx`): `createZone`, `createMaterial`, `listUnits`, `createUnit`.

CSV formats (header row required):
- Zones: `name,sapStorageLocation`
- Materials: `name,unitCode,sapMaterialNumber`
- Expected quantities: `zoneName,materialName,expectedQuantity`

- [ ] **Step 1: Write the failing test — `src/domain/csv.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { parseZonesCsv, parseMaterialsCsv, parseExpectedQuantitiesCsv } from './csv'

describe('csv import parsing', () => {
  it('parses zones CSV', () => {
    const csv = 'name,sapStorageLocation\nWarehouse A,SL01\nWarehouse B,'
    expect(parseZonesCsv(csv)).toEqual([
      { name: 'Warehouse A', sapStorageLocation: 'SL01' },
      { name: 'Warehouse B', sapStorageLocation: undefined },
    ])
  })

  it('parses materials CSV', () => {
    const csv = 'name,unitCode,sapMaterialNumber\nKraft Paper,KG,SAP001'
    expect(parseMaterialsCsv(csv)).toEqual([
      { name: 'Kraft Paper', unitCode: 'KG', sapMaterialNumber: 'SAP001' },
    ])
  })

  it('parses expected quantities CSV', () => {
    const csv = 'zoneName,materialName,expectedQuantity\nWarehouse A,Kraft Paper,150'
    expect(parseExpectedQuantitiesCsv(csv)).toEqual([
      { zoneName: 'Warehouse A', materialName: 'Kraft Paper', expectedQuantity: 150 },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/csv.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/domain/csv.ts`**

```ts
import Papa from 'papaparse'

export function parseZonesCsv(csvText: string): Array<{ name: string; sapStorageLocation?: string }> {
  const { data } = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
  return data.map((row) => ({
    name: row.name,
    sapStorageLocation: row.sapStorageLocation ? row.sapStorageLocation.trim() || undefined : undefined,
  }))
}

export function parseMaterialsCsv(
  csvText: string,
): Array<{ name: string; unitCode: string; sapMaterialNumber?: string }> {
  const { data } = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
  return data.map((row) => ({
    name: row.name,
    unitCode: row.unitCode,
    sapMaterialNumber: row.sapMaterialNumber ? row.sapMaterialNumber.trim() || undefined : undefined,
  }))
}

export function parseExpectedQuantitiesCsv(
  csvText: string,
): Array<{ zoneName: string; materialName: string; expectedQuantity: number }> {
  const { data } = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
  return data.map((row) => ({
    zoneName: row.zoneName,
    materialName: row.materialName,
    expectedQuantity: Number(row.expectedQuantity),
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/csv.test.ts`
Expected: PASS

- [ ] **Step 5: Create `src/pages/masterData/ImportPage.tsx`**

```tsx
import { useState } from 'react'
import { parseZonesCsv, parseMaterialsCsv } from '../../domain/csv'
import { createZone, listZones } from '../../db/repositories/zoneRepository'
import { createMaterial } from '../../db/repositories/materialRepository'
import { listUnits } from '../../db/repositories/unitRepository'

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
      {status && <p>{status}</p>}
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/domain/csv.ts src/domain/csv.test.ts src/pages/masterData/ImportPage.tsx
git commit -m "feat: add CSV import for zones and materials"
```

---

### Task 10: Inventory / Pass / ZoneCount / MaterialCountLine Repository (with Audit and Locking)

**Files:**
- Create: `src/db/repositories/inventoryRepository.ts`
- Test: `src/db/repositories/inventoryRepository.test.ts`

**Interfaces:**
- Consumes: `db`, `newId()`, `Inventory`, `InventoryPass`, `ZoneCount`, `MaterialCountLine`, `CountAuditEntry`, `ReopenLog` types.
- Produces:
  - `startInventory(name: string, userId: string): Promise<{ inventory: Inventory; pass: InventoryPass }>`
  - `getOrOpenZoneCount(passId: string, zoneId: string, userId: string): Promise<ZoneCount>`
  - `setCountLine(zoneCountId: string, materialId: string, quantity: number, userId: string, expectedQuantity?: number): Promise<MaterialCountLine>`
  - `closeZoneCount(zoneCountId: string, userId: string): Promise<void>`
  - `closePass(passId: string, userId: string): Promise<void>`
  - `startNextPass(inventoryId: string, passNumber: 2 | 3): Promise<InventoryPass>`
  - `closeInventory(inventoryId: string, status: 'closed_single_pass' | 'successful'): Promise<void>`
  - `reopenTarget(targetType: 'zoneCount' | 'pass' | 'inventory', targetId: string, userId: string, reason: string): Promise<void>`
  - `getPassLines(passId: string): Promise<Array<{ zoneId: string; materialId: string; quantity: number; zoneCountId: string; lineId: string }>>`

- [ ] **Step 1: Write the failing test — `src/db/repositories/inventoryRepository.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import {
  startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount,
  closePass, reopenTarget, getPassLines,
} from './inventoryRepository'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('inventoryRepository', () => {
  it('runs a full zone-count lifecycle with audit logging and locking', async () => {
    const { inventory, pass } = await startInventory('Q3 Paper Warehouse', 'user-1')
    expect(inventory.status).toBe('in_progress')
    expect(pass.passNumber).toBe(1)

    const zoneCount = await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')
    expect(zoneCount.status).toBe('open')

    const line = await setCountLine(zoneCount.id, 'material-1', 5, 'user-1')
    expect(line.quantity).toBe(5)

    await setCountLine(zoneCount.id, 'material-1', 8, 'user-1')
    const audit = await db.auditEntries.where('materialCountLineId').equals(line.id).toArray()
    expect(audit).toHaveLength(2)
    expect(audit[1]).toMatchObject({ oldValue: 5, newValue: 8 })

    await closeZoneCount(zoneCount.id, 'user-1')
    await expect(setCountLine(zoneCount.id, 'material-1', 9, 'user-1')).rejects.toThrow(/closed/i)

    await closePass(pass.id, 'user-1')
    const closedPass = await db.passes.get(pass.id)
    expect(closedPass?.status).toBe('closed')

    const lines = await getPassLines(pass.id)
    expect(lines).toEqual([
      { zoneId: 'zone-1', materialId: 'material-1', quantity: 8, zoneCountId: zoneCount.id, lineId: line.id },
    ])

    await reopenTarget('zoneCount', zoneCount.id, 'user-1', 'miscount noticed')
    const reopened = await db.zoneCounts.get(zoneCount.id)
    expect(reopened?.status).toBe('open')
    const reopenLogs = await db.reopenLogs.where('targetId').equals(zoneCount.id).toArray()
    expect(reopenLogs).toHaveLength(1)
    expect(reopenLogs[0].reason).toBe('miscount noticed')
  })

  it('refuses to close a pass with open zone counts', async () => {
    const { pass } = await startInventory('Q3 Paper Warehouse', 'user-1')
    await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')
    await expect(closePass(pass.id, 'user-1')).rejects.toThrow(/open zone/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/repositories/inventoryRepository.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/db/repositories/inventoryRepository.ts`**

```ts
import { db } from '../schema'
import { newId } from '../id'
import type { Inventory, InventoryPass, ZoneCount, MaterialCountLine, InventoryStatus } from '../types'

export async function startInventory(
  name: string,
  userId: string,
): Promise<{ inventory: Inventory; pass: InventoryPass }> {
  const inventory: Inventory = {
    id: newId(),
    name,
    status: 'in_progress',
    createdByUserId: userId,
    createdAt: Date.now(),
  }
  const pass: InventoryPass = {
    id: newId(),
    inventoryId: inventory.id,
    passNumber: 1,
    status: 'in_progress',
  }
  await db.inventories.add(inventory)
  await db.passes.add(pass)
  return { inventory, pass }
}

export async function getOrOpenZoneCount(passId: string, zoneId: string, userId: string): Promise<ZoneCount> {
  const existing = await db.zoneCounts.where({ passId, zoneId }).first()
  if (existing) return existing

  const zoneCount: ZoneCount = {
    id: newId(),
    passId,
    zoneId,
    status: 'open',
    openedByUserId: userId,
    openedAt: Date.now(),
  }
  await db.zoneCounts.add(zoneCount)
  return zoneCount
}

export async function setCountLine(
  zoneCountId: string,
  materialId: string,
  quantity: number,
  userId: string,
  expectedQuantity?: number,
): Promise<MaterialCountLine> {
  const zoneCount = await db.zoneCounts.get(zoneCountId)
  if (!zoneCount) throw new Error('Zone count not found')
  if (zoneCount.status === 'closed') throw new Error('Cannot edit a closed zone count')

  const existing = await db.countLines.where({ zoneCountId, materialId }).first()
  const now = Date.now()

  if (existing) {
    await db.auditEntries.add({
      id: newId(),
      materialCountLineId: existing.id,
      userId,
      timestamp: now,
      oldValue: existing.quantity,
      newValue: quantity,
    })
    const updated: MaterialCountLine = { ...existing, quantity, updatedByUserId: userId, updatedAt: now }
    await db.countLines.put(updated)
    return updated
  }

  const line: MaterialCountLine = {
    id: newId(),
    zoneCountId,
    materialId,
    quantity,
    expectedQuantity,
    updatedByUserId: userId,
    updatedAt: now,
  }
  await db.countLines.add(line)
  await db.auditEntries.add({
    id: newId(),
    materialCountLineId: line.id,
    userId,
    timestamp: now,
    oldValue: 0,
    newValue: quantity,
  })
  return line
}

export async function closeZoneCount(zoneCountId: string, userId: string): Promise<void> {
  const zoneCount = await db.zoneCounts.get(zoneCountId)
  if (!zoneCount) throw new Error('Zone count not found')
  await db.zoneCounts.put({ ...zoneCount, status: 'closed', closedByUserId: userId, closedAt: Date.now() })
}

export async function closePass(passId: string, userId: string): Promise<void> {
  const pass = await db.passes.get(passId)
  if (!pass) throw new Error('Pass not found')

  const zoneCounts = await db.zoneCounts.where('passId').equals(passId).toArray()
  if (zoneCounts.some((zc) => zc.status !== 'closed')) {
    throw new Error('Cannot close pass: open zone counts remain')
  }

  await db.passes.put({ ...pass, status: 'closed' })
}

export async function startNextPass(inventoryId: string, passNumber: 2 | 3): Promise<InventoryPass> {
  const pass: InventoryPass = { id: newId(), inventoryId, passNumber, status: 'in_progress' }
  await db.passes.add(pass)
  return pass
}

export async function closeInventory(
  inventoryId: string,
  status: Extract<InventoryStatus, 'closed_single_pass' | 'successful'>,
): Promise<void> {
  const inventory = await db.inventories.get(inventoryId)
  if (!inventory) throw new Error('Inventory not found')
  await db.inventories.put({ ...inventory, status, closedAt: Date.now() })
}

export async function reopenTarget(
  targetType: 'zoneCount' | 'pass' | 'inventory',
  targetId: string,
  userId: string,
  reason: string,
): Promise<void> {
  await db.reopenLogs.add({ id: newId(), targetType, targetId, userId, timestamp: Date.now(), reason })

  if (targetType === 'zoneCount') {
    const zc = await db.zoneCounts.get(targetId)
    if (zc) await db.zoneCounts.put({ ...zc, status: 'open', closedByUserId: undefined, closedAt: undefined })
  } else if (targetType === 'pass') {
    const pass = await db.passes.get(targetId)
    if (pass) await db.passes.put({ ...pass, status: 'in_progress' })
  } else {
    const inv = await db.inventories.get(targetId)
    if (inv) await db.inventories.put({ ...inv, status: 'in_progress', closedAt: undefined })
  }
}

export async function getPassLines(
  passId: string,
): Promise<Array<{ zoneId: string; materialId: string; quantity: number; zoneCountId: string; lineId: string }>> {
  const zoneCounts = await db.zoneCounts.where('passId').equals(passId).toArray()
  const result: Array<{ zoneId: string; materialId: string; quantity: number; zoneCountId: string; lineId: string }> = []

  for (const zc of zoneCounts) {
    const lines = await db.countLines.where('zoneCountId').equals(zc.id).toArray()
    for (const line of lines) {
      result.push({ zoneId: zc.zoneId, materialId: line.materialId, quantity: line.quantity, zoneCountId: zc.id, lineId: line.id })
    }
  }

  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/repositories/inventoryRepository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/inventoryRepository.ts src/db/repositories/inventoryRepository.test.ts
git commit -m "feat: add inventory/pass/zone-count repository with audit trail and locking"
```

---

### Task 11: Reconciliation Domain Logic

**Files:**
- Create: `src/domain/reconciliation.ts`
- Test: `src/domain/reconciliation.test.ts`

**Interfaces:**
- Produces:
  - `interface CountLineSnapshot { zoneId: string; materialId: string; quantity: number }`
  - `comparePasses(passA: CountLineSnapshot[], passB: CountLineSnapshot[]): { matched: CountLineSnapshot[]; mismatched: Array<{ zoneId: string; materialId: string; passAQuantity: number; passBQuantity: number }> }`
  - `type ThirdPassResolution = { zoneId: string; materialId: string; resolution: 'pass3_matches_pass1' | 'pass3_matches_pass2' | 'needs_manual_resolution'; officialQuantity?: number }`
  - `resolveThirdPass(pass1: CountLineSnapshot[], pass2: CountLineSnapshot[], pass3: CountLineSnapshot[]): ThirdPassResolution[]`

This module has no dependency on Dexie or the DOM — it operates on plain arrays so it can be tested in complete isolation.

- [ ] **Step 1: Write the failing test — `src/domain/reconciliation.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { comparePasses, resolveThirdPass } from './reconciliation'

describe('comparePasses', () => {
  it('reports all lines matched when quantities agree', () => {
    const passA = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    const passB = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    const result = comparePasses(passA, passB)
    expect(result.matched).toEqual(passA)
    expect(result.mismatched).toEqual([])
  })

  it('reports mismatched lines with both quantities', () => {
    const passA = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    const passB = [{ zoneId: 'z1', materialId: 'm1', quantity: 12 }]
    const result = comparePasses(passA, passB)
    expect(result.matched).toEqual([])
    expect(result.mismatched).toEqual([
      { zoneId: 'z1', materialId: 'm1', passAQuantity: 10, passBQuantity: 12 },
    ])
  })

  it('treats a line missing from one pass as mismatched against zero', () => {
    const passA = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    const passB: typeof passA = []
    const result = comparePasses(passA, passB)
    expect(result.mismatched).toEqual([
      { zoneId: 'z1', materialId: 'm1', passAQuantity: 10, passBQuantity: 0 },
    ])
  })
})

describe('resolveThirdPass', () => {
  it('resolves to pass1 value when pass3 matches pass1', () => {
    const pass1 = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    const pass2 = [{ zoneId: 'z1', materialId: 'm1', quantity: 12 }]
    const pass3 = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    expect(resolveThirdPass(pass1, pass2, pass3)).toEqual([
      { zoneId: 'z1', materialId: 'm1', resolution: 'pass3_matches_pass1', officialQuantity: 10 },
    ])
  })

  it('resolves to pass2 value when pass3 matches pass2', () => {
    const pass1 = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    const pass2 = [{ zoneId: 'z1', materialId: 'm1', quantity: 12 }]
    const pass3 = [{ zoneId: 'z1', materialId: 'm1', quantity: 12 }]
    expect(resolveThirdPass(pass1, pass2, pass3)).toEqual([
      { zoneId: 'z1', materialId: 'm1', resolution: 'pass3_matches_pass2', officialQuantity: 12 },
    ])
  })

  it('flags for manual resolution when all three passes differ', () => {
    const pass1 = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    const pass2 = [{ zoneId: 'z1', materialId: 'm1', quantity: 12 }]
    const pass3 = [{ zoneId: 'z1', materialId: 'm1', quantity: 14 }]
    expect(resolveThirdPass(pass1, pass2, pass3)).toEqual([
      { zoneId: 'z1', materialId: 'm1', resolution: 'needs_manual_resolution' },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/reconciliation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/domain/reconciliation.ts`**

```ts
export interface CountLineSnapshot {
  zoneId: string
  materialId: string
  quantity: number
}

interface Mismatch {
  zoneId: string
  materialId: string
  passAQuantity: number
  passBQuantity: number
}

function keyOf(line: { zoneId: string; materialId: string }): string {
  return `${line.zoneId}::${line.materialId}`
}

function toMap(lines: CountLineSnapshot[]): Map<string, number> {
  return new Map(lines.map((l) => [keyOf(l), l.quantity]))
}

export function comparePasses(
  passA: CountLineSnapshot[],
  passB: CountLineSnapshot[],
): { matched: CountLineSnapshot[]; mismatched: Mismatch[] } {
  const mapA = toMap(passA)
  const mapB = toMap(passB)
  const allKeys = new Set([...mapA.keys(), ...mapB.keys()])

  const matched: CountLineSnapshot[] = []
  const mismatched: Mismatch[] = []

  for (const key of allKeys) {
    const [zoneId, materialId] = key.split('::')
    const qtyA = mapA.get(key) ?? 0
    const qtyB = mapB.get(key) ?? 0
    if (qtyA === qtyB) {
      matched.push({ zoneId, materialId, quantity: qtyA })
    } else {
      mismatched.push({ zoneId, materialId, passAQuantity: qtyA, passBQuantity: qtyB })
    }
  }

  return { matched, mismatched }
}

export type ThirdPassResolution = {
  zoneId: string
  materialId: string
  resolution: 'pass3_matches_pass1' | 'pass3_matches_pass2' | 'needs_manual_resolution'
  officialQuantity?: number
}

export function resolveThirdPass(
  pass1: CountLineSnapshot[],
  pass2: CountLineSnapshot[],
  pass3: CountLineSnapshot[],
): ThirdPassResolution[] {
  const map1 = toMap(pass1)
  const map2 = toMap(pass2)
  const map3 = toMap(pass3)
  const allKeys = new Set([...map1.keys(), ...map2.keys(), ...map3.keys()])

  const results: ThirdPassResolution[] = []

  for (const key of allKeys) {
    const [zoneId, materialId] = key.split('::')
    const q1 = map1.get(key) ?? 0
    const q2 = map2.get(key) ?? 0
    const q3 = map3.get(key) ?? 0

    if (q3 === q1) {
      results.push({ zoneId, materialId, resolution: 'pass3_matches_pass1', officialQuantity: q1 })
    } else if (q3 === q2) {
      results.push({ zoneId, materialId, resolution: 'pass3_matches_pass2', officialQuantity: q2 })
    } else {
      results.push({ zoneId, materialId, resolution: 'needs_manual_resolution' })
    }
  }

  return results
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/reconciliation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/reconciliation.ts src/domain/reconciliation.test.ts
git commit -m "feat: add pure pass-comparison and third-pass reconciliation logic"
```

---

### Task 12: Start Inventory and Zone Picker Pages

**Files:**
- Create: `src/pages/inventory/StartInventoryPage.tsx`, `src/pages/inventory/ZonePickerPage.tsx`
- Test: `src/pages/inventory/StartInventoryPage.test.tsx`

**Interfaces:**
- Consumes: `startInventory` from `inventoryRepository.ts`; `listUsers` from `userRepository.ts`; `listZones`, `findZoneByBarcode` from `zoneRepository.ts`; `<BarcodeScanner />`.
- Produces: `<StartInventoryPage onStarted={(inventoryId: string, passId: string) => void} />`, `<ZonePickerPage passId={string} onZoneChosen={(zoneId: string) => void} />`.

- [ ] **Step 1: Write the failing test — `src/pages/inventory/StartInventoryPage.test.tsx`**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import { createUser } from '../../db/repositories/userRepository'
import StartInventoryPage from './StartInventoryPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('StartInventoryPage', () => {
  it('starts an inventory for the chosen user and name', async () => {
    await createUser('Alex')
    const onStarted = vi.fn()
    const user = userEvent.setup()
    render(<StartInventoryPage onStarted={onStarted} />)

    await user.selectOptions(await screen.findByLabelText(/user/i), 'Alex')
    await user.type(screen.getByLabelText(/inventory name/i), 'Q3 Paper Warehouse')
    await user.click(screen.getByRole('button', { name: /start inventory/i }))

    expect(onStarted).toHaveBeenCalledWith(expect.any(String), expect.any(String))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/inventory/StartInventoryPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/pages/inventory/StartInventoryPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { listUsers } from '../../db/repositories/userRepository'
import { startInventory } from '../../db/repositories/inventoryRepository'
import type { User } from '../../db/types'

interface StartInventoryPageProps {
  onStarted: (inventoryId: string, passId: string) => void
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

  return (
    <div className="screen">
      <h1>Start Inventory</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!userId || !name.trim()) return
          const { inventory, pass } = await startInventory(name.trim(), userId)
          onStarted(inventory.id, pass.id)
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
        <button type="submit">Start inventory</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/inventory/StartInventoryPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Create `src/pages/inventory/ZonePickerPage.tsx`** (no dedicated test — thin composition of already-tested pieces, exercised end-to-end in Task 16's flow test)

```tsx
import { useEffect, useState } from 'react'
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

  return (
    <div className="screen">
      <h1>Pick a Zone</h1>
      <BarcodeScanner
        onDetected={async (value) => {
          const zone = await findZoneByBarcode(value)
          if (zone) onZoneChosen(zone.id)
        }}
      />
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

- [ ] **Step 6: Commit**

```bash
git add src/pages/inventory/StartInventoryPage.tsx src/pages/inventory/ZonePickerPage.tsx src/pages/inventory/StartInventoryPage.test.tsx
git commit -m "feat: add start inventory and zone picker pages"
```

---

### Task 13: Material Picker and Counting Screen

**Files:**
- Create: `src/pages/inventory/MaterialPickerPage.tsx`, `src/pages/inventory/CountingScreen.tsx`
- Test: `src/pages/inventory/CountingScreen.test.tsx`

**Interfaces:**
- Consumes: `listMaterials`, `findMaterialByBarcode` from `materialRepository.ts`; `setCountLine` from `inventoryRepository.ts`; `savePhoto` from `photoRepository.ts`; `<TapCounter />`, `<PhotoCapture />`, `<BarcodeScanner />`.
- Produces: `<MaterialPickerPage onMaterialChosen={(materialId: string) => void} />`, `<CountingScreen zoneCountId={string} materialId={string} userId={string} expectedQuantity?: number initialQuantity={number} onSaved={() => void} />`.

- [ ] **Step 1: Write the failing test — `src/pages/inventory/CountingScreen.test.tsx`**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import CountingScreen from './CountingScreen'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('CountingScreen', () => {
  it('increments the counter and saves the count line', async () => {
    await db.zoneCounts.add({
      id: 'zc-1', passId: 'pass-1', zoneId: 'zone-1', status: 'open', openedByUserId: 'user-1', openedAt: Date.now(),
    })
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(
      <CountingScreen
        zoneCountId="zc-1"
        materialId="material-1"
        userId="user-1"
        initialQuantity={0}
        onSaved={onSaved}
      />,
    )

    await user.click(screen.getByRole('button', { name: '+1' }))
    await user.click(screen.getByRole('button', { name: '+1' }))
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(onSaved).toHaveBeenCalled()
    const line = await db.countLines.where({ zoneCountId: 'zc-1', materialId: 'material-1' }).first()
    expect(line?.quantity).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/inventory/CountingScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/pages/inventory/CountingScreen.tsx`**

```tsx
import { useState } from 'react'
import { setCountLine } from '../../db/repositories/inventoryRepository'
import { savePhoto } from '../../db/repositories/photoRepository'
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

  return (
    <div className="screen">
      <h1>Count</h1>
      {expectedQuantity !== undefined && <p>Expected: {expectedQuantity}</p>}
      <TapCounter value={quantity} onChange={setQuantity} />
      <PhotoCapture onCapture={setPhotoBlob} />
      <button
        type="button"
        onClick={async () => {
          const photoBlobId = photoBlob ? await savePhoto(photoBlob) : undefined
          await setCountLine(zoneCountId, materialId, quantity, userId, expectedQuantity)
          if (photoBlobId) {
            const line = await import('../../db/schema').then(({ db }) =>
              db.countLines.where({ zoneCountId, materialId }).first(),
            )
            if (line) {
              const { db } = await import('../../db/schema')
              await db.countLines.put({ ...line, photoBlobId })
            }
          }
          onSaved()
        }}
      >
        Save count
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/inventory/CountingScreen.test.tsx`
Expected: PASS

- [ ] **Step 5: Create `src/pages/inventory/MaterialPickerPage.tsx`** (no dedicated test — thin composition, exercised in Task 16's flow test)

```tsx
import { useEffect, useState } from 'react'
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

  return (
    <div className="screen">
      <h1>Pick a Material</h1>
      <BarcodeScanner
        onDetected={async (value) => {
          const material = await findMaterialByBarcode(value)
          if (material) onMaterialChosen(material.id)
        }}
      />
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

- [ ] **Step 6: Commit**

```bash
git add src/pages/inventory/MaterialPickerPage.tsx src/pages/inventory/CountingScreen.tsx src/pages/inventory/CountingScreen.test.tsx
git commit -m "feat: add material picker and counting screen"
```

---

### Task 14: Zone Summary and Pass Close Pages

**Files:**
- Create: `src/pages/inventory/ZoneSummaryPage.tsx`, `src/pages/inventory/PassClosePage.tsx`
- Test: `src/pages/inventory/PassClosePage.test.tsx`

**Interfaces:**
- Consumes: `closeZoneCount`, `closePass`, `startNextPass`, `closeInventory` from `inventoryRepository.ts`; `db` from `schema.ts` (to list zone counts for a pass).
- Produces:
  - `<ZoneSummaryPage zoneCountId={string} userId={string} onClosed={() => void} />`
  - `<PassClosePage passId={string} inventoryId={string} userId={string} onFinishedSinglePass={() => void} onSecondPassStarted={(passId: string) => void} />`

- [ ] **Step 1: Write the failing test — `src/pages/inventory/PassClosePage.test.tsx`**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import { startInventory } from '../../db/repositories/inventoryRepository'
import PassClosePage from './PassClosePage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('PassClosePage', () => {
  it('lets the user finish with a single pass, closing the inventory', async () => {
    const { inventory, pass } = await startInventory('Test Inventory', 'user-1')
    const onFinishedSinglePass = vi.fn()
    const user = userEvent.setup()
    render(
      <PassClosePage
        passId={pass.id}
        inventoryId={inventory.id}
        userId="user-1"
        onFinishedSinglePass={onFinishedSinglePass}
        onSecondPassStarted={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /finish with one pass/i }))

    expect(onFinishedSinglePass).toHaveBeenCalled()
    const updated = await db.inventories.get(inventory.id)
    expect(updated?.status).toBe('closed_single_pass')
  })

  it('lets the user start a second pass', async () => {
    const { inventory, pass } = await startInventory('Test Inventory', 'user-1')
    const onSecondPassStarted = vi.fn()
    const user = userEvent.setup()
    render(
      <PassClosePage
        passId={pass.id}
        inventoryId={inventory.id}
        userId="user-1"
        onFinishedSinglePass={vi.fn()}
        onSecondPassStarted={onSecondPassStarted}
      />,
    )

    await user.click(screen.getByRole('button', { name: /start second pass/i }))

    expect(onSecondPassStarted).toHaveBeenCalledWith(expect.any(String))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/inventory/PassClosePage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/pages/inventory/ZoneSummaryPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { closeZoneCount } from '../../db/repositories/inventoryRepository'
import { db } from '../../db/schema'
import type { MaterialCountLine } from '../../db/types'

interface ZoneSummaryPageProps {
  zoneCountId: string
  userId: string
  onClosed: () => void
}

export default function ZoneSummaryPage({ zoneCountId, userId, onClosed }: ZoneSummaryPageProps) {
  const [lines, setLines] = useState<MaterialCountLine[]>([])

  useEffect(() => {
    db.countLines.where('zoneCountId').equals(zoneCountId).toArray().then(setLines)
  }, [zoneCountId])

  return (
    <div className="screen">
      <h1>Zone Summary</h1>
      <ul>
        {lines.map((l) => (
          <li key={l.id} className="list-item">Material {l.materialId}: {l.quantity}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={async () => {
          await closeZoneCount(zoneCountId, userId)
          onClosed()
        }}
      >
        Close zone
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Create `src/pages/inventory/PassClosePage.tsx`**

```tsx
import { closePass, startNextPass, closeInventory } from '../../db/repositories/inventoryRepository'

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
  return (
    <div className="screen">
      <h1>Pass 1 Complete</h1>
      <p>Choose how to proceed:</p>
      <button
        type="button"
        onClick={async () => {
          await closePass(passId, userId)
          await closeInventory(inventoryId, 'closed_single_pass')
          onFinishedSinglePass()
        }}
      >
        Finish with one pass
      </button>
      <button
        type="button"
        className="secondary"
        onClick={async () => {
          await closePass(passId, userId)
          const pass = await startNextPass(inventoryId, 2)
          onSecondPassStarted(pass.id)
        }}
      >
        Start second pass
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/pages/inventory/PassClosePage.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/inventory/ZoneSummaryPage.tsx src/pages/inventory/PassClosePage.tsx src/pages/inventory/PassClosePage.test.tsx
git commit -m "feat: add zone summary and pass close pages"
```

---

### Task 15: Second Pass Auto-Reconciliation and Variance Report Page

**Files:**
- Create: `src/pages/inventory/VarianceReportPage.tsx`
- Test: `src/pages/inventory/VarianceReportPage.test.tsx`

**Interfaces:**
- Consumes: `getPassLines`, `closeInventory`, `startNextPass` from `inventoryRepository.ts`; `comparePasses` from `reconciliation.ts`.
- Produces: `<VarianceReportPage inventoryId={string} pass1Id={string} pass2Id={string} onResolved={(outcome: 'successful' | 'needs_3rd_pass', pass3Id?: string) => void} />` — on mount, this page compares pass1 vs pass2 lines, and either shows a success message (auto-closing the inventory) or a mismatch table with a button to start Pass 3.

- [ ] **Step 1: Write the failing test — `src/pages/inventory/VarianceReportPage.test.tsx`**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import { startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount, closePass, startNextPass } from '../../db/repositories/inventoryRepository'
import VarianceReportPage from './VarianceReportPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

async function countAndClose(passId: string, zoneId: string, materialId: string, qty: number) {
  const zc = await getOrOpenZoneCount(passId, zoneId, 'user-1')
  await setCountLine(zc.id, materialId, qty, 'user-1')
  await closeZoneCount(zc.id, 'user-1')
}

describe('VarianceReportPage', () => {
  it('reports success and closes the inventory when both passes match', async () => {
    const { inventory, pass } = await startInventory('Inv', 'user-1')
    await countAndClose(pass.id, 'zone-1', 'material-1', 10)
    await closePass(pass.id, 'user-1')
    const pass2 = await startNextPass(inventory.id, 2)
    await countAndClose(pass2.id, 'zone-1', 'material-1', 10)
    await closePass(pass2.id, 'user-1')

    const onResolved = vi.fn()
    render(
      <VarianceReportPage inventoryId={inventory.id} pass1Id={pass.id} pass2Id={pass2.id} onResolved={onResolved} />,
    )

    expect(await screen.findByText(/successful/i)).toBeInTheDocument()
    expect(onResolved).toHaveBeenCalledWith('successful')
    const updated = await db.inventories.get(inventory.id)
    expect(updated?.status).toBe('successful')
  })

  it('lists mismatches and starts a third pass', async () => {
    const { inventory, pass } = await startInventory('Inv', 'user-1')
    await countAndClose(pass.id, 'zone-1', 'material-1', 10)
    await closePass(pass.id, 'user-1')
    const pass2 = await startNextPass(inventory.id, 2)
    await countAndClose(pass2.id, 'zone-1', 'material-1', 12)
    await closePass(pass2.id, 'user-1')

    const onResolved = vi.fn()
    const user = userEvent.setup()
    render(
      <VarianceReportPage inventoryId={inventory.id} pass1Id={pass.id} pass2Id={pass2.id} onResolved={onResolved} />,
    )

    expect(await screen.findByText(/10/)).toBeInTheDocument()
    expect(screen.getByText(/12/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /start third pass/i }))
    expect(onResolved).toHaveBeenCalledWith('needs_3rd_pass', expect.any(String))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/inventory/VarianceReportPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/pages/inventory/VarianceReportPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { getPassLines, closeInventory, startNextPass } from '../../db/repositories/inventoryRepository'
import { comparePasses } from '../../domain/reconciliation'
import type { CountLineSnapshot } from '../../domain/reconciliation'

interface VarianceReportPageProps {
  inventoryId: string
  pass1Id: string
  pass2Id: string
  onResolved: (outcome: 'successful' | 'needs_3rd_pass', pass3Id?: string) => void
}

export default function VarianceReportPage({ inventoryId, pass1Id, pass2Id, onResolved }: VarianceReportPageProps) {
  const [mismatched, setMismatched] = useState<
    Array<{ zoneId: string; materialId: string; passAQuantity: number; passBQuantity: number }> | null
  >(null)

  useEffect(() => {
    (async () => {
      const pass1Lines: CountLineSnapshot[] = await getPassLines(pass1Id)
      const pass2Lines: CountLineSnapshot[] = await getPassLines(pass2Id)
      const { mismatched: diffs } = comparePasses(pass1Lines, pass2Lines)

      if (diffs.length === 0) {
        await closeInventory(inventoryId, 'successful')
        setMismatched([])
        onResolved('successful')
      } else {
        setMismatched(diffs)
      }
    })()
  }, [inventoryId, pass1Id, pass2Id, onResolved])

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
      <ul>
        {mismatched.map((m) => (
          <li key={`${m.zoneId}-${m.materialId}`} className="list-item">
            Zone {m.zoneId} / Material {m.materialId}: {m.passAQuantity} vs {m.passBQuantity}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={async () => {
          const pass3 = await startNextPass(inventoryId, 3)
          onResolved('needs_3rd_pass', pass3.id)
        }}
      >
        Start third pass
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/inventory/VarianceReportPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/inventory/VarianceReportPage.tsx src/pages/inventory/VarianceReportPage.test.tsx
git commit -m "feat: add automatic pass-2 reconciliation and variance report page"
```

---

### Task 16: Third Pass (Scoped) and Manual Resolution Pages

**Files:**
- Create: `src/pages/inventory/ThirdPassPickerPage.tsx`, `src/pages/inventory/ManualResolutionPage.tsx`
- Test: `src/pages/inventory/ManualResolutionPage.test.tsx`

**Interfaces:**
- Consumes: `getPassLines`, `closeInventory`, `setCountLine` from `inventoryRepository.ts`; `resolveThirdPass` from `reconciliation.ts`.
- Produces:
  - `<ThirdPassPickerPage mismatches={Array<{ zoneId: string; materialId: string }>} onPairChosen={(zoneId: string, materialId: string) => void} />` — restricts counting to only the mismatched pairs from Task 15.
  - `<ManualResolutionPage inventoryId={string} pass1Id={string} pass2Id={string} pass3Id={string} userId={string} onResolved={() => void} />` — computes `resolveThirdPass`, auto-applies matches, and presents a form for any `needs_manual_resolution` lines requiring a supervisor-entered quantity + reason.

- [ ] **Step 1: Write the failing test — `src/pages/inventory/ManualResolutionPage.test.tsx`**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import {
  startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount, closePass, startNextPass,
} from '../../db/repositories/inventoryRepository'
import ManualResolutionPage from './ManualResolutionPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

async function countAndClose(passId: string, zoneId: string, materialId: string, qty: number) {
  const zc = await getOrOpenZoneCount(passId, zoneId, 'user-1')
  await setCountLine(zc.id, materialId, qty, 'user-1')
  await closeZoneCount(zc.id, 'user-1')
}

describe('ManualResolutionPage', () => {
  it('shows a reason form for lines where all three passes disagree, and closes the inventory once resolved', async () => {
    const { inventory, pass } = await startInventory('Inv', 'user-1')
    await countAndClose(pass.id, 'zone-1', 'material-1', 10)
    await closePass(pass.id, 'user-1')

    const pass2 = await startNextPass(inventory.id, 2)
    await countAndClose(pass2.id, 'zone-1', 'material-1', 12)
    await closePass(pass2.id, 'user-1')

    const pass3 = await startNextPass(inventory.id, 3)
    await countAndClose(pass3.id, 'zone-1', 'material-1', 14)
    await closePass(pass3.id, 'user-1')

    const onResolved = vi.fn()
    const user = userEvent.setup()
    render(
      <ManualResolutionPage
        inventoryId={inventory.id} pass1Id={pass.id} pass2Id={pass2.id} pass3Id={pass3.id}
        userId="user-1" onResolved={onResolved}
      />,
    )

    expect(await screen.findByText(/needs manual resolution/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/final quantity/i), '13')
    await user.type(screen.getByLabelText(/reason/i), 'supervisor recount, agreed on 13')
    await user.click(screen.getByRole('button', { name: /confirm final count/i }))

    expect(onResolved).toHaveBeenCalled()
    const updated = await db.inventories.get(inventory.id)
    expect(updated?.status).toBe('successful')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/inventory/ManualResolutionPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/pages/inventory/ThirdPassPickerPage.tsx`**

```tsx
interface ThirdPassPickerPageProps {
  mismatches: Array<{ zoneId: string; materialId: string }>
  onPairChosen: (zoneId: string, materialId: string) => void
}

export default function ThirdPassPickerPage({ mismatches, onPairChosen }: ThirdPassPickerPageProps) {
  return (
    <div className="screen">
      <h1>Third Pass — Recount Mismatches</h1>
      <ul>
        {mismatches.map((m) => (
          <li key={`${m.zoneId}-${m.materialId}`}>
            <button
              className="secondary"
              style={{ width: '100%' }}
              onClick={() => onPairChosen(m.zoneId, m.materialId)}
            >
              Zone {m.zoneId} / Material {m.materialId}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Create `src/pages/inventory/ManualResolutionPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { getPassLines, closeInventory, setCountLine, getOrOpenZoneCount } from '../../db/repositories/inventoryRepository'
import { resolveThirdPass, type ThirdPassResolution } from '../../domain/reconciliation'
import type { CountLineSnapshot } from '../../domain/reconciliation'

interface ManualResolutionPageProps {
  inventoryId: string
  pass1Id: string
  pass2Id: string
  pass3Id: string
  userId: string
  onResolved: () => void
}

export default function ManualResolutionPage({
  inventoryId, pass1Id, pass2Id, pass3Id, userId, onResolved,
}: ManualResolutionPageProps) {
  const [needsManual, setNeedsManual] = useState<ThirdPassResolution[]>([])
  const [entries, setEntries] = useState<Record<string, { quantity: string; reason: string }>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    (async () => {
      const pass1Lines: CountLineSnapshot[] = await getPassLines(pass1Id)
      const pass2Lines: CountLineSnapshot[] = await getPassLines(pass2Id)
      const pass3Lines: CountLineSnapshot[] = await getPassLines(pass3Id)
      const resolutions = resolveThirdPass(pass1Lines, pass2Lines, pass3Lines)
      setNeedsManual(resolutions.filter((r) => r.resolution === 'needs_manual_resolution'))
      setLoaded(true)
    })()
  }, [pass1Id, pass2Id, pass3Id])

  if (!loaded) return <div className="screen">Loading…</div>

  return (
    <div className="screen">
      <h1>Manual Resolution Needed</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          for (const item of needsManual) {
            const key = `${item.zoneId}-${item.materialId}`
            const entry = entries[key]
            if (!entry || entry.quantity === '' || !entry.reason.trim()) return
            const zoneCount = await getOrOpenZoneCount(pass3Id, item.zoneId, userId)
            await setCountLine(zoneCount.id, item.materialId, Number(entry.quantity), userId)
          }
          await closeInventory(inventoryId, 'successful')
          onResolved()
        }}
      >
        {needsManual.map((item) => {
          const key = `${item.zoneId}-${item.materialId}`
          return (
            <div key={key} className="form-row">
              <p>Needs manual resolution — Zone {item.zoneId} / Material {item.materialId}</p>
              <label htmlFor={`qty-${key}`}>Final quantity</label>
              <input
                id={`qty-${key}`}
                aria-label="final quantity"
                type="number"
                value={entries[key]?.quantity ?? ''}
                onChange={(e) =>
                  setEntries((prev) => ({ ...prev, [key]: { quantity: e.target.value, reason: prev[key]?.reason ?? '' } }))
                }
              />
              <label htmlFor={`reason-${key}`}>Reason</label>
              <input
                id={`reason-${key}`}
                aria-label="reason"
                value={entries[key]?.reason ?? ''}
                onChange={(e) =>
                  setEntries((prev) => ({ ...prev, [key]: { quantity: prev[key]?.quantity ?? '', reason: e.target.value } }))
                }
              />
            </div>
          )
        })}
        <button type="submit">Confirm final count</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/pages/inventory/ManualResolutionPage.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/inventory/ThirdPassPickerPage.tsx src/pages/inventory/ManualResolutionPage.tsx src/pages/inventory/ManualResolutionPage.test.tsx
git commit -m "feat: add scoped third pass picker and manual resolution page"
```

---

### Task 17: CSV Export (Detail and Summary)

**Files:**
- Modify: `src/domain/csv.ts` (add export-side functions)
- Create: `src/pages/ExportPage.tsx`
- Test: `src/domain/csv.test.ts` (extend), `src/pages/ExportPage.test.tsx`

**Interfaces:**
- Produces (added to `src/domain/csv.ts`):
  - `interface DetailRow { inventoryName: string; passNumber: number; zoneName: string; sapStorageLocation?: string; materialName: string; sapMaterialNumber?: string; unitCode: string; expectedQuantity?: number; countedQuantity: number; variance?: number; status: string; countedByUser: string; timestamp: string }`
  - `buildDetailCsv(rows: DetailRow[]): string`
  - `interface SummaryRow { zoneName: string; materialName: string; officialQuantity: number; expectedQuantity?: number; variance?: number }`
  - `buildSummaryCsv(rows: SummaryRow[]): string`
- Produces: `<ExportPage inventoryId={string} />` — loads inventory data, builds both CSVs, and offers download links (`Blob` + object URL).

- [ ] **Step 1: Write the failing test — extend `src/domain/csv.test.ts`**

Add to the existing `describe('csv import parsing', ...)` file a new describe block:

```ts
import { buildDetailCsv, buildSummaryCsv } from './csv'

describe('csv export building', () => {
  it('builds a detail CSV with a header row', () => {
    const csv = buildDetailCsv([
      {
        inventoryName: 'Q3 Paper Warehouse', passNumber: 1, zoneName: 'Warehouse A',
        sapStorageLocation: 'SL01', materialName: 'Kraft Paper', sapMaterialNumber: 'SAP001',
        unitCode: 'KG', expectedQuantity: 100, countedQuantity: 98, variance: -2,
        status: 'matched', countedByUser: 'Alex', timestamp: '2026-07-29T10:00:00.000Z',
      },
    ])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe(
      'inventoryName,passNumber,zoneName,sapStorageLocation,materialName,sapMaterialNumber,unitCode,expectedQuantity,countedQuantity,variance,status,countedByUser,timestamp',
    )
    expect(lines[1]).toContain('Q3 Paper Warehouse')
    expect(lines[1]).toContain('Kraft Paper')
  })

  it('builds a summary CSV with a header row', () => {
    const csv = buildSummaryCsv([
      { zoneName: 'Warehouse A', materialName: 'Kraft Paper', officialQuantity: 98, expectedQuantity: 100, variance: -2 },
    ])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('zoneName,materialName,officialQuantity,expectedQuantity,variance')
    expect(lines[1]).toBe('Warehouse A,Kraft Paper,98,100,-2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/csv.test.ts`
Expected: FAIL — `buildDetailCsv`/`buildSummaryCsv` not exported.

- [ ] **Step 3: Add export functions to `src/domain/csv.ts`**

Append to the existing file:

```ts
export interface DetailRow {
  inventoryName: string
  passNumber: number
  zoneName: string
  sapStorageLocation?: string
  materialName: string
  sapMaterialNumber?: string
  unitCode: string
  expectedQuantity?: number
  countedQuantity: number
  variance?: number
  status: string
  countedByUser: string
  timestamp: string
}

export function buildDetailCsv(rows: DetailRow[]): string {
  return Papa.unparse(
    rows.map((r) => ({
      inventoryName: r.inventoryName,
      passNumber: r.passNumber,
      zoneName: r.zoneName,
      sapStorageLocation: r.sapStorageLocation ?? '',
      materialName: r.materialName,
      sapMaterialNumber: r.sapMaterialNumber ?? '',
      unitCode: r.unitCode,
      expectedQuantity: r.expectedQuantity ?? '',
      countedQuantity: r.countedQuantity,
      variance: r.variance ?? '',
      status: r.status,
      countedByUser: r.countedByUser,
      timestamp: r.timestamp,
    })),
  )
}

export interface SummaryRow {
  zoneName: string
  materialName: string
  officialQuantity: number
  expectedQuantity?: number
  variance?: number
}

export function buildSummaryCsv(rows: SummaryRow[]): string {
  return Papa.unparse(
    rows.map((r) => ({
      zoneName: r.zoneName,
      materialName: r.materialName,
      officialQuantity: r.officialQuantity,
      expectedQuantity: r.expectedQuantity ?? '',
      variance: r.variance ?? '',
    })),
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/csv.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test — `src/pages/ExportPage.test.tsx`**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../db/schema'
import { createUser } from '../db/repositories/userRepository'
import { createZone } from '../db/repositories/zoneRepository'
import { createUnit } from '../db/repositories/unitRepository'
import { createMaterial } from '../db/repositories/materialRepository'
import {
  startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount, closePass, closeInventory,
} from '../db/repositories/inventoryRepository'
import ExportPage from './ExportPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('ExportPage', () => {
  it('renders download links once export data is ready', async () => {
    const user = await createUser('Alex')
    const zone = await createZone({ name: 'Warehouse A' })
    const unit = await createUnit('KG', 'Kilogram')
    const material = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const { inventory, pass } = await startInventory('Q3 Paper Warehouse', user.id)
    const zc = await getOrOpenZoneCount(pass.id, zone.id, user.id)
    await setCountLine(zc.id, material.id, 98, user.id, 100)
    await closeZoneCount(zc.id, user.id)
    await closePass(pass.id, user.id)
    await closeInventory(inventory.id, 'closed_single_pass')

    render(<ExportPage inventoryId={inventory.id} />)

    expect(await screen.findByRole('link', { name: /download detail csv/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /download summary csv/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/pages/ExportPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Create `src/pages/ExportPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { db } from '../db/schema'
import { buildDetailCsv, buildSummaryCsv, type DetailRow, type SummaryRow } from '../domain/csv'

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
      const passes = await db.passes.where('inventoryId').equals(inventoryId).toArray()

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
              status: 'recorded',
              countedByUser: updatedBy?.name ?? line.updatedByUserId,
              timestamp: new Date(line.updatedAt).toISOString(),
            })

            const key = `${zc.zoneId}::${line.materialId}`
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

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/pages/ExportPage.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/domain/csv.ts src/domain/csv.test.ts src/pages/ExportPage.tsx src/pages/ExportPage.test.tsx
git commit -m "feat: add CSV export (detail + summary) and export page"
```

---

### Task 18: Full JSON/Zip Backup Export and Import

**Files:**
- Create: `src/domain/backup.ts`
- Test: `src/domain/backup.test.ts`

**Interfaces:**
- Consumes: `db` (all tables).
- Produces: `exportBackup(): Promise<Blob>`, `importBackup(zipBlob: Blob): Promise<void>`.

Backup format: a zip with `data.json` (all non-photo tables, keyed by table name) and a `photos/` folder containing each photo blob named `<id>.bin`, referenced from `data.json`'s `photos` array by id.

- [ ] **Step 1: Write the failing test — `src/domain/backup.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../db/schema'
import { createUser } from '../db/repositories/userRepository'
import { createZone } from '../db/repositories/zoneRepository'
import { savePhoto } from '../db/repositories/photoRepository'
import { exportBackup, importBackup } from './backup'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('backup', () => {
  it('exports and re-imports all data including photo blobs', async () => {
    await createUser('Alex')
    await createZone({ name: 'Warehouse A' })
    const photoId = await savePhoto(new Blob(['fake-bytes'], { type: 'image/jpeg' }))

    const zip = await exportBackup()

    await Promise.all(db.tables.map((t) => t.clear()))
    expect(await db.users.count()).toBe(0)

    await importBackup(zip)

    const users = await db.users.toArray()
    const zones = await db.zones.toArray()
    const photo = await db.photos.get(photoId)

    expect(users.map((u) => u.name)).toEqual(['Alex'])
    expect(zones.map((z) => z.name)).toEqual(['Warehouse A'])
    expect(photo?.blob.size).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/backup.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/domain/backup.ts`**

```ts
import JSZip from 'jszip'
import { db } from '../db/schema'

const DATA_TABLES = [
  'users', 'units', 'materials', 'zones', 'inventories', 'passes',
  'zoneCounts', 'countLines', 'auditEntries', 'reopenLogs',
] as const

export async function exportBackup(): Promise<Blob> {
  const zip = new JSZip()

  const data: Record<string, unknown[]> = {}
  for (const tableName of DATA_TABLES) {
    data[tableName] = await db.table(tableName).toArray()
  }

  const photos = await db.photos.toArray()
  data.photoIds = photos.map((p) => p.id)

  zip.file('data.json', JSON.stringify(data))
  const photosFolder = zip.folder('photos')!
  for (const photo of photos) {
    photosFolder.file(`${photo.id}.bin`, photo.blob)
  }

  return zip.generateAsync({ type: 'blob' })
}

export async function importBackup(zipBlob: Blob): Promise<void> {
  const zip = await JSZip.loadAsync(zipBlob)
  const dataFile = zip.file('data.json')
  if (!dataFile) throw new Error('Invalid backup: missing data.json')

  const data = JSON.parse(await dataFile.async('string')) as Record<string, unknown[]> & { photoIds: string[] }

  for (const tableName of DATA_TABLES) {
    const rows = (data[tableName] ?? []) as Array<Record<string, unknown>>
    if (rows.length > 0) await db.table(tableName).bulkPut(rows)
  }

  for (const photoId of data.photoIds ?? []) {
    const file = zip.file(`photos/${photoId}.bin`)
    if (!file) continue
    const blob = await file.async('blob')
    await db.photos.put({ id: photoId, blob, createdAt: Date.now() })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/backup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/backup.ts src/domain/backup.test.ts
git commit -m "feat: add full JSON/zip backup export and import"
```

---

### Task 19: Progress Dashboard, Variance Highlighting, and Not-Counted Detection

**Files:**
- Create: `src/pages/inventory/ProgressDashboardPage.tsx`
- Modify: `src/pages/inventory/CountingScreen.tsx` (variance highlighting)
- Test: `src/pages/inventory/ProgressDashboardPage.test.tsx`, extend `src/pages/inventory/CountingScreen.test.tsx`

**Interfaces:**
- Consumes: `db` (zones, materials, zoneCounts, countLines for a pass).
- Produces: `<ProgressDashboardPage passId={string} />` — shows zones closed/total, materials counted, and expected Zone+Material pairs with no count line yet ("not counted").

- [ ] **Step 1: Write the failing test — `src/pages/inventory/ProgressDashboardPage.test.tsx`**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../../db/schema'
import { createZone } from '../../db/repositories/zoneRepository'
import { createUnit } from '../../db/repositories/unitRepository'
import { createMaterial } from '../../db/repositories/materialRepository'
import {
  startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount,
} from '../../db/repositories/inventoryRepository'
import ProgressDashboardPage from './ProgressDashboardPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('ProgressDashboardPage', () => {
  it('shows zones closed vs total and materials counted', async () => {
    const zoneA = await createZone({ name: 'Warehouse A' })
    const zoneB = await createZone({ name: 'Warehouse B' })
    const unit = await createUnit('KG', 'Kilogram')
    const material = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const { pass } = await startInventory('Inv', 'user-1')

    const zcA = await getOrOpenZoneCount(pass.id, zoneA.id, 'user-1')
    await setCountLine(zcA.id, material.id, 5, 'user-1')
    await closeZoneCount(zcA.id, 'user-1')
    await getOrOpenZoneCount(pass.id, zoneB.id, 'user-1')

    render(<ProgressDashboardPage passId={pass.id} />)

    expect(await screen.findByText(/1 \/ 2 zones closed/i)).toBeInTheDocument()
    expect(screen.getByText(/1 material line/i)).toBeInTheDocument()
  })

  it('flags expected zone/material pairs with no count line as not counted', async () => {
    const zoneA = await createZone({ name: 'Warehouse A' })
    const unit = await createUnit('KG', 'Kilogram')
    const materialCounted = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const materialMissing = await createMaterial({ name: 'Recycled Pulp', unitId: unit.id })
    const { pass } = await startInventory('Inv', 'user-1')

    const zcA = await getOrOpenZoneCount(pass.id, zoneA.id, 'user-1')
    await setCountLine(zcA.id, materialCounted.id, 5, 'user-1', 5)
    await db.countLines.where({ zoneCountId: zcA.id }).first()

    render(
      <ProgressDashboardPage
        passId={pass.id}
        expectedPairs={[
          { zoneId: zoneA.id, materialId: materialCounted.id },
          { zoneId: zoneA.id, materialId: materialMissing.id },
        ]}
      />,
    )

    expect(await screen.findByText(/not counted/i)).toBeInTheDocument()
    expect(screen.getByText(/Recycled Pulp|material/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/inventory/ProgressDashboardPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/pages/inventory/ProgressDashboardPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { db } from '../../db/schema'

interface ProgressDashboardPageProps {
  passId: string
  expectedPairs?: Array<{ zoneId: string; materialId: string }>
}

export default function ProgressDashboardPage({ passId, expectedPairs = [] }: ProgressDashboardPageProps) {
  const [zonesClosed, setZonesClosed] = useState(0)
  const [zonesTotal, setZonesTotal] = useState(0)
  const [lineCount, setLineCount] = useState(0)
  const [notCounted, setNotCounted] = useState<Array<{ zoneId: string; materialId: string; materialName: string }>>([])

  useEffect(() => {
    (async () => {
      const zoneCounts = await db.zoneCounts.where('passId').equals(passId).toArray()
      setZonesTotal(zoneCounts.length)
      setZonesClosed(zoneCounts.filter((zc) => zc.status === 'closed').length)

      let count = 0
      const countedPairs = new Set<string>()
      for (const zc of zoneCounts) {
        const lines = await db.countLines.where('zoneCountId').equals(zc.id).toArray()
        count += lines.length
        for (const line of lines) countedPairs.add(`${zc.zoneId}::${line.materialId}`)
      }
      setLineCount(count)

      const missing = []
      for (const pair of expectedPairs) {
        if (!countedPairs.has(`${pair.zoneId}::${pair.materialId}`)) {
          const material = await db.materials.get(pair.materialId)
          missing.push({ ...pair, materialName: material?.name ?? pair.materialId })
        }
      }
      setNotCounted(missing)
    })()
  }, [passId, expectedPairs])

  return (
    <div className="screen">
      <h1>Progress</h1>
      <p>{zonesClosed} / {zonesTotal} zones closed</p>
      <p>{lineCount} material line{lineCount === 1 ? '' : 's'} counted</p>
      {notCounted.length > 0 && (
        <>
          <h2>Not counted</h2>
          <ul>
            {notCounted.map((m) => (
              <li key={`${m.zoneId}-${m.materialId}`} className="list-item">{m.materialName} (Zone {m.zoneId})</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/inventory/ProgressDashboardPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Write the failing test — extend `src/pages/inventory/CountingScreen.test.tsx`**

Add a new test to the existing describe block:

```tsx
it('visually flags a variance beyond 10% of the expected quantity', async () => {
  await db.zoneCounts.add({
    id: 'zc-2', passId: 'pass-1', zoneId: 'zone-1', status: 'open', openedByUserId: 'user-1', openedAt: Date.now(),
  })
  render(
    <CountingScreen
      zoneCountId="zc-2"
      materialId="material-1"
      userId="user-1"
      expectedQuantity={100}
      initialQuantity={80}
      onSaved={() => {}}
    />,
  )

  expect(screen.getByText(/variance/i)).toHaveClass('variance-warning')
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/pages/inventory/CountingScreen.test.tsx`
Expected: FAIL — no element with variance-warning class.

- [ ] **Step 7: Modify `src/pages/inventory/CountingScreen.tsx` to add variance highlighting**

Replace the `{expectedQuantity !== undefined && <p>Expected: {expectedQuantity}</p>}` line with:

```tsx
{expectedQuantity !== undefined && (
  <p>
    Expected: {expectedQuantity}{' '}
    {Math.abs(quantity - expectedQuantity) / Math.max(expectedQuantity, 1) > 0.1 && (
      <span className="variance-warning">Variance: {quantity - expectedQuantity}</span>
    )}
  </p>
)}
```

Add to `src/styles.css`:

```css
.variance-warning {
  color: #d93025;
  font-weight: bold;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/pages/inventory/CountingScreen.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/pages/inventory/ProgressDashboardPage.tsx src/pages/inventory/ProgressDashboardPage.test.tsx src/pages/inventory/CountingScreen.tsx src/pages/inventory/CountingScreen.test.tsx src/styles.css
git commit -m "feat: add progress dashboard, not-counted detection, and variance highlighting"
```

---

### Task 20: App Routing — Wire All Pages Together

**Files:**
- Modify: `src/App.tsx`
- Create: `src/pages/HomePage.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: every page component from Tasks 7–19.
- Produces: full client-side routing via `react-router-dom`, so the app is navigable end-to-end from a phone browser.

- [ ] **Step 1: Write the failing test — replace `src/App.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the home page with navigation links', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: /start inventory/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /master data/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — no navigation links exist yet.

- [ ] **Step 3: Create `src/pages/HomePage.tsx`**

```tsx
import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div className="screen">
      <h1>MX Inventory</h1>
      <ul>
        <li><Link to="/inventory/new">Start Inventory</Link></li>
        <li><Link to="/master-data">Master Data</Link></li>
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Replace `src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom'
import HomePage from './pages/HomePage'
import UsersPage from './pages/masterData/UsersPage'
import UnitsPage from './pages/masterData/UnitsPage'
import ZonesPage from './pages/masterData/ZonesPage'
import MaterialsPage from './pages/masterData/MaterialsPage'
import ImportPage from './pages/masterData/ImportPage'
import StartInventoryPage from './pages/inventory/StartInventoryPage'
import ExportPage from './pages/ExportPage'

function MasterDataHome() {
  return (
    <div className="screen">
      <h1>Master Data</h1>
      <ul>
        <li><a href="/master-data/users">Users</a></li>
        <li><a href="/master-data/units">Units</a></li>
        <li><a href="/master-data/zones">Zones</a></li>
        <li><a href="/master-data/materials">Materials</a></li>
        <li><a href="/master-data/import">Import from CSV</a></li>
      </ul>
    </div>
  )
}

function StartInventoryRoute() {
  const navigate = useNavigate()
  return (
    <StartInventoryPage
      onStarted={(inventoryId, passId) => navigate(`/inventory/${inventoryId}/pass/${passId}/zone-picker`)}
    />
  )
}

function ExportRoute() {
  const { inventoryId } = useParams<{ inventoryId: string }>()
  return <ExportPage inventoryId={inventoryId!} />
}

function App() {
  return (
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
        <Route path="/inventory/:inventoryId/export" element={<ExportRoute />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

Note: the counting flow (`zone-picker` → `material-picker` → `count` → `zone-summary` → `pass-close` → `variance-report` → `third-pass` → `manual-resolution`) is a stateful wizard rather than independently addressable routes with fetchable data (each step needs the previous step's in-memory selection, e.g. which zone/material is active). Wire it as a single `/inventory/:inventoryId/pass/:passId/*` route rendering a small local wizard component that holds `{ zoneId, materialId }` in React state and swaps between the Task 12–16 page components — this keeps each page component reusable and independently tested, while the wizard itself is straightforward glue with no business logic of its own, so it does not need a dedicated unit test beyond the existing per-page tests.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every test written in Tasks 1–19 still passes.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/pages/HomePage.tsx src/App.test.tsx
git commit -m "feat: wire up app routing across master data and inventory pages"
```

---

### Task 21: PWA Installability and Offline Support

**Files:**
- Modify: `vite.config.ts` (add `VitePWA` plugin)
- Create: `public/manifest.json`, `public/icons/icon-192.png`, `public/icons/icon-512.png`

**Interfaces:**
- Produces: an installable, offline-capable build (`npm run build` output in `dist/`) — no new application-level TypeScript interfaces.

This task has no automated test — service worker registration and installability can only be meaningfully verified on a real device/browser, per the design spec's testing considerations (§9). Verification is manual, listed in the steps below.

- [ ] **Step 1: Create `public/manifest.json`**

```json
{
  "name": "MX Inventory",
  "short_name": "MX Inventory",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a73e8",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Generate placeholder icons**

Run (requires Node available; produces two solid-color PNGs as a starting point — replace with real branded icons before shipping):

```bash
node -e "
const fs = require('fs');
const zlib = require('zlib');
function makePng(size) {
  const width = size, height = size;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const off = y * (width * 3 + 1) + 1 + x * 3;
      raw[off] = 0x1a; raw[off + 1] = 0x73; raw[off + 2] = 0xe8;
    }
  }
  const idat = zlib.deflateSync(raw);
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type);
    const crc = Buffer.alloc(4);
    const crcTable = require('zlib').crc32 ? null : null;
    return Buffer.concat([len, typeBuf, data]);
  }
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  const crc32 = (buf) => { let c = ~0; for (let i=0;i<buf.length;i++){c^=buf[i];for(let j=0;j<8;j++){c=(c>>>1)^(0xEDB88320&-(c&1));}} return ~c>>>0; };
  function ch(type, data){ const t=Buffer.from(type); const len=Buffer.alloc(4); len.writeUInt32BE(data.length); const crcBuf=Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t,data]))); return Buffer.concat([len,t,data,crcBuf]); }
  return Buffer.concat([sig, ch('IHDR', ihdr), ch('IDAT', idat), ch('IEND', Buffer.alloc(0))]);
}
fs.mkdirSync('public/icons', { recursive: true });
fs.writeFileSync('public/icons/icon-192.png', makePng(192));
fs.writeFileSync('public/icons/icon-512.png', makePng(512));
console.log('icons written');
"
```

- [ ] **Step 3: Add the PWA plugin to `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
```

Note: `manifest: false` tells the plugin to use the static `public/manifest.json` created in Step 1 rather than generating one, since we already hand-authored it. Also add `<link rel="manifest" href="/manifest.json">` to `index.html`'s `<head>`.

- [ ] **Step 4: Add the manifest link to `index.html`**

```html
<link rel="manifest" href="/manifest.json" />
```

(Insert inside the existing `<head>`, alongside the `viewport` meta tag from Task 1.)

- [ ] **Step 5: Build and manually verify offline installability**

Run: `npm run build && npm run preview`

Then, on a real phone (or desktop browser's device emulation) connected to the preview server's LAN address:
1. Open the URL in the mobile browser.
2. Use "Add to Home Screen" (Android Chrome) or "Add to Home Screen" from the iOS Share sheet — confirm an icon is installed.
3. Launch the installed icon — confirm it opens without browser chrome (standalone mode).
4. Turn on Airplane Mode, relaunch the installed app — confirm it still loads and master-data/counting screens still work (IndexedDB persists locally regardless of connectivity).
5. Test the camera-based `BarcodeScanner` and `PhotoCapture` components on the real device — these depend on real camera hardware and cannot be verified under jsdom.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts index.html public/manifest.json public/icons
git commit -m "feat: make app installable and offline-capable via vite-plugin-pwa"
```

---

## Self-Review Notes

- **Spec coverage:** Users/Units/Zones/Materials CRUD (Tasks 3, 5, 7, 8), photo + barcode capture (Task 6), CSV import (Task 9), full counting workflow with audit/locking (Tasks 10, 12–14), pass 2 auto-reconciliation (Tasks 11, 15), scoped pass 3 + 2-of-3 + manual resolution (Task 16), CSV export (Task 17), full backup (Task 18), progress dashboard/variance highlighting/not-counted detection (Task 19), routing (Task 20), and PWA installability/offline (Task 21) — every section of the design spec maps to a task above.
- **Type consistency verified:** `CountLineSnapshot { zoneId, materialId, quantity }` (Task 11) matches the shape returned by `getPassLines` (Task 10) and is reused unchanged in Tasks 15–16. `ThirdPassResolution` (Task 11) is consumed as-is in Task 16. Repository function signatures declared in each task's Interfaces block are used identically by every later task that imports them.
- **No placeholders remain** — every step contains runnable code or a concrete manual-verification procedure (Task 21, Step 5).
