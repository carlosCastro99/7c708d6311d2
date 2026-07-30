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
