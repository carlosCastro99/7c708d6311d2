import { describe, it, expect, afterEach } from 'vitest'
import { db } from '../schema'
import { savePhoto, getPhoto } from './photoRepository'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('photoRepository', () => {
  it('saves and retrieves a photo blob', async () => {
    const blob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' })
    const id = await savePhoto(blob)
    const stored = await getPhoto(id)
    expect(stored?.blob.size).toBe(blob.size)
  })
})
