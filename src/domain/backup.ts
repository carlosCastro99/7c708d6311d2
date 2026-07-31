import JSZip from 'jszip'
import { db } from '../db/schema'

const DATA_TABLES = [
  'users', 'units', 'materials', 'zones', 'inventories', 'passes',
  'zoneCounts', 'countLines', 'auditEntries', 'reopenLogs', 'expectedQuantities',
] as const

const FORMAT_VERSION = 1

export async function exportBackup(): Promise<Blob> {
  const zip = new JSZip()

  const data: Record<string, unknown> = {}
  for (const tableName of DATA_TABLES) {
    data[tableName] = await db.table(tableName).toArray()
  }

  const photos = await db.photos.toArray()
  data.photoMeta = photos.map((p) => ({ id: p.id, type: p.blob.type, createdAt: p.createdAt }))
  data.formatVersion = FORMAT_VERSION

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

  const data = JSON.parse(await dataFile.async('string')) as Record<string, unknown[]> & {
    photoMeta?: Array<{ id: string; type: string; createdAt: number }>
    photoIds?: string[]
    formatVersion?: number
  }

  for (const tableName of DATA_TABLES) {
    const rows = (data[tableName] ?? []) as Array<Record<string, unknown>>
    if (rows.length > 0) await db.table(tableName).bulkPut(rows)
  }

  // photoMeta is the current format; photoIds is kept as a fallback so a
  // backup produced by an older version of this app can still restore its
  // photos (just without the original MIME type/timestamp).
  const photoMeta = data.photoMeta ?? (data.photoIds ?? []).map((id) => ({ id, type: '', createdAt: Date.now() }))

  for (const meta of photoMeta) {
    const file = zip.file(`photos/${meta.id}.bin`)
    if (!file) continue
    const bytes = await file.async('uint8array')
    const blob = new Blob([new Uint8Array(bytes)], meta.type ? { type: meta.type } : undefined)
    await db.photos.put({ id: meta.id, blob, createdAt: meta.createdAt })
  }
}

export async function clearAllData(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()))
}
