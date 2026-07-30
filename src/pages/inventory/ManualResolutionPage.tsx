import { useEffect, useState } from 'react'
import {
  getPassLines, setCountLine, getOrOpenZoneCount, reopenTarget, closeZoneCount,
  closeInventoryAfterReconciliation,
} from '../../db/repositories/inventoryRepository'
import { resolveThirdPass, type ThirdPassResolution } from '../../domain/reconciliation'
import type { CountLineSnapshot } from '../../domain/reconciliation'
import { db } from '../../db/schema'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import ErrorBanner from '../../components/ErrorBanner'

interface ManualResolutionPageProps {
  inventoryId: string
  pass1Id: string
  pass2Id: string
  pass3Id: string
  userId: string
  onResolved: () => void
}

interface NeedsManualDisplay extends ThirdPassResolution {
  zoneName: string
  materialName: string
}

export default function ManualResolutionPage({
  inventoryId, pass1Id, pass2Id, pass3Id, userId, onResolved,
}: ManualResolutionPageProps) {
  const [needsManual, setNeedsManual] = useState<NeedsManualDisplay[]>([])
  const [entries, setEntries] = useState<Record<string, { quantity: string; reason: string }>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    (async () => {
      const pass1Lines: CountLineSnapshot[] = await getPassLines(pass1Id)
      const pass2Lines: CountLineSnapshot[] = await getPassLines(pass2Id)
      const pass3Lines: CountLineSnapshot[] = await getPassLines(pass3Id)
      const resolutions = resolveThirdPass(pass1Lines, pass2Lines, pass3Lines)
      const manual = resolutions.filter((r) => r.resolution === 'needs_manual_resolution')
      const withNames = await Promise.all(
        manual.map(async (item) => {
          const zone = await db.zones.get(item.zoneId)
          const material = await db.materials.get(item.materialId)
          return { ...item, zoneName: zone?.name ?? item.zoneId, materialName: material?.name ?? item.materialId }
        }),
      )
      setNeedsManual(withNames)
      setLoaded(true)
    })()
  }, [pass1Id, pass2Id, pass3Id])

  const [submit, { pending, error }] = useAsyncAction(async () => {
    const allComplete = needsManual.every((item) => {
      const key = `${item.zoneId}-${item.materialId}`
      const entry = entries[key]
      return entry && entry.quantity !== '' && entry.reason.trim()
    })
    if (!allComplete) return

    // setCountLine now also rejects writes when the zone count's parent pass
    // is closed, not just when the zone count itself is closed. By the time
    // manual resolution runs, pass 3 is frequently already closed (e.g. after
    // a prior close attempt, or in tests that close it explicitly), so reopen
    // the pass itself before reopening any of its zone counts -- otherwise
    // setCountLine would reject every write below.
    const pass3 = await db.passes.get(pass3Id)
    if (pass3?.status === 'closed') {
      await reopenTarget('pass', pass3Id, userId, 'manual resolution recount')
    }

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
    await closeInventoryAfterReconciliation(inventoryId, pass1Id, pass2Id, pass3Id, userId)
    onResolved()
  })

  if (!loaded) return <div className="screen">Loading…</div>

  return (
    <div className="screen">
      <h1>Manual Resolution Needed</h1>
      {error && <ErrorBanner message={error.message} />}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {needsManual.map((item) => {
          const key = `${item.zoneId}-${item.materialId}`
          return (
            <div key={key} className="form-row">
              <p>Needs manual resolution — Zone {item.zoneName} / Material {item.materialName}</p>
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
        <button type="submit" disabled={pending}>Confirm final count</button>
      </form>
    </div>
  )
}
