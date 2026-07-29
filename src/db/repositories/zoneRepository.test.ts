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
