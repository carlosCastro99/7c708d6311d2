import { db } from '../schema'
import { newId } from '../id'
import { deleteInventory } from './inventoryRepository'
import type { Material, Inventory, InventoryPass, ZoneCount } from '../types'

export async function createMaterial(input: {
  name: string
  unitId: string
  sapMaterialNumber?: string
  photoBlobId?: string
  barcodeValue?: string
}): Promise<Material> {
  const material: Material = { id: newId(), active: true, ...input }
  await db.materials.add(material)
  return material
}

export async function listMaterials(): Promise<Material[]> {
  return db.materials.orderBy('name').toArray()
}

export async function findMaterialByBarcode(value: string): Promise<Material | undefined> {
  return db.materials.where('barcodeValue').equals(value).first()
}

export async function updateMaterial(id: string, changes: {
  name: string
  unitId: string
  sapMaterialNumber?: string
  barcodeValue?: string
}): Promise<Material> {
  const existing = await db.materials.get(id)
  if (!existing) throw new Error('Material not found')
  const updated: Material = {
    ...existing,
    name: changes.name,
    unitId: changes.unitId,
    sapMaterialNumber: changes.sapMaterialNumber,
    barcodeValue: changes.barcodeValue,
  }
  await db.materials.put(updated)
  return updated
}

export async function isMaterialInUse(id: string): Promise<boolean> {
  const [countLinesCount, expectedCount] = await Promise.all([
    db.countLines.where('materialId').equals(id).count(),
    db.expectedQuantities.where('materialId').equals(id).count(),
  ])
  return countLinesCount > 0 || expectedCount > 0
}

export async function deleteMaterial(id: string): Promise<void> {
  if (await isMaterialInUse(id)) {
    throw new Error('Cannot delete: this material has already been used in an inventory count')
  }
  await db.materials.delete(id)
}

export interface MaterialUsage {
  inventories: Array<{ id: string; name: string }>
  expectedQuantityCount: number
}

// Walks materialId -> countLines -> zoneCounts -> passes -> inventories to
// find every inventory that has ever counted this material, so a blocked
// delete can tell the user exactly what's in the way (and offer to remove
// it) instead of just refusing.
export async function getMaterialUsage(materialId: string): Promise<MaterialUsage> {
  const countLines = await db.countLines.where('materialId').equals(materialId).toArray()
  const zoneCountIds = [...new Set(countLines.map((l) => l.zoneCountId))]
  const zoneCounts = (await db.zoneCounts.bulkGet(zoneCountIds)).filter((zc): zc is ZoneCount => zc !== undefined)

  const passIds = [...new Set(zoneCounts.map((zc) => zc.passId))]
  const passes = (await db.passes.bulkGet(passIds)).filter((p): p is InventoryPass => p !== undefined)

  const inventoryIds = [...new Set(passes.map((p) => p.inventoryId))]
  const inventories = (await db.inventories.bulkGet(inventoryIds)).filter((inv): inv is Inventory => inv !== undefined)

  const expectedQuantityCount = await db.expectedQuantities.where('materialId').equals(materialId).count()

  return {
    inventories: inventories.map((inv) => ({ id: inv.id, name: inv.name })),
    expectedQuantityCount,
  }
}

// Deletes every inventory that has ever counted this material (via
// deleteInventory's own cascade), plus any expected-quantity entries, then
// the material itself. Used when the user explicitly chooses to clear out
// everything blocking a material delete rather than just being told no.
export async function deleteMaterialCascade(materialId: string): Promise<void> {
  const usage = await getMaterialUsage(materialId)
  for (const inv of usage.inventories) {
    await deleteInventory(inv.id)
  }
  await db.expectedQuantities.where('materialId').equals(materialId).delete()
  await db.materials.delete(materialId)
}
