import { db } from '../schema'
import { newId } from '../id'
import type { PhotoBlob } from '../types'

export async function savePhoto(blob: Blob): Promise<string> {
  const photo: PhotoBlob = { id: newId(), blob, createdAt: Date.now() }
  await db.photos.add(photo)
  return photo.id
}

export async function getPhoto(photoId: string): Promise<PhotoBlob | undefined> {
  return db.photos.get(photoId)
}
