import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { createUser, listUsers } from './userRepository'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('userRepository', () => {
  it('creates and lists users alphabetically', async () => {
    await createUser('Bea')
    await createUser('Alex')
    const users = await listUsers()
    expect(users.map((u) => u.name)).toEqual(['Alex', 'Bea'])
  })
})
