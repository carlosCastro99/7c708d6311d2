let lastTimestamp = 0
let sequence = 0

// Time-sortable unique id: a fixed-width, zero-padded base36 timestamp
// (so lexicographic string order matches creation order) followed by a
// per-millisecond sequence counter (to break ties within the same
// millisecond) and a random suffix (for uniqueness across processes/tabs).
//
// Plain crypto.randomUUID() values have no relationship to insertion
// order, so IndexedDB queries on a non-unique index (e.g. looking up all
// CountAuditEntry rows for a given materialCountLineId) return records
// ordered by primary key, not by creation time — silently scrambling
// append-only audit history. Sortable ids fix that at the source instead
// of requiring every caller to remember to sort by timestamp.
export function newId(): string {
  const now = Date.now()
  if (now === lastTimestamp) {
    sequence += 1
  } else {
    lastTimestamp = now
    sequence = 0
  }
  const time = now.toString(36).padStart(9, '0')
  const seq = sequence.toString(36).padStart(3, '0')
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  return `${time}${seq}${random}`
}
