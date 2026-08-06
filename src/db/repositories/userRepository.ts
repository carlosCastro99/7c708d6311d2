import { db } from '../schema'
import { newId } from '../id'
import type { User } from '../types'

export async function createUser(name: string): Promise<User> {
  const user: User = { id: newId(), name, createdAt: Date.now() }
  await db.users.add(user)
  return user
}

export async function listUsers(): Promise<User[]> {
  return db.users.orderBy('name').toArray()
}

export async function updateUser(id: string, name: string): Promise<User> {
  const existing = await db.users.get(id)
  if (!existing) throw new Error('User not found')
  const updated: User = { ...existing, name }
  await db.users.put(updated)
  return updated
}

export async function isUserInUse(id: string): Promise<boolean> {
  const [inventoriesCount, zoneCountsCount, countLinesCount] = await Promise.all([
    db.inventories.filter((inv) => inv.createdByUserId === id).count(),
    db.zoneCounts.filter((zc) => zc.openedByUserId === id || zc.closedByUserId === id).count(),
    db.countLines.filter((l) => l.updatedByUserId === id).count(),
  ])
  return inventoriesCount > 0 || zoneCountsCount > 0 || countLinesCount > 0
}

export async function deleteUser(id: string): Promise<void> {
  if (await isUserInUse(id)) {
    throw new Error('Cannot delete: this user has already been involved in an inventory count')
  }
  await db.users.delete(id)
}
