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
