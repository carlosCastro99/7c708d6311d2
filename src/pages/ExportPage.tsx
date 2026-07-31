import { useEffect, useState } from 'react'
import { db } from '../db/schema'
import { buildDetailCsv, buildSummaryCsv, type DetailRow, type SummaryRow } from '../domain/csv'
import { comparePasses } from '../domain/reconciliation'
import type { CountLineSnapshot } from '../domain/reconciliation'

interface ExportPageProps {
  inventoryId: string
}

export default function ExportPage({ inventoryId }: ExportPageProps) {
  const [detailUrl, setDetailUrl] = useState<string | null>(null)
  const [summaryUrl, setSummaryUrl] = useState<string | null>(null)
  const [inventoryName, setInventoryName] = useState<string | null>(null)
  const [inventoryStatus, setInventoryStatus] = useState<string | null>(null)
  const [rows, setRows] = useState<SummaryRow[]>([])

  useEffect(() => {
    (async () => {
      const inventory = await db.inventories.get(inventoryId)
      if (!inventory) return
      setInventoryName(inventory.name)
      setInventoryStatus(inventory.status)
      const passes = (await db.passes.where('inventoryId').equals(inventoryId).toArray())
        .sort((a, b) => a.passNumber - b.passNumber)

      // Precompute a status per zone+material key using the same reconciliation
      // logic the app uses to drive the wizard, so the export reflects reality
      // rather than a hardcoded placeholder.
      const statusByKey = new Map<string, 'matched' | 'mismatched' | 'manually_resolved'>()
      const manuallyResolvedKeys = new Set<string>()
      const pass1 = passes.find((p) => p.passNumber === 1)
      const pass2 = passes.find((p) => p.passNumber === 2)
      const pass3 = passes.find((p) => p.passNumber === 3)
      if (pass1 && pass2) {
        const getSnapshot = async (passId: string): Promise<CountLineSnapshot[]> => {
          const zcs = await db.zoneCounts.where('passId').equals(passId).toArray()
          const snapshot: CountLineSnapshot[] = []
          for (const zc of zcs) {
            const lines = await db.countLines.where('zoneCountId').equals(zc.id).toArray()
            for (const line of lines) snapshot.push({ zoneId: zc.zoneId, materialId: line.materialId, quantity: line.quantity })
          }
          return snapshot
        }
        const pass1Lines = await getSnapshot(pass1.id)
        const pass2Lines = await getSnapshot(pass2.id)
        const { matched, mismatched } = comparePasses(pass1Lines, pass2Lines)
        for (const m of matched) statusByKey.set(`${m.zoneId}::${m.materialId}`, 'matched')
        for (const m of mismatched) statusByKey.set(`${m.zoneId}::${m.materialId}`, 'mismatched')
        if (pass3) {
          // Manual resolution applies to the pass3 recount line itself, not
          // retroactively to the pass1/pass2 lines that produced the
          // mismatch — those should keep showing 'mismatched'.
          const pass3Lines = await getSnapshot(pass3.id)
          for (const line of pass3Lines) manuallyResolvedKeys.add(`${line.zoneId}::${line.materialId}`)
        }
      }

      const detailRows: DetailRow[] = []
      const officialByZoneMaterial = new Map<string, SummaryRow>()

      for (const pass of passes) {
        const zoneCounts = await db.zoneCounts.where('passId').equals(pass.id).toArray()
        for (const zc of zoneCounts) {
          const zone = await db.zones.get(zc.zoneId)
          const lines = await db.countLines.where('zoneCountId').equals(zc.id).toArray()
          for (const line of lines) {
            const material = await db.materials.get(line.materialId)
            const unit = material ? await db.units.get(material.unitId) : undefined
            const updatedBy = await db.users.get(line.updatedByUserId)
            const variance = line.expectedQuantity !== undefined ? line.quantity - line.expectedQuantity : undefined
            const key = `${zc.zoneId}::${line.materialId}`
            const status = pass.id === pass3?.id && manuallyResolvedKeys.has(key)
              ? 'manually_resolved'
              : statusByKey.get(key) ?? 'matched'

            detailRows.push({
              inventoryName: inventory.name,
              passNumber: pass.passNumber,
              zoneName: zone?.name ?? zc.zoneId,
              sapStorageLocation: zone?.sapStorageLocation,
              materialName: material?.name ?? line.materialId,
              sapMaterialNumber: material?.sapMaterialNumber,
              unitCode: unit?.code ?? '',
              expectedQuantity: line.expectedQuantity,
              countedQuantity: line.quantity,
              variance,
              status,
              lotNumber: line.lotNumber,
              countedByUser: updatedBy?.name ?? line.updatedByUserId,
              timestamp: new Date(line.updatedAt).toISOString(),
            })

            officialByZoneMaterial.set(key, {
              zoneName: zone?.name ?? zc.zoneId,
              materialName: material?.name ?? line.materialId,
              officialQuantity: line.quantity,
              expectedQuantity: line.expectedQuantity,
              variance,
            })
          }
        }
      }

      const summaryRows = [...officialByZoneMaterial.values()].sort(
        (a, b) => a.zoneName.localeCompare(b.zoneName) || a.materialName.localeCompare(b.materialName),
      )

      const detailCsv = buildDetailCsv(detailRows)
      const summaryCsv = buildSummaryCsv(summaryRows)

      setRows(summaryRows)
      setDetailUrl(URL.createObjectURL(new Blob([detailCsv], { type: 'text/csv' })))
      setSummaryUrl(URL.createObjectURL(new Blob([summaryCsv], { type: 'text/csv' })))
    })()
  }, [inventoryId])

  return (
    <div className="screen">
      <h1>{inventoryName ?? 'Export'}</h1>
      {inventoryStatus && <p className="on-surface-variant">Status: {inventoryStatus}</p>}

      <div className="action-row">
        {detailUrl && <a href={detailUrl} download="inventory-detail.csv" className="link-button">Download detail CSV</a>}
        {summaryUrl && <a href={summaryUrl} download="inventory-summary.csv" className="link-button">Download summary CSV</a>}
      </div>

      {rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Zone</th>
                <th>Material</th>
                <th>Quantity</th>
                <th>Expected</th>
                <th>Variance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.zoneName}-${row.materialName}`}>
                  <td>{row.zoneName}</td>
                  <td>{row.materialName}</td>
                  <td className={row.officialQuantity === 0 ? 'quantity-zero' : 'quantity-counted'}>{row.officialQuantity}</td>
                  <td>{row.expectedQuantity ?? '—'}</td>
                  <td className={row.variance ? 'variance-warning' : undefined}>
                    {row.variance ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
