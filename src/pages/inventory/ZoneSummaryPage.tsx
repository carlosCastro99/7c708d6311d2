import { useEffect, useState } from 'react'
import { closeZoneCount } from '../../db/repositories/inventoryRepository'
import { db } from '../../db/schema'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import ErrorBanner from '../../components/ErrorBanner'
import type { MaterialCountLine, Material } from '../../db/types'

interface ZoneSummaryPageProps {
  zoneCountId: string
  userId: string
  onClosed: () => void
}

export default function ZoneSummaryPage({ zoneCountId, userId, onClosed }: ZoneSummaryPageProps) {
  const [lines, setLines] = useState<Array<MaterialCountLine & { materialName: string }>>([])

  useEffect(() => {
    (async () => {
      const rawLines = await db.countLines.where('zoneCountId').equals(zoneCountId).toArray()
      const withNames = await Promise.all(
        rawLines.map(async (l) => {
          const material: Material | undefined = await db.materials.get(l.materialId)
          return { ...l, materialName: material?.name ?? l.materialId }
        }),
      )
      setLines(withNames)
    })()
  }, [zoneCountId])

  const [close, { pending, error }] = useAsyncAction(async () => {
    await closeZoneCount(zoneCountId, userId)
    onClosed()
  })

  return (
    <div className="screen">
      <h1>Zone Summary</h1>
      {error && <ErrorBanner message={error.message} />}
      <ul>
        {lines.map((l) => (
          <li key={l.id} className="list-item">
            <span>{l.materialName}{l.lotNumber ? ` (Lot ${l.lotNumber})` : ''}</span>
            <span className={l.quantity === 0 ? 'quantity-zero' : 'quantity-counted'}>{l.quantity}</span>
          </li>
        ))}
      </ul>
      <button type="button" disabled={pending} onClick={() => close()}>
        Close zone
      </button>
    </div>
  )
}
