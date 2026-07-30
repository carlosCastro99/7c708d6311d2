import JSZip from 'jszip'
import { db } from '../db/schema'

const DATA_TABLES = [
  'users', 'units', 'materials', 'zones', 'inventories', 'passes',
  'zoneCounts', 'countLines', 'auditEntries', 'reopenLogs',
] as const

export async function exportBackup(): Promise<Blob> {
  const zip = new JSZip()

  const data: Record<string, unknown[]> = {}
  for (const tableName of DATA_TABLES) {
    data[tableName] = await db.table(tableName).toArray()
  }

  const photos = await db.photos.toArray()
  data.photoIds = photos.map((p) => p.id)

  zip.file('data.json', JSON.stringify(data))
  const photosFolder = zip.folder('photos')!
  for (const photo of photos) {
    // Hand JSZip a Uint8Array, never the Blob itself: JSZip's Blob handling
    // goes through the browser FileReader API internally, which does its own
    // WebIDL type check independent of `globalThis.Blob` — so a Blob that is
    // valid for IndexedDB storage can still be rejected there. Uint8Array has
    // no such check and works identically in tests and real browsers.
    const bytes = new Uint8Array(await photo.blob.arrayBuffer())
    photosFolder.file(`${photo.id}.bin`, bytes)
  }

  return zip.generateAsync({ type: 'blob' })
}

export async function importBackup(zipBlob: Blob): Promise<void> {
  // Same reasoning as the export side: hand JSZip a Uint8Array, not the Blob
  // itself, to avoid JSZip's internal FileReader-based Blob handling.
  const zipBytes = new Uint8Array(await zipBlob.arrayBuffer())
  const zip = await JSZip.loadAsync(zipBytes)
  const dataFile = zip.file('data.json')
  if (!dataFile) throw new Error('Invalid backup: missing data.json')

  const data = JSON.parse(await dataFile.async('string')) as Record<string, unknown[]> & { photoIds: string[] }

  for (const tableName of DATA_TABLES) {
    const rows = (data[tableName] ?? []) as Array<Record<string, unknown>>
    if (rows.length > 0) await db.table(tableName).bulkPut(rows)
  }

  for (const photoId of data.photoIds ?? []) {
    const file = zip.file(`photos/${photoId}.bin`)
    if (!file) continue
    const bytes = await file.async('uint8array')
    const blob = new Blob([new Uint8Array(bytes)])
    await db.photos.put({ id: photoId, blob, createdAt: Date.now() })
  }
}
