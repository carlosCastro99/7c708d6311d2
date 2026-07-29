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
