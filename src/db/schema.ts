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
