import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { createMaterial } from './materialRepository'
import { createUnit, listUnits, updateUnit, deleteUnit, isUnitInUse, seedDefaultUnitsIfEmpty } from './unitRepository'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('unitRepository', () => {
  it('creates and lists units', async () => {
    await createUnit('KG', 'Kilogram')
    await createUnit('EA', 'Each')
    const units = await listUnits()
    expect(units.map((u) => u.code)).toEqual(['EA', 'KG'])
  })

  it('updates a unit', async () => {
    const unit = await createUnit('KG', 'Kilogram')
    const updated = await updateUnit(unit.id, { code: 'KGM', label: 'Kilograms' })
    expect(updated.code).toBe('KGM')
    expect(updated.label).toBe('Kilograms')
    expect((await db.units.get(unit.id))?.code).toBe('KGM')
  })

  it('deletes a unit that is not in use', async () => {
    const unit = await createUnit('KG', 'Kilogram')
    await deleteUnit(unit.id)
    expect(await db.units.get(unit.id)).toBeUndefined()
  })

  it('refuses to delete a unit used by a material', async () => {
    const unit = await createUnit('KG', 'Kilogram')
    await createMaterial({ name: 'Kraft Paper', unitId: unit.id })

    expect(await isUnitInUse(unit.id)).toBe(true)
    await expect(deleteUnit(unit.id)).rejects.toThrow(/in use|used by/i)
    expect(await db.units.get(unit.id)).toBeDefined()
  })

  it('seeds common kraft paper warehouse units when the table is empty', async () => {
    await seedDefaultUnitsIfEmpty()
    const units = await listUnits()
    expect(units.map((u) => u.code)).toEqual(expect.arrayContaining(['KG', 'TON', 'ROLL', 'PALLET', 'BALE']))
  })

  it('does not seed or duplicate units when the table already has data', async () => {
    await createUnit('EA', 'Each')
    await seedDefaultUnitsIfEmpty()
    const units = await listUnits()
    expect(units.map((u) => u.code)).toEqual(['EA'])
  })
})
