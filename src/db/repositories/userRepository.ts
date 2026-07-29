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
