import { useState } from 'react'
import { parseZonesCsv, parseMaterialsCsv } from '../../domain/csv'
import { createZone, listZones } from '../../db/repositories/zoneRepository'
import { createMaterial } from '../../db/repositories/materialRepository'
import { listUnits } from '../../db/repositories/unitRepository'

async function readFileText(file: File): Promise<string> {
  return file.text()
}

export default function ImportPage() {
  const [status, setStatus] = useState('')

  const importZones = async (file: File) => {
    const rows = parseZonesCsv(await readFileText(file))
    const existing = await listZones()
    const existingNames = new Set(existing.map((z) => z.name))
    let created = 0
    for (const row of rows) {
      if (existingNames.has(row.name)) continue
      await createZone({ name: row.name, sapStorageLocation: row.sapStorageLocation })
      existingNames.add(row.name)
      created++
    }
    setStatus(`Imported ${created} zone(s).`)
  }

  const importMaterials = async (file: File) => {
    const rows = parseMaterialsCsv(await readFileText(file))
    const units = await listUnits()
    const unitByCode = new Map(units.map((u) => [u.code, u.id]))
    let created = 0
    const skipped: string[] = []
    for (const row of rows) {
      const unitId = unitByCode.get(row.unitCode)
      if (!unitId) {
        skipped.push(`${row.name} (unknown unit ${row.unitCode})`)
        continue
      }
      await createMaterial({ name: row.name, unitId, sapMaterialNumber: row.sapMaterialNumber })
      created++
    }
    setStatus(`Imported ${created} material(s).${skipped.length ? ` Skipped: ${skipped.join(', ')}` : ''}`)
  }

  return (
    <div className="screen">
      <h1>Import from CSV</h1>
      <div className="form-row">
        <label htmlFor="import-zones">Zones CSV (name,sapStorageLocation)</label>
        <input
          id="import-zones"
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) importZones(file)
          }}
        />
      </div>
      <div className="form-row">
        <label htmlFor="import-materials">Materials CSV (name,unitCode,sapMaterialNumber)</label>
        <input
          id="import-materials"
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) importMaterials(file)
          }}
        />
      </div>
      {status && <p>{status}</p>}
    </div>
  )
}
