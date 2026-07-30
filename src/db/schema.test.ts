import { describe, it, expect, afterEach } from 'vitest'
import { db } from './schema'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('MxInventoryDB', () => {
  it('stores and retrieves a user', async () => {
    await db.users.add({ id: '1', name: 'Alex', createdAt: 1 })
    const found = await db.users.get('1')
    expect(found?.name).toBe('Alex')
  })

  it('exposes all expected tables', () => {
    const names = db.tables.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        'auditEntries', 'countLines', 'expectedQuantities', 'inventories', 'materials', 'passes',
        'photos', 'reopenLogs', 'units', 'users', 'zoneCounts', 'zones',
      ].sort(),
    )
  })
})
