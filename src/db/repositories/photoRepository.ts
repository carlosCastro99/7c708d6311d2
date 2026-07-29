import { db } from '../schema'
import { newId } from '../id'
import type { PhotoBlob } from '../types'

// Workaround for fake-indexeddb not supporting Blob serialization
// Real browsers with native IndexedDB handle Blobs correctly; this conversion
// only runs in test environments using fake-indexeddb
async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
}

function arrayBufferToBlob(buffer: ArrayBuffer, mimeType: string): Blob {
  return new Blob([buffer], { type: mimeType })
}

export async function savePhoto(blob: Blob): Promise<string> {
  const photoId = newId()

  // Check if Blob storage is working by attempting to store and retrieve test object
  const testPhoto = { id: 'test', blob: new Blob(['test'], { type: 'test/plain' }), createdAt: Date.now() }
  await db.photos.add(testPhoto as any)
  const testRetrieved = await db.photos.get('test')
  await db.photos.delete('test')

  // If blob comes back as empty object, use ArrayBuffer workaround
  const needsWorkaround = testRetrieved && typeof testRetrieved.blob === 'object' && testRetrieved.blob.size === undefined

  if (needsWorkaround) {
    // fake-indexeddb workaround: convert Blob to ArrayBuffer
    const arrayBuffer = await blobToArrayBuffer(blob)
    await db.photos.add({
      id: photoId,
      blob: arrayBuffer as any,
      createdAt: Date.now(),
      _mimeType: blob.type,
    } as any)
  } else {
    // Native IndexedDB or compatible implementation
    const photo: PhotoBlob = { id: photoId, blob, createdAt: Date.now() }
    await db.photos.add(photo as any)
  }

  return photoId
}

export async function getPhoto(photoId: string): Promise<PhotoBlob | undefined> {
  const stored = await db.photos.get(photoId)
  if (!stored) return undefined

  const stored_any = stored as any

  // Check if this is an ArrayBuffer workaround (has _mimeType)
  if ('_mimeType' in stored_any) {
    // Reconstruct Blob from ArrayBuffer
    const blob = arrayBufferToBlob(stored_any.blob, stored_any._mimeType)
    return {
      id: stored_any.id,
      blob,
      createdAt: stored_any.createdAt,
    }
  }

  // Native Blob storage
  return stored as any as PhotoBlob
}
