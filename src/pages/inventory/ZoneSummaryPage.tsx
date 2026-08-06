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
  onCountAnother?: () => void
}

export default function ZoneSummaryPage({ zoneCountId, userId, onClosed, onCountAnother }: ZoneSummaryPageProps) {
  const [lines, setLines] = useState<Array<MaterialCountLine & { materialName: string; unitCode: string }>>([])

  useEffect(() => {
    (async () => {
      const rawLines = await db.countLines.where('zoneCountId').equals(zoneCountId).toArray()
      const withNames = await Promise.all(
        rawLines.map(async (l) => {
          const material: Material | undefined = await db.materials.get(l.materialId)
          const unit = material ? await db.units.get(material.unitId) : undefined
          return { ...l, materialName: material?.name ?? l.materialId, unitCode: unit?.code ?? '' }
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
            <span className={l.quantity === 0 ? 'quantity-zero' : 'quantity-counted'}>
              {l.quantity}{l.unitCode ? ` ${l.unitCode}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <div className="action-row">
        {onCountAnother && (
          <button type="button" className="secondary" onClick={onCountAnother}>
            + Count another material
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => close()}>
          Close zone
        </button>
      </div>
    </div>
  )
}
