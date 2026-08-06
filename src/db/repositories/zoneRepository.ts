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

export async function updateZone(id: string, changes: {
  name: string
  sapStorageLocation?: string
  barcodeValue?: string
}): Promise<Zone> {
  const existing = await db.zones.get(id)
  if (!existing) throw new Error('Zone not found')
  const updated: Zone = {
    ...existing,
    name: changes.name,
    sapStorageLocation: changes.sapStorageLocation,
    barcodeValue: changes.barcodeValue,
  }
  await db.zones.put(updated)
  return updated
}

export async function isZoneInUse(id: string): Promise<boolean> {
  const [zoneCountsCount, expectedCount] = await Promise.all([
    db.zoneCounts.where('zoneId').equals(id).count(),
    db.expectedQuantities.where('zoneId').equals(id).count(),
  ])
  return zoneCountsCount > 0 || expectedCount > 0
}

export async function deleteZone(id: string): Promise<void> {
  if (await isZoneInUse(id)) {
    throw new Error('Cannot delete: this zone has already been used in an inventory count')
  }
  await db.zones.delete(id)
}
