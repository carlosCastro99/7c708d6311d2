export interface CountLineSnapshot {
  zoneId: string
  materialId: string
  quantity: number
}

interface Mismatch {
  zoneId: string
  materialId: string
  passAQuantity: number
  passBQuantity: number
}

function keyOf(line: { zoneId: string; materialId: string }): string {
  return `${line.zoneId}::${line.materialId}`
}

function toMap(lines: CountLineSnapshot[]): Map<string, number> {
  return new Map(lines.map((l) => [keyOf(l), l.quantity]))
}

export function comparePasses(
  passA: CountLineSnapshot[],
  passB: CountLineSnapshot[],
): { matched: CountLineSnapshot[]; mismatched: Mismatch[] } {
  const mapA = toMap(passA)
  const mapB = toMap(passB)
  const allKeys = new Set([...mapA.keys(), ...mapB.keys()])

  const matched: CountLineSnapshot[] = []
  const mismatched: Mismatch[] = []

  for (const key of allKeys) {
    const [zoneId, materialId] = key.split('::')
    const qtyA = mapA.get(key) ?? 0
    const qtyB = mapB.get(key) ?? 0
    if (qtyA === qtyB) {
      matched.push({ zoneId, materialId, quantity: qtyA })
    } else {
      mismatched.push({ zoneId, materialId, passAQuantity: qtyA, passBQuantity: qtyB })
    }
  }

  return { matched, mismatched }
}

export type ThirdPassResolution = {
  zoneId: string
  materialId: string
  resolution: 'pass3_matches_pass1' | 'pass3_matches_pass2' | 'needs_manual_resolution'
  officialQuantity?: number
}

// Only considers Zone+Material lines present in pass3 — callers must ensure
// pass3 already contains just the pairs that mismatched between pass1 and
// pass2 (guaranteed by the app's scoped third-pass recount). A line absent
// from pass3 is treated as not needing resolution, never as a mismatch.
export function resolveThirdPass(
  pass1: CountLineSnapshot[],
  pass2: CountLineSnapshot[],
  pass3: CountLineSnapshot[],
): ThirdPassResolution[] {
  const map1 = toMap(pass1)
  const map2 = toMap(pass2)
  const map3 = toMap(pass3)

  const results: ThirdPassResolution[] = []

  for (const key of map3.keys()) {
    const [zoneId, materialId] = key.split('::')
    const q1 = map1.get(key) ?? 0
    const q2 = map2.get(key) ?? 0
    const q3 = map3.get(key) ?? 0

    if (q3 === q1) {
      results.push({ zoneId, materialId, resolution: 'pass3_matches_pass1', officialQuantity: q1 })
    } else if (q3 === q2) {
      results.push({ zoneId, materialId, resolution: 'pass3_matches_pass2', officialQuantity: q2 })
    } else {
      results.push({ zoneId, materialId, resolution: 'needs_manual_resolution' })
    }
  }

  return results
}
