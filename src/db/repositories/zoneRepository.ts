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
