import { db } from '../schema'
import { newId } from '../id'
import type { Material } from '../types'

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
