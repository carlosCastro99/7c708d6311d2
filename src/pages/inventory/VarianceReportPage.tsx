import { useEffect, useState } from 'react'
import { getPassLines, closePass, closeInventory, startNextPass } from '../../db/repositories/inventoryRepository'
import { comparePasses } from '../../domain/reconciliation'
import type { CountLineSnapshot } from '../../domain/reconciliation'
import { db } from '../../db/schema'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import ErrorBanner from '../../components/ErrorBanner'

interface VarianceReportPageProps {
  inventoryId: string
  pass1Id: string
  pass2Id: string
  userId: string
  onResolved: (outcome: 'successful' | 'needs_3rd_pass', pass3Id?: string) => void
}

interface MismatchDisplay {
  zoneId: string
  materialId: string
  zoneName: string
  materialName: string
  passAQuantity: number
  passBQuantity: number
}

export default function VarianceReportPage({ inventoryId, pass1Id, pass2Id, userId, onResolved }: VarianceReportPageProps) {
  const [mismatched, setMismatched] = useState<MismatchDisplay[] | null>(null)
  const [loadError, setLoadError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        // This screen is reached right after the user finishes counting every
        // zone in pass 2 -- nothing else in the app closes pass 2's own
        // InventoryPass record, and closeInventory() below requires every
        // pass to be closed first. Safe to call on every mount (including a
        // resumed session that reaches this screen again): closePass is a
        // no-op status write once the pass's zone counts are already closed.
        await closePass(pass2Id, userId)
        if (cancelled) return

        const pass1Lines: CountLineSnapshot[] = await getPassLines(pass1Id)
        const pass2Lines: CountLineSnapshot[] = await getPassLines(pass2Id)
        const { mismatched: diffs } = comparePasses(pass1Lines, pass2Lines)

        if (cancelled) return

        if (diffs.length === 0) {
          await closeInventory(inventoryId, 'successful')
          if (cancelled) return
          setMismatched([])
          onResolved('successful')
        } else {
          await closeInventory(inventoryId, 'needs_3rd_pass')
          if (cancelled) return
          const withNames = await Promise.all(
            diffs.map(async (d) => {
              const zone = await db.zones.get(d.zoneId)
              const material = await db.materials.get(d.materialId)
              return { ...d, zoneName: zone?.name ?? d.zoneId, materialName: material?.name ?? d.materialId }
            }),
          )
          if (cancelled) return
          setMismatched(withNames)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err : new Error(String(err)))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [inventoryId, pass1Id, pass2Id, userId, onResolved])

  const [startThirdPass, { pending, error: startError }] = useAsyncAction(async () => {
    const pass3 = await startNextPass(inventoryId, 3)
    onResolved('needs_3rd_pass', pass3.id)
  })

  const error = loadError ?? startError

  if (error && mismatched === null) {
    return (
      <div className="screen">
        <ErrorBanner message={error.message} />
      </div>
    )
  }

  if (mismatched === null) return <div className="screen">Comparing passes…</div>

  if (mismatched.length === 0) {
    return (
      <div className="screen">
        <h1>Inventory Successful</h1>
        <p>Both passes matched on every zone and material.</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <h1>Pass 1 vs Pass 2 Mismatches</h1>
      {error && <ErrorBanner message={error.message} />}
      <ul>
        {mismatched.map((m) => (
          <li key={`${m.zoneId}-${m.materialId}`} className="list-item">
            Zone {m.zoneName} / Material {m.materialName}: {m.passAQuantity} vs {m.passBQuantity}
          </li>
        ))}
      </ul>
      <button type="button" disabled={pending} onClick={() => startThirdPass()}>
        Start third pass
      </button>
    </div>
  )
}
