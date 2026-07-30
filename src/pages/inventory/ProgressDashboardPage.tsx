import { useEffect, useState } from 'react'
import { db } from '../../db/schema'

interface ProgressDashboardPageProps {
  passId: string
  expectedPairs?: Array<{ zoneId: string; materialId: string }>
}

export default function ProgressDashboardPage({ passId, expectedPairs = [] }: ProgressDashboardPageProps) {
  const [zonesClosed, setZonesClosed] = useState(0)
  const [zonesTotal, setZonesTotal] = useState(0)
  const [lineCount, setLineCount] = useState(0)
  const [notCounted, setNotCounted] = useState<Array<{ zoneId: string; materialId: string; materialName: string }>>([])

  useEffect(() => {
    (async () => {
      const zoneCounts = await db.zoneCounts.where('passId').equals(passId).toArray()
      setZonesTotal(zoneCounts.length)
      setZonesClosed(zoneCounts.filter((zc) => zc.status === 'closed').length)

      let count = 0
      const countedPairs = new Set<string>()
      for (const zc of zoneCounts) {
        const lines = await db.countLines.where('zoneCountId').equals(zc.id).toArray()
        count += lines.length
        for (const line of lines) countedPairs.add(`${zc.zoneId}::${line.materialId}`)
      }
      setLineCount(count)

      const missing = []
      for (const pair of expectedPairs) {
        if (!countedPairs.has(`${pair.zoneId}::${pair.materialId}`)) {
          const material = await db.materials.get(pair.materialId)
          missing.push({ ...pair, materialName: material?.name ?? pair.materialId })
        }
      }
      setNotCounted(missing)
    })()
  }, [passId, expectedPairs])

  return (
    <div className="screen">
      <h1>Progress</h1>
      <p>{zonesClosed} / {zonesTotal} zones closed</p>
      <p>{lineCount} material line{lineCount === 1 ? '' : 's'} counted</p>
      {notCounted.length > 0 && (
        <>
          <h2>Not counted</h2>
          <ul>
            {notCounted.map((m) => (
              <li key={`${m.zoneId}-${m.materialId}`} className="list-item">{m.materialName} (Zone {m.zoneId})</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
