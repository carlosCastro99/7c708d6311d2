import { useEffect, useState } from 'react'
import { closeZoneCount } from '../../db/repositories/inventoryRepository'
import { db } from '../../db/schema'
import type { MaterialCountLine } from '../../db/types'

interface ZoneSummaryPageProps {
  zoneCountId: string
  userId: string
  onClosed: () => void
}

export default function ZoneSummaryPage({ zoneCountId, userId, onClosed }: ZoneSummaryPageProps) {
  const [lines, setLines] = useState<MaterialCountLine[]>([])

  useEffect(() => {
    db.countLines.where('zoneCountId').equals(zoneCountId).toArray().then(setLines)
  }, [zoneCountId])

  return (
    <div className="screen">
      <h1>Zone Summary</h1>
      <ul>
        {lines.map((l) => (
          <li key={l.id} className="list-item">Material {l.materialId}: {l.quantity}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={async () => {
          await closeZoneCount(zoneCountId, userId)
          onClosed()
        }}
      >
        Close zone
      </button>
    </div>
  )
}
