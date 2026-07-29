import { db } from '../schema'
import { newId } from '../id'
import type { PhotoBlob } from '../types'

// Internal representation for storage: Blob as ArrayBuffer
interface PhotoBlobInternal {
  id: string
  blob: ArrayBuffer
  createdAt: number
  mimeType?: string
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
}

export async function savePhoto(blob: Blob): Promise<string> {
  const photoId = newId()
  const arrayBuffer = await blobToArrayBuffer(blob)
  const photo: PhotoBlobInternal = {
    id: photoId,
    blob: arrayBuffer,
    createdAt: Date.now(),
    mimeType: blob.type,
  }
  await db.photos.add(photo as any)
  return photoId
}

export async function getPhoto(photoId: string): Promise<PhotoBlob | undefined> {
  const stored = await db.photos.get(photoId)
  if (!stored) return undefined

  const photoInternal = stored as unknown as PhotoBlobInternal
  // Reconstruct Blob from ArrayBuffer
  const blob = new Blob([photoInternal.blob], { type: photoInternal.mimeType })
  return {
    id: photoInternal.id,
    blob,
    createdAt: photoInternal.createdAt,
  }
}
