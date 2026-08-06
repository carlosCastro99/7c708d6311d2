import { useEffect, useMemo, useState } from 'react'
import { createMaterial, listMaterials } from '../../db/repositories/materialRepository'
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

  const refresh = () => listMaterials().then(setMaterials)

  useEffect(() => {
    refresh()
    listUnits().then((u) => {
      setUnits(u)
      if (u.length > 0) setUnitId(u[0].id)
    })
  }, [])

  const unitCodeFor = (id: string) => units.find((u) => u.id === id)?.code ?? '?'

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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SAP ID</th>
              <th>Material</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((m) => (
              <tr key={m.id}>
                <td>{m.sapMaterialNumber ?? '—'}</td>
                <td>{m.name}</td>
                <td>{unitCodeFor(m.unitId)}</td>
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
