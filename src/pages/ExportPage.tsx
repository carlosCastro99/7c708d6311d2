import { useEffect, useState } from 'react'
import { db } from '../db/schema'
import { buildDetailCsv, buildSummaryCsv, type DetailRow, type SummaryRow } from '../domain/csv'

interface ExportPageProps {
  inventoryId: string
}

export default function ExportPage({ inventoryId }: ExportPageProps) {
  const [detailUrl, setDetailUrl] = useState<string | null>(null)
  const [summaryUrl, setSummaryUrl] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const inventory = await db.inventories.get(inventoryId)
      if (!inventory) return
      const passes = (await db.passes.where('inventoryId').equals(inventoryId).toArray())
        .sort((a, b) => a.passNumber - b.passNumber)

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
              status: 'recorded',
              countedByUser: updatedBy?.name ?? line.updatedByUserId,
              timestamp: new Date(line.updatedAt).toISOString(),
            })

            const key = `${zc.zoneId}::${line.materialId}`
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

      const detailCsv = buildDetailCsv(detailRows)
      const summaryCsv = buildSummaryCsv([...officialByZoneMaterial.values()])

      setDetailUrl(URL.createObjectURL(new Blob([detailCsv], { type: 'text/csv' })))
      setSummaryUrl(URL.createObjectURL(new Blob([summaryCsv], { type: 'text/csv' })))
    })()
  }, [inventoryId])

  return (
    <div className="screen">
      <h1>Export</h1>
      {detailUrl && <a href={detailUrl} download="inventory-detail.csv">Download detail CSV</a>}
      <br />
      {summaryUrl && <a href={summaryUrl} download="inventory-summary.csv">Download summary CSV</a>}
    </div>
  )
}
