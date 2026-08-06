import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { startInventory, getOrOpenZoneCount } from './inventoryRepository'
import { createZone, listZones, findZoneByBarcode, updateZone, deleteZone, isZoneInUse } from './zoneRepository'

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

  it('updates a zone', async () => {
    const zone = await createZone({ name: 'Warehouse A' })
    const updated = await updateZone(zone.id, { name: 'Warehouse A1', sapStorageLocation: 'SL09' })
    expect(updated.name).toBe('Warehouse A1')
    expect(updated.sapStorageLocation).toBe('SL09')
  })

  it('deletes a zone that is not in use', async () => {
    const zone = await createZone({ name: 'Warehouse A' })
    await deleteZone(zone.id)
    expect(await db.zones.get(zone.id)).toBeUndefined()
  })

  it('refuses to delete a zone already used in an inventory count', async () => {
    const zone = await createZone({ name: 'Warehouse A' })
    const { pass } = await startInventory('Inv', 'user-1')
    await getOrOpenZoneCount(pass.id, zone.id, 'user-1')

    expect(await isZoneInUse(zone.id)).toBe(true)
    await expect(deleteZone(zone.id)).rejects.toThrow(/in use|already been used/i)
    expect(await db.zones.get(zone.id)).toBeDefined()
  })
})
