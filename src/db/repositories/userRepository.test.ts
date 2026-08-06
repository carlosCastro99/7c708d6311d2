import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { startInventory } from './inventoryRepository'
import { createUser, listUsers, updateUser, deleteUser, isUserInUse } from './userRepository'

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

  it('updates a user', async () => {
    const user = await createUser('Alex')
    const updated = await updateUser(user.id, 'Alexandra')
    expect(updated.name).toBe('Alexandra')
  })

  it('deletes a user that is not in use', async () => {
    const user = await createUser('Alex')
    await deleteUser(user.id)
    expect(await db.users.get(user.id)).toBeUndefined()
  })

  it('refuses to delete a user already involved in an inventory', async () => {
    const user = await createUser('Alex')
    await startInventory('Inv', user.id)

    expect(await isUserInUse(user.id)).toBe(true)
    await expect(deleteUser(user.id)).rejects.toThrow(/in use|already been involved/i)
    expect(await db.users.get(user.id)).toBeDefined()
  })
})
