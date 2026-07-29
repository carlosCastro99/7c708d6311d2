import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import {
  startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount,
  closePass, reopenTarget, getPassLines,
} from './inventoryRepository'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('inventoryRepository', () => {
  it('runs a full zone-count lifecycle with audit logging and locking', async () => {
    const { inventory, pass } = await startInventory('Q3 Paper Warehouse', 'user-1')
    expect(inventory.status).toBe('in_progress')
    expect(pass.passNumber).toBe(1)

    const zoneCount = await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')
    expect(zoneCount.status).toBe('open')

    const line = await setCountLine(zoneCount.id, 'material-1', 5, 'user-1')
    expect(line.quantity).toBe(5)

    await setCountLine(zoneCount.id, 'material-1', 8, 'user-1')
    const audit = await db.auditEntries.where('materialCountLineId').equals(line.id).toArray()
    expect(audit).toHaveLength(2)
    expect(audit[1]).toMatchObject({ oldValue: 5, newValue: 8 })

    await closeZoneCount(zoneCount.id, 'user-1')
    await expect(setCountLine(zoneCount.id, 'material-1', 9, 'user-1')).rejects.toThrow(/closed/i)

    await closePass(pass.id, 'user-1')
    const closedPass = await db.passes.get(pass.id)
    expect(closedPass?.status).toBe('closed')

    const lines = await getPassLines(pass.id)
    expect(lines).toEqual([
      { zoneId: 'zone-1', materialId: 'material-1', quantity: 8, zoneCountId: zoneCount.id, lineId: line.id },
    ])

    await reopenTarget('zoneCount', zoneCount.id, 'user-1', 'miscount noticed')
    const reopened = await db.zoneCounts.get(zoneCount.id)
    expect(reopened?.status).toBe('open')
    const reopenLogs = await db.reopenLogs.where('targetId').equals(zoneCount.id).toArray()
    expect(reopenLogs).toHaveLength(1)
    expect(reopenLogs[0].reason).toBe('miscount noticed')
  })

  it('refuses to close a pass with open zone counts', async () => {
    const { pass } = await startInventory('Q3 Paper Warehouse', 'user-1')
    await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')
    await expect(closePass(pass.id, 'user-1')).rejects.toThrow(/open zone/i)
  })
})
