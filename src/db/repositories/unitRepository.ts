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

export async function updateUnit(id: string, changes: { code: string; label: string }): Promise<UnitOfMeasure> {
  const existing = await db.units.get(id)
  if (!existing) throw new Error('Unit not found')
  const updated: UnitOfMeasure = { ...existing, code: changes.code, label: changes.label }
  await db.units.put(updated)
  return updated
}

export async function isUnitInUse(id: string): Promise<boolean> {
  const count = await db.materials.filter((m) => m.unitId === id).count()
  return count > 0
}

export async function deleteUnit(id: string): Promise<void> {
  if (await isUnitInUse(id)) {
    throw new Error('Cannot delete: this unit is used by one or more materials')
  }
  await db.units.delete(id)
}

// The most commonly used units of measure in a kraft/craft paper warehouse
// (rolls and bales of paper/pulp, sold and stored by weight or unit count).
const DEFAULT_UNITS: Array<{ code: string; label: string }> = [
  { code: 'KG', label: 'Kilogram' },
  { code: 'TON', label: 'Metric Ton' },
  { code: 'ROLL', label: 'Roll' },
  { code: 'PALLET', label: 'Pallet' },
  { code: 'BALE', label: 'Bale' },
]

// Only seeds when the units table is completely empty, so it never overwrites
// or duplicates units the user has already created or edited.
export async function seedDefaultUnitsIfEmpty(): Promise<void> {
  const existingCount = await db.units.count()
  if (existingCount > 0) return
  for (const { code, label } of DEFAULT_UNITS) {
    await createUnit(code, label)
  }
}
