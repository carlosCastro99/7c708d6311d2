import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { startInventory, getOrOpenZoneCount, setCountLine } from './inventoryRepository'
import { setExpectedQuantity } from './expectedQuantityRepository'
import {
  createMaterial, listMaterials, findMaterialByBarcode, updateMaterial, deleteMaterial, isMaterialInUse,
  getMaterialUsage, deleteMaterialCascade,
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

  it('reports which inventories and expected-quantity entries reference a material', async () => {
    const material = await createMaterial({ name: 'Kraft Paper', unitId: 'unit-kg' })
    const { inventory, pass } = await startInventory('Inv A', 'user-1')
    const zc = await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')
    await setCountLine(zc.id, material.id, 5, 'user-1')
    await setExpectedQuantity('zone-1', material.id, 10)

    const usage = await getMaterialUsage(material.id)
    expect(usage.inventories).toEqual([{ id: inventory.id, name: 'Inv A' }])
    expect(usage.expectedQuantityCount).toBe(1)
  })

  it('cascade-deletes every referencing inventory and expected quantity, then the material', async () => {
    const material = await createMaterial({ name: 'Kraft Paper', unitId: 'unit-kg' })
    const { inventory: invA, pass: passA } = await startInventory('Inv A', 'user-1')
    const zcA = await getOrOpenZoneCount(passA.id, 'zone-1', 'user-1')
    await setCountLine(zcA.id, material.id, 5, 'user-1')

    const { inventory: invB, pass: passB } = await startInventory('Inv B', 'user-1')
    const zcB = await getOrOpenZoneCount(passB.id, 'zone-2', 'user-1')
    await setCountLine(zcB.id, material.id, 7, 'user-1')

    await setExpectedQuantity('zone-1', material.id, 10)

    await deleteMaterialCascade(material.id)

    expect(await db.materials.get(material.id)).toBeUndefined()
    expect(await db.inventories.get(invA.id)).toBeUndefined()
    expect(await db.inventories.get(invB.id)).toBeUndefined()
    expect(await db.expectedQuantities.where('materialId').equals(material.id).count()).toBe(0)
  })
})
