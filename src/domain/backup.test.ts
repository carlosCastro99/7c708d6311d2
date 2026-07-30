import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../db/schema'
import { createUser } from '../db/repositories/userRepository'
import { createZone } from '../db/repositories/zoneRepository'
import { savePhoto } from '../db/repositories/photoRepository'
import { exportBackup, importBackup } from './backup'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('backup', () => {
  it('exports and re-imports all data including photo blobs', async () => {
    await createUser('Alex')
    await createZone({ name: 'Warehouse A' })
    const photoId = await savePhoto(new Blob(['fake-bytes'], { type: 'image/jpeg' }))

    const zip = await exportBackup()

    await Promise.all(db.tables.map((t) => t.clear()))
    expect(await db.users.count()).toBe(0)

    await importBackup(zip)

    const users = await db.users.toArray()
    const zones = await db.zones.toArray()
    const photo = await db.photos.get(photoId)

    expect(users.map((u) => u.name)).toEqual(['Alex'])
    expect(zones.map((z) => z.name)).toEqual(['Warehouse A'])
    expect(photo?.blob.size).toBeGreaterThan(0)
    expect(await photo?.blob.text()).toBe('fake-bytes')
  })
})
