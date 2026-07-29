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
