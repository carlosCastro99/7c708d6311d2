import { db } from '../schema'
import { newId } from '../id'
import type { Inventory, InventoryPass, ZoneCount, MaterialCountLine, InventoryStatus } from '../types'

export async function startInventory(
  name: string,
  userId: string,
): Promise<{ inventory: Inventory; pass: InventoryPass }> {
  const inventory: Inventory = {
    id: newId(),
    name,
    status: 'in_progress',
    createdByUserId: userId,
    createdAt: Date.now(),
  }
  const pass: InventoryPass = {
    id: newId(),
    inventoryId: inventory.id,
    passNumber: 1,
    status: 'in_progress',
  }
  await db.inventories.add(inventory)
  await db.passes.add(pass)
  return { inventory, pass }
}

export async function getOrOpenZoneCount(passId: string, zoneId: string, userId: string): Promise<ZoneCount> {
  const existing = await db.zoneCounts.where({ passId, zoneId }).first()
  if (existing) return existing

  const pass = await db.passes.get(passId)
  if (!pass) throw new Error('Pass not found')
  if (pass.status === 'closed') throw new Error('Cannot open a zone count under a closed pass')

  const zoneCount: ZoneCount = {
    id: newId(),
    passId,
    zoneId,
    status: 'open',
    openedByUserId: userId,
    openedAt: Date.now(),
  }
  await db.zoneCounts.add(zoneCount)
  return zoneCount
}

export async function setCountLine(
  zoneCountId: string,
  materialId: string,
  quantity: number,
  userId: string,
  expectedQuantity?: number,
  photoBlobId?: string,
): Promise<MaterialCountLine> {
  return db.transaction('rw', db.zoneCounts, db.countLines, db.auditEntries, async () => {
    const zoneCount = await db.zoneCounts.get(zoneCountId)
    if (!zoneCount) throw new Error('Zone count not found')
    if (zoneCount.status === 'closed') throw new Error('Cannot edit a closed zone count')

    const existing = await db.countLines.where({ zoneCountId, materialId }).first()
    const now = Date.now()

    if (existing) {
      await db.auditEntries.add({
        id: newId(),
        materialCountLineId: existing.id,
        userId,
        timestamp: now,
        oldValue: existing.quantity,
        newValue: quantity,
      })
      const updated: MaterialCountLine = {
        ...existing,
        quantity,
        updatedByUserId: userId,
        updatedAt: now,
        photoBlobId: photoBlobId ?? existing.photoBlobId,
        expectedQuantity: expectedQuantity ?? existing.expectedQuantity,
      }
      await db.countLines.put(updated)
      return updated
    }

    const line: MaterialCountLine = {
      id: newId(),
      zoneCountId,
      materialId,
      quantity,
      expectedQuantity,
      photoBlobId,
      updatedByUserId: userId,
      updatedAt: now,
    }
    await db.countLines.add(line)
    await db.auditEntries.add({
      id: newId(),
      materialCountLineId: line.id,
      userId,
      timestamp: now,
      oldValue: 0,
      newValue: quantity,
    })
    return line
  })
}

export async function closeZoneCount(zoneCountId: string, userId: string): Promise<void> {
  const zoneCount = await db.zoneCounts.get(zoneCountId)
  if (!zoneCount) throw new Error('Zone count not found')
  await db.zoneCounts.put({ ...zoneCount, status: 'closed', closedByUserId: userId, closedAt: Date.now() })
}

export async function closePass(passId: string, userId: string): Promise<void> {
  const pass = await db.passes.get(passId)
  if (!pass) throw new Error('Pass not found')

  const zoneCounts = await db.zoneCounts.where('passId').equals(passId).toArray()
  if (zoneCounts.some((zc) => zc.status !== 'closed')) {
    throw new Error('Cannot close pass: open zone counts remain')
  }

  await db.passes.put({ ...pass, status: 'closed' })
}

export async function startNextPass(inventoryId: string, passNumber: 2 | 3): Promise<InventoryPass> {
  const pass: InventoryPass = { id: newId(), inventoryId, passNumber, status: 'in_progress' }
  await db.passes.add(pass)
  return pass
}

export async function closeInventory(
  inventoryId: string,
  status: Extract<InventoryStatus, 'closed_single_pass' | 'successful'>,
): Promise<void> {
  const inventory = await db.inventories.get(inventoryId)
  if (!inventory) throw new Error('Inventory not found')

  const passes = await db.passes.where('inventoryId').equals(inventoryId).toArray()
  if (passes.some((p) => p.status !== 'closed')) {
    throw new Error('Cannot close inventory: open passes remain')
  }

  await db.inventories.put({ ...inventory, status, closedAt: Date.now() })
}

export async function reopenTarget(
  targetType: 'zoneCount' | 'pass' | 'inventory',
  targetId: string,
  userId: string,
  reason: string,
): Promise<void> {
  await db.reopenLogs.add({ id: newId(), targetType, targetId, userId, timestamp: Date.now(), reason })

  if (targetType === 'zoneCount') {
    const zc = await db.zoneCounts.get(targetId)
    if (zc) await db.zoneCounts.put({ ...zc, status: 'open', closedByUserId: undefined, closedAt: undefined })
  } else if (targetType === 'pass') {
    const pass = await db.passes.get(targetId)
    if (pass) await db.passes.put({ ...pass, status: 'in_progress' })
  } else {
    const inv = await db.inventories.get(targetId)
    if (inv) await db.inventories.put({ ...inv, status: 'in_progress', closedAt: undefined })
  }
}

export async function getPassLines(
  passId: string,
): Promise<Array<{ zoneId: string; materialId: string; quantity: number; zoneCountId: string; lineId: string }>> {
  const zoneCounts = await db.zoneCounts.where('passId').equals(passId).toArray()
  const result: Array<{ zoneId: string; materialId: string; quantity: number; zoneCountId: string; lineId: string }> = []

  for (const zc of zoneCounts) {
    const lines = await db.countLines.where('zoneCountId').equals(zc.id).toArray()
    for (const line of lines) {
      result.push({ zoneId: zc.zoneId, materialId: line.materialId, quantity: line.quantity, zoneCountId: zc.id, lineId: line.id })
    }
  }

  return result
}
