import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { createMaterial, listMaterials, findMaterialByBarcode } from './materialRepository'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('materialRepository', () => {
  it('creates materials and finds one by barcode', async () => {
    await createMaterial({ name: 'Kraft Paper Roll', unitId: 'unit-roll' })
    await createMaterial({ name: 'Recycled Pulp', unitId: 'unit-kg', barcodeValue: 'MAT-PULP', sapMaterialNumber: 'SAP001' })

    const materials = await listMaterials()
    expect(materials.map((m) => m.name).sort()).toEqual(['Kraft Paper Roll', 'Recycled Pulp'])

    const found = await findMaterialByBarcode('MAT-PULP')
    expect(found?.sapMaterialNumber).toBe('SAP001')
  })
})
