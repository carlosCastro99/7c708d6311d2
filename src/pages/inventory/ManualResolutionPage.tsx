import { useEffect, useState } from 'react'
import {
  getPassLines, closeInventory, setCountLine, getOrOpenZoneCount, reopenTarget, closeZoneCount, closePass,
} from '../../db/repositories/inventoryRepository'
import { resolveThirdPass, type ThirdPassResolution } from '../../domain/reconciliation'
import type { CountLineSnapshot } from '../../domain/reconciliation'

interface ManualResolutionPageProps {
  inventoryId: string
  pass1Id: string
  pass2Id: string
  pass3Id: string
  userId: string
  onResolved: () => void
}

export default function ManualResolutionPage({
  inventoryId, pass1Id, pass2Id, pass3Id, userId, onResolved,
}: ManualResolutionPageProps) {
  const [needsManual, setNeedsManual] = useState<ThirdPassResolution[]>([])
  const [entries, setEntries] = useState<Record<string, { quantity: string; reason: string }>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    (async () => {
      const pass1Lines: CountLineSnapshot[] = await getPassLines(pass1Id)
      const pass2Lines: CountLineSnapshot[] = await getPassLines(pass2Id)
      const pass3Lines: CountLineSnapshot[] = await getPassLines(pass3Id)
      const resolutions = resolveThirdPass(pass1Lines, pass2Lines, pass3Lines)
      setNeedsManual(resolutions.filter((r) => r.resolution === 'needs_manual_resolution'))
      setLoaded(true)
    })()
  }, [pass1Id, pass2Id, pass3Id])

  if (!loaded) return <div className="screen">Loading…</div>

  return (
    <div className="screen">
      <h1>Manual Resolution Needed</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          const allComplete = needsManual.every((item) => {
            const key = `${item.zoneId}-${item.materialId}`
            const entry = entries[key]
            return entry && entry.quantity !== '' && entry.reason.trim()
          })
          if (!allComplete) return

          for (const item of needsManual) {
            const key = `${item.zoneId}-${item.materialId}`
            const entry = entries[key]!
            const zoneCount = await getOrOpenZoneCount(pass3Id, item.zoneId, userId)
            if (zoneCount.status === 'closed') {
              await reopenTarget('zoneCount', zoneCount.id, userId, entry.reason)
            }
            await setCountLine(zoneCount.id, item.materialId, Number(entry.quantity), userId)
            await closeZoneCount(zoneCount.id, userId)
          }
          await closePass(pass3Id, userId)
          await closeInventory(inventoryId, 'successful')
          onResolved()
        }}
      >
        {needsManual.map((item) => {
          const key = `${item.zoneId}-${item.materialId}`
          return (
            <div key={key} className="form-row">
              <p>Needs manual resolution — Zone {item.zoneId} / Material {item.materialId}</p>
              <label htmlFor={`qty-${key}`}>Final quantity</label>
              <input
                id={`qty-${key}`}
                aria-label={`final quantity for zone ${item.zoneId} material ${item.materialId}`}
                type="number"
                value={entries[key]?.quantity ?? ''}
                onChange={(e) =>
                  setEntries((prev) => ({ ...prev, [key]: { quantity: e.target.value, reason: prev[key]?.reason ?? '' } }))
                }
              />
              <label htmlFor={`reason-${key}`}>Reason</label>
              <input
                id={`reason-${key}`}
                aria-label={`reason for zone ${item.zoneId} material ${item.materialId}`}
                value={entries[key]?.reason ?? ''}
                onChange={(e) =>
                  setEntries((prev) => ({ ...prev, [key]: { quantity: prev[key]?.quantity ?? '', reason: e.target.value } }))
                }
              />
            </div>
          )
        })}
        <button type="submit">Confirm final count</button>
      </form>
    </div>
  )
}
