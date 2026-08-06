import { db } from '../schema'
import { newId } from '../id'
import type { Inventory, InventoryPass, ZoneCount, MaterialCountLine, InventoryStatus } from '../types'
import { comparePasses } from '../../domain/reconciliation'

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
  lotNumber?: string,
): Promise<MaterialCountLine> {
  return db.transaction('rw', db.zoneCounts, db.countLines, db.auditEntries, db.passes, async () => {
    const zoneCount = await db.zoneCounts.get(zoneCountId)
    if (!zoneCount) throw new Error('Zone count not found')
    if (zoneCount.status === 'closed') throw new Error('Cannot edit a closed zone count')

    const parentPass = await db.passes.get(zoneCount.passId)
    if (parentPass?.status === 'closed') throw new Error('Cannot edit a count line under a closed pass')

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
        lotNumber: lotNumber ?? existing.lotNumber,
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
      lotNumber,
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
  status: Extract<InventoryStatus, 'closed_single_pass' | 'successful' | 'needs_3rd_pass'>,
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

export async function deleteInventory(inventoryId: string): Promise<void> {
  return db.transaction(
    'rw', [db.inventories, db.passes, db.zoneCounts, db.countLines, db.auditEntries, db.reopenLogs],
    async () => {
      const passes = await db.passes.where('inventoryId').equals(inventoryId).toArray()
      const passIds = passes.map((p) => p.id)

      const zoneCounts = passIds.length > 0 ? await db.zoneCounts.where('passId').anyOf(passIds).toArray() : []
      const zoneCountIds = zoneCounts.map((zc) => zc.id)

      const countLines = zoneCountIds.length > 0
        ? await db.countLines.where('zoneCountId').anyOf(zoneCountIds).toArray()
        : []
      const countLineIds = countLines.map((l) => l.id)

      if (countLineIds.length > 0) await db.auditEntries.where('materialCountLineId').anyOf(countLineIds).delete()
      if (zoneCountIds.length > 0) await db.countLines.where('zoneCountId').anyOf(zoneCountIds).delete()
      if (zoneCountIds.length > 0) await db.zoneCounts.where('passId').anyOf(passIds).delete()
      await db.passes.where('inventoryId').equals(inventoryId).delete()

      const reopenTargetIds = [inventoryId, ...passIds, ...zoneCountIds]
      await db.reopenLogs.where('targetId').anyOf(reopenTargetIds).delete()

      await db.inventories.delete(inventoryId)
    },
  )
}

export async function closeInventoryAfterReconciliation(
  inventoryId: string,
  pass1Id: string,
  pass2Id: string,
  pass3Id: string,
  userId: string,
): Promise<void> {
  const pass1Lines = await getPassLines(pass1Id)
  const pass2Lines = await getPassLines(pass2Id)
  const pass3Lines = await getPassLines(pass3Id)

  const { mismatched } = comparePasses(pass1Lines, pass2Lines)
  const pass3Keys = new Set(pass3Lines.map((l) => `${l.zoneId}::${l.materialId}`))
  const missing = mismatched.filter((m) => !pass3Keys.has(`${m.zoneId}::${m.materialId}`))

  if (missing.length > 0) {
    const pairList = missing.map((m) => `${m.zoneId}::${m.materialId}`).join(', ')
    throw new Error(`Cannot close inventory: these pairs still need a third-pass recount: ${pairList}`)
  }

  await closePass(pass3Id, userId)
  await closeInventory(inventoryId, 'successful')
}
