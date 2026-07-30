import { useEffect, useState } from 'react'
import { getPassLines, closeInventory, startNextPass } from '../../db/repositories/inventoryRepository'
import { comparePasses } from '../../domain/reconciliation'
import type { CountLineSnapshot } from '../../domain/reconciliation'

interface VarianceReportPageProps {
  inventoryId: string
  pass1Id: string
  pass2Id: string
  onResolved: (outcome: 'successful' | 'needs_3rd_pass', pass3Id?: string) => void
}

export default function VarianceReportPage({ inventoryId, pass1Id, pass2Id, onResolved }: VarianceReportPageProps) {
  const [mismatched, setMismatched] = useState<
    Array<{ zoneId: string; materialId: string; passAQuantity: number; passBQuantity: number }> | null
  >(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
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
        setMismatched(diffs)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [inventoryId, pass1Id, pass2Id, onResolved])

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
      <ul>
        {mismatched.map((m) => (
          <li key={`${m.zoneId}-${m.materialId}`} className="list-item">
            Zone {m.zoneId} / Material {m.materialId}: {m.passAQuantity} vs {m.passBQuantity}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={async () => {
          const pass3 = await startNextPass(inventoryId, 3)
          onResolved('needs_3rd_pass', pass3.id)
        }}
      >
        Start third pass
      </button>
    </div>
  )
}
