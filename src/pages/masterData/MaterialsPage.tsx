import { useEffect, useMemo, useState } from 'react'
import {
  createMaterial, listMaterials, updateMaterial, deleteMaterial, getMaterialUsage, deleteMaterialCascade,
  type MaterialUsage,
} from '../../db/repositories/materialRepository'
import { listUnits } from '../../db/repositories/unitRepository'
import { savePhoto } from '../../db/repositories/photoRepository'
import { formatSapId, isValidSapId, SAP_ID_PLACEHOLDER } from '../../domain/sapId'
import type { Material, UnitOfMeasure } from '../../db/types'
import PhotoCapture from '../../components/PhotoCapture'
import BarcodeScanner from '../../components/BarcodeScanner'
import ErrorBanner from '../../components/ErrorBanner'

const PAGE_SIZE = 10

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [name, setName] = useState('')
  const [unitId, setUnitId] = useState('')
  const [sapMaterialNumber, setSapMaterialNumber] = useState('')
  const [barcodeValue, setBarcodeValue] = useState('')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [page, setPage] = useState(0)
  const [sapIdError, setSapIdError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUnitId, setEditUnitId] = useState('')
  const [editSapNumber, setEditSapNumber] = useState('')
  const [editSapError, setEditSapError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [usageInfo, setUsageInfo] = useState<{ id: string; name: string; usage: MaterialUsage } | null>(null)

  const refresh = () => listMaterials().then(setMaterials)

  useEffect(() => {
    refresh()
    listUnits().then((u) => {
      setUnits(u)
      if (u.length > 0) setUnitId(u[0].id)
    })
  }, [])

  const unitCodeFor = (id: string) => units.find((u) => u.id === id)?.code ?? '?'

  const startEdit = (material: Material) => {
    setEditingId(material.id)
    setEditName(material.name)
    setEditUnitId(material.unitId)
    setEditSapNumber(material.sapMaterialNumber ?? '')
    setEditSapError(null)
    setRowError(null)
  }

  const saveEdit = async () => {
    if (!editName.trim() || !editUnitId) return
    const trimmedSapId = editSapNumber.trim()
    if (trimmedSapId && !isValidSapId(trimmedSapId)) {
      setEditSapError(`SAP material number must be in the format ${SAP_ID_PLACEHOLDER}`)
      return
    }
    await updateMaterial(editingId!, { name: editName.trim(), unitId: editUnitId, sapMaterialNumber: trimmedSapId || undefined })
    setEditingId(null)
    await refresh()
  }

  const confirmDelete = async (id: string, name: string) => {
    try {
      await deleteMaterial(id)
      setPendingDeleteId(null)
      await refresh()
    } catch {
      const usage = await getMaterialUsage(id)
      setPendingDeleteId(null)
      setUsageInfo({ id, name, usage })
    }
  }

  const confirmDeleteCascade = async (id: string) => {
    await deleteMaterialCascade(id)
    setUsageInfo(null)
    await refresh()
  }

  const sortedMaterials = useMemo(
    () => [...materials].sort((a, b) => (a.sapMaterialNumber ?? '￿').localeCompare(b.sapMaterialNumber ?? '￿')),
    [materials],
  )
  const pageCount = Math.max(1, Math.ceil(sortedMaterials.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageRows = sortedMaterials.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="screen">
      <h1>Materials</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim() || !unitId) return
          const trimmedSapId = sapMaterialNumber.trim()
          if (trimmedSapId && !isValidSapId(trimmedSapId)) {
            setSapIdError(`SAP material number must be in the format ${SAP_ID_PLACEHOLDER}`)
            return
          }
          setSapIdError(null)
          const photoBlobId = photoBlob ? await savePhoto(photoBlob) : undefined
          await createMaterial({
            name: name.trim(),
            unitId,
            sapMaterialNumber: trimmedSapId || undefined,
            barcodeValue: barcodeValue.trim() || undefined,
            photoBlobId,
          })
          setName('')
          setSapMaterialNumber('')
          setBarcodeValue('')
          setPhotoBlob(null)
          await refresh()
        }}
      >
        {sapIdError && <ErrorBanner message={sapIdError} />}
        <div className="form-row">
          <label htmlFor="material-name">Material name</label>
          <input id="material-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="material-unit">Unit</label>
          <select id="material-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.code}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="material-sap-number">SAP material number (optional, format {SAP_ID_PLACEHOLDER})</label>
          <input
            id="material-sap-number"
            value={sapMaterialNumber}
            placeholder={SAP_ID_PLACEHOLDER}
            onChange={(e) => setSapMaterialNumber(formatSapId(e.target.value))}
          />
        </div>
        <BarcodeScanner onDetected={setBarcodeValue} />
        {barcodeValue && <div>Scanned code: {barcodeValue}</div>}
        <PhotoCapture onCapture={setPhotoBlob} />
        <button type="submit">Add material</button>
      </form>
      {rowError && <ErrorBanner message={rowError} />}
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
            {pageRows.map((m) => {
              if (editingId === m.id) {
                return (
                  <tr key={m.id}>
                    <td colSpan={4}>
                      <div className="edit-row-form">
                        {editSapError && <ErrorBanner message={editSapError} />}
                        <input
                          aria-label={`Edit SAP id for ${m.name}`}
                          value={editSapNumber}
                          placeholder={SAP_ID_PLACEHOLDER}
                          onChange={(e) => setEditSapNumber(formatSapId(e.target.value))}
                        />
                        <input aria-label={`Edit name for ${m.name}`} value={editName} onChange={(e) => setEditName(e.target.value)} />
                        <select aria-label={`Edit unit for ${m.name}`} value={editUnitId} onChange={(e) => setEditUnitId(e.target.value)}>
                          {units.map((u) => (
                            <option key={u.id} value={u.id}>{u.code}</option>
                          ))}
                        </select>
                        <div className="action-row">
                          <button type="button" onClick={saveEdit}>Save</button>
                          <button type="button" className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              }
              if (pendingDeleteId === m.id) {
                return (
                  <tr key={m.id}>
                    <td colSpan={4}>
                      <div className="edit-row-form">
                        <p>Delete {m.name}? This cannot be undone.</p>
                        <div className="action-row">
                          <button type="button" className="danger" onClick={() => confirmDelete(m.id, m.name)}>Confirm delete</button>
                          <button type="button" className="secondary" onClick={() => setPendingDeleteId(null)}>Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              }
              if (usageInfo?.id === m.id) {
                return (
                  <tr key={m.id}>
                    <td colSpan={4}>
                      <div className="edit-row-form">
                        <p>
                          "{usageInfo.name}" is used in {usageInfo.usage.inventories.length} inventor{usageInfo.usage.inventories.length === 1 ? 'y' : 'ies'}
                          {usageInfo.usage.expectedQuantityCount > 0 ? ` and ${usageInfo.usage.expectedQuantityCount} expected-quantity entr${usageInfo.usage.expectedQuantityCount === 1 ? 'y' : 'ies'}` : ''}:
                        </p>
                        {usageInfo.usage.inventories.length > 0 && (
                          <ul>
                            {usageInfo.usage.inventories.map((inv) => (
                              <li key={inv.id}>{inv.name}</li>
                            ))}
                          </ul>
                        )}
                        <p>Deleting everything will permanently remove these inventories (and everything counted in them) along with the material.</p>
                        <div className="action-row">
                          <button type="button" className="danger" onClick={() => confirmDeleteCascade(m.id)}>Delete everything</button>
                          <button type="button" className="secondary" onClick={() => setUsageInfo(null)}>Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={m.id}>
                  <td>{m.sapMaterialNumber ?? '—'}</td>
                  <td>{m.name}</td>
                  <td>{unitCodeFor(m.unitId)}</td>
                  <td>
                    <div className="action-row" style={{ margin: 0 }}>
                      <button type="button" className="secondary" onClick={() => startEdit(m)}>Edit</button>
                      <button type="button" className="danger" onClick={() => setPendingDeleteId(m.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              )
            })}
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
