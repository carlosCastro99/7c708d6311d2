import { useCallback, useEffect, useMemo, useState } from 'react'
import { listMaterials, findMaterialByBarcode, createMaterial } from '../../db/repositories/materialRepository'
import { listUnits } from '../../db/repositories/unitRepository'
import type { Material, UnitOfMeasure } from '../../db/types'
import BarcodeScanner from '../../components/BarcodeScanner'

interface MaterialPickerPageProps {
  onMaterialChosen: (materialId: string) => void
}

const PAGE_SIZE = 10

export default function MaterialPickerPage({ onMaterialChosen }: MaterialPickerPageProps) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUnitId, setNewUnitId] = useState('')
  const [newSapNumber, setNewSapNumber] = useState('')

  const refresh = () => listMaterials().then(setMaterials)

  useEffect(() => {
    refresh()
    listUnits().then((u) => {
      setUnits(u)
      if (u.length > 0) setNewUnitId(u[0].id)
    })
  }, [])

  const handleDetected = useCallback(
    async (value: string) => {
      const material = await findMaterialByBarcode(value)
      if (material) onMaterialChosen(material.id)
    },
    [onMaterialChosen],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = q
      ? materials.filter(
          (m) => m.name.toLowerCase().includes(q) || (m.sapMaterialNumber ?? '').toLowerCase().includes(q),
        )
      : materials
    return [...base].sort((a, b) => (a.sapMaterialNumber ?? '￿').localeCompare(b.sapMaterialNumber ?? '￿'))
  }, [materials, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  const unitCodeFor = (id: string) => units.find((u) => u.id === id)?.code ?? ''

  return (
    <div className="screen">
      <h1>Pick a Material</h1>
      <BarcodeScanner onDetected={handleDetected} />

      <div className="form-row">
        <label htmlFor="material-search">Search materials</label>
        <input
          id="material-search"
          value={search}
          placeholder="Search by name or SAP number"
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
        />
      </div>

      {!creating ? (
        <button type="button" className="secondary" onClick={() => setCreating(true)}>
          + Create new material
        </button>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!newName.trim() || !newUnitId) return
            const material = await createMaterial({
              name: newName.trim(),
              unitId: newUnitId,
              sapMaterialNumber: newSapNumber.trim() || undefined,
            })
            setNewName('')
            setNewSapNumber('')
            setCreating(false)
            await refresh()
            onMaterialChosen(material.id)
          }}
        >
          <div className="form-row">
            <label htmlFor="new-material-name">New material name</label>
            <input id="new-material-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div className="form-row">
            <label htmlFor="new-material-unit">Unit</label>
            <select id="new-material-unit" value={newUnitId} onChange={(e) => setNewUnitId(e.target.value)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.code}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="new-material-sap">SAP number (optional)</label>
            <input id="new-material-sap" value={newSapNumber} onChange={(e) => setNewSapNumber(e.target.value)} />
          </div>
          <div className="action-row">
            <button type="submit">Create &amp; select</button>
            <button type="button" className="secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SAP ID</th>
              <th>Material</th>
              <th>Unit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((m) => (
              <tr key={m.id}>
                <td>{m.sapMaterialNumber ?? '—'}</td>
                <td>{m.name}</td>
                <td>{unitCodeFor(m.unitId)}</td>
                <td>
                  <button type="button" className="secondary" onClick={() => onMaterialChosen(m.id)}>Select</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination-row">
        <button type="button" className="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
          Previous
        </button>
        <span>Page {currentPage + 1} of {pageCount}</span>
        <button type="button" className="secondary" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>
          Next
        </button>
      </div>
    </div>
  )
}
