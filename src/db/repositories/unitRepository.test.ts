import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { createUnit, listUnits } from './unitRepository'

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
})
