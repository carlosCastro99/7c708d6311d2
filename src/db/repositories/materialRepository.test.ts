import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { startInventory, getOrOpenZoneCount, setCountLine } from './inventoryRepository'
import {
  createMaterial, listMaterials, findMaterialByBarcode, updateMaterial, deleteMaterial, isMaterialInUse,
} from './materialRepository'

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

  it('updates a material', async () => {
    const material = await createMaterial({ name: 'Kraft Paper', unitId: 'unit-kg' })
    const updated = await updateMaterial(material.id, { name: 'Kraft Paper (Grade A)', unitId: 'unit-ton' })
    expect(updated.name).toBe('Kraft Paper (Grade A)')
    expect(updated.unitId).toBe('unit-ton')
  })

  it('deletes a material that is not in use', async () => {
    const material = await createMaterial({ name: 'Kraft Paper', unitId: 'unit-kg' })
    await deleteMaterial(material.id)
    expect(await db.materials.get(material.id)).toBeUndefined()
  })

  it('refuses to delete a material already used in an inventory count', async () => {
    const material = await createMaterial({ name: 'Kraft Paper', unitId: 'unit-kg' })
    const { pass } = await startInventory('Inv', 'user-1')
    const zc = await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')
    await setCountLine(zc.id, material.id, 5, 'user-1')

    expect(await isMaterialInUse(material.id)).toBe(true)
    await expect(deleteMaterial(material.id)).rejects.toThrow(/in use|already been used/i)
    expect(await db.materials.get(material.id)).toBeDefined()
  })
})
