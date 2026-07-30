import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { setExpectedQuantity, getExpectedQuantity, listExpectedPairs } from './expectedQuantityRepository'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('expectedQuantityRepository', () => {
  it('sets and gets an expected quantity for a zone+material pair', async () => {
    await setExpectedQuantity('zone-1', 'material-1', 150)
    expect(await getExpectedQuantity('zone-1', 'material-1')).toBe(150)
    expect(await getExpectedQuantity('zone-1', 'material-2')).toBeUndefined()
  })

  it('upserts rather than duplicating on a second call for the same pair', async () => {
    await setExpectedQuantity('zone-1', 'material-1', 150)
    await setExpectedQuantity('zone-1', 'material-1', 200)
    expect(await getExpectedQuantity('zone-1', 'material-1')).toBe(200)
    expect(await db.expectedQuantities.count()).toBe(1)
  })

  it('lists every zone+material pair with an expected quantity', async () => {
    await setExpectedQuantity('zone-1', 'material-1', 150)
    await setExpectedQuantity('zone-2', 'material-2', 50)
    const pairs = await listExpectedPairs()
    expect(pairs.sort((a, b) => a.zoneId.localeCompare(b.zoneId))).toEqual([
      { zoneId: 'zone-1', materialId: 'material-1' },
      { zoneId: 'zone-2', materialId: 'material-2' },
    ])
  })
})
