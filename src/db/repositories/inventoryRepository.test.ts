import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import {
  startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount,
  closePass, closeInventory, reopenTarget, getPassLines,
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

  it('refuses to open a zone count under a closed pass', async () => {
    const { pass } = await startInventory('Q3 Paper Warehouse', 'user-1')
    await closePass(pass.id, 'user-1')
    await expect(getOrOpenZoneCount(pass.id, 'zone-x', 'user-1')).rejects.toThrow()
  })

  it('refuses to close an inventory with an open pass', async () => {
    const { inventory } = await startInventory('Q3 Paper Warehouse', 'user-1')
    await expect(closeInventory(inventory.id, 'closed_single_pass')).rejects.toThrow()
  })

  it('preserves expectedQuantity correctly across an update', async () => {
    const { pass } = await startInventory('Q3 Paper Warehouse', 'user-1')
    const zoneCount = await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')

    await setCountLine(zoneCount.id, 'material-1', 5, 'user-1', 100)
    const updated = await setCountLine(zoneCount.id, 'material-1', 6, 'user-1', 120)

    expect(updated.expectedQuantity).toBe(120)
  })

  it('does not create duplicate count lines under concurrent writes', async () => {
    const { pass } = await startInventory('Q3 Paper Warehouse', 'user-1')
    const zoneCount = await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')

    await Promise.all([
      setCountLine(zoneCount.id, 'material-1', 5, 'user-1'),
      setCountLine(zoneCount.id, 'material-1', 7, 'user-1'),
    ])

    const lines = await db.countLines.where({ zoneCountId: zoneCount.id, materialId: 'material-1' }).toArray()
    expect(lines).toHaveLength(1)
  })
})
