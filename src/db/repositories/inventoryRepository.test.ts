import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { comparePasses, resolveThirdPass } from '../../domain/reconciliation'
import {
  startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount,
  closePass, closeInventory, reopenTarget, getPassLines, startNextPass,
  closeInventoryAfterReconciliation,
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

  it('stores an optional lot/batch number on a count line', async () => {
    const { pass } = await startInventory('Q3 Paper Warehouse', 'user-1')
    const zoneCount = await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')

    const line = await setCountLine(zoneCount.id, 'material-1', 5, 'user-1', undefined, undefined, 'LOT-2024-88')
    expect(line.lotNumber).toBe('LOT-2024-88')

    const stored = await db.countLines.get(line.id)
    expect(stored?.lotNumber).toBe('LOT-2024-88')

    const updated = await setCountLine(zoneCount.id, 'material-1', 6, 'user-1', undefined, undefined, 'LOT-2024-99')
    expect(updated.lotNumber).toBe('LOT-2024-99')
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

describe('setCountLine rejects edits under a closed pass', () => {
  it('throws even if the zone count itself was reopened while the pass stays closed', async () => {
    const { inventory, pass } = await startInventory('Inv', 'user-1')
    const zc = await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')
    await setCountLine(zc.id, 'material-1', 5, 'user-1')
    await closeZoneCount(zc.id, 'user-1')
    await closePass(pass.id, 'user-1')

    await reopenTarget('zoneCount', zc.id, 'user-1', 'testing parent-pass guard')
    await expect(setCountLine(zc.id, 'material-1', 9, 'user-1')).rejects.toThrow(/pass/i)
  })
})

describe('closeInventoryAfterReconciliation', () => {
  async function countAndClose(passId: string, zoneId: string, materialId: string, qty: number) {
    const zc = await getOrOpenZoneCount(passId, zoneId, 'user-1')
    await setCountLine(zc.id, materialId, qty, 'user-1')
    await closeZoneCount(zc.id, 'user-1')
  }

  it('refuses to close when a mismatched pair was never recounted in pass 3', async () => {
    const { inventory, pass } = await startInventory('Inv', 'user-1')
    await countAndClose(pass.id, 'zone-1', 'material-1', 10)
    await countAndClose(pass.id, 'zone-2', 'material-2', 10)
    await closePass(pass.id, 'user-1')

    const pass2 = await startNextPass(inventory.id, 2)
    await countAndClose(pass2.id, 'zone-1', 'material-1', 12)
    await countAndClose(pass2.id, 'zone-2', 'material-2', 20)
    await closePass(pass2.id, 'user-1')

    const pass3 = await startNextPass(inventory.id, 3)
    // Only zone-1/material-1 gets recounted; zone-2/material-2 is left out.
    await countAndClose(pass3.id, 'zone-1', 'material-1', 12)

    await expect(
      closeInventoryAfterReconciliation(inventory.id, pass.id, pass2.id, pass3.id, 'user-1'),
    ).rejects.toThrow(/zone-2.*material-2|material-2.*zone-2/i)

    const updated = await db.inventories.get(inventory.id)
    expect(updated?.status).toBe('in_progress')
  })

  it('closes pass 3 and the inventory as successful once every mismatched pair is covered', async () => {
    const { inventory, pass } = await startInventory('Inv', 'user-1')
    await countAndClose(pass.id, 'zone-1', 'material-1', 10)
    await closePass(pass.id, 'user-1')

    const pass2 = await startNextPass(inventory.id, 2)
    await countAndClose(pass2.id, 'zone-1', 'material-1', 12)
    await closePass(pass2.id, 'user-1')

    const pass3 = await startNextPass(inventory.id, 3)
    await countAndClose(pass3.id, 'zone-1', 'material-1', 12)

    await closeInventoryAfterReconciliation(inventory.id, pass.id, pass2.id, pass3.id, 'user-1')

    const updatedInventory = await db.inventories.get(inventory.id)
    expect(updatedInventory?.status).toBe('successful')
    const updatedPass3 = await db.passes.get(pass3.id)
    expect(updatedPass3?.status).toBe('closed')
  })
})

describe('full pass1 -> pass2 -> mismatch -> pass3 -> resolve lifecycle', () => {
  async function countAndClose(passId: string, zoneId: string, materialId: string, qty: number) {
    const zc = await getOrOpenZoneCount(passId, zoneId, 'user-1')
    await setCountLine(zc.id, materialId, qty, 'user-1')
    await closeZoneCount(zc.id, 'user-1')
  }

  it('drives a real inventory through matched and mismatched lines to a correct final state', async () => {
    const { inventory, pass } = await startInventory('Lifecycle Inv', 'user-1')

    // zone-1/material-1 will match across pass 1 and 2 (no third-pass involvement).
    // zone-2/material-2 will mismatch and resolve via 2-of-3 (pass3 matches pass2).
    // zone-3/material-3 will mismatch and require manual resolution (all three differ).
    await countAndClose(pass.id, 'zone-1', 'material-1', 10)
    await countAndClose(pass.id, 'zone-2', 'material-2', 20)
    await countAndClose(pass.id, 'zone-3', 'material-3', 30)
    await closePass(pass.id, 'user-1')

    const pass2 = await startNextPass(inventory.id, 2)
    await countAndClose(pass2.id, 'zone-1', 'material-1', 10)
    await countAndClose(pass2.id, 'zone-2', 'material-2', 22)
    await countAndClose(pass2.id, 'zone-3', 'material-3', 33)
    await closePass(pass2.id, 'user-1')

    const pass1Lines = await getPassLines(pass.id)
    const pass2Lines = await getPassLines(pass2.id)
    const { matched, mismatched } = comparePasses(pass1Lines, pass2Lines)
    expect(matched).toHaveLength(1)
    expect(mismatched).toHaveLength(2)

    const pass3 = await startNextPass(inventory.id, 3)
    // Recount only the mismatched pairs, per the app's scoped third-pass rule.
    await countAndClose(pass3.id, 'zone-2', 'material-2', 22) // matches pass 2
    await countAndClose(pass3.id, 'zone-3', 'material-3', 36) // matches neither -> manual

    const pass3Lines = await getPassLines(pass3.id)
    const resolutions = resolveThirdPass(pass1Lines, pass2Lines, pass3Lines)
    expect(resolutions).toHaveLength(2)
    expect(resolutions.find((r) => r.zoneId === 'zone-2')?.resolution).toBe('pass3_matches_pass2')
    expect(resolutions.find((r) => r.zoneId === 'zone-3')?.resolution).toBe('needs_manual_resolution')

    // The manual line gets a supervisor-entered final value before closing.
    const zc3 = await getOrOpenZoneCount(pass3.id, 'zone-3', 'user-1')
    await reopenTarget('zoneCount', zc3.id, 'user-1', 'supervisor agreed final count')
    await setCountLine(zc3.id, 'material-3', 35, 'user-1')
    await closeZoneCount(zc3.id, 'user-1')

    await closeInventoryAfterReconciliation(inventory.id, pass.id, pass2.id, pass3.id, 'user-1')

    const finalInventory = await db.inventories.get(inventory.id)
    expect(finalInventory?.status).toBe('successful')

    const finalZone3Line = await db.countLines.where({ zoneCountId: zc3.id, materialId: 'material-3' }).first()
    expect(finalZone3Line?.quantity).toBe(35)
  })
})
