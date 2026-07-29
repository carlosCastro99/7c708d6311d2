import { useEffect, useState } from 'react'
import { createMaterial, listMaterials } from '../../db/repositories/materialRepository'
import { listUnits } from '../../db/repositories/unitRepository'
import { savePhoto } from '../../db/repositories/photoRepository'
import type { Material, UnitOfMeasure } from '../../db/types'
import PhotoCapture from '../../components/PhotoCapture'
import BarcodeScanner from '../../components/BarcodeScanner'

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [name, setName] = useState('')
  const [unitId, setUnitId] = useState('')
  const [sapMaterialNumber, setSapMaterialNumber] = useState('')
  const [barcodeValue, setBarcodeValue] = useState('')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)

  const refresh = () => listMaterials().then(setMaterials)

  useEffect(() => {
    refresh()
    listUnits().then((u) => {
      setUnits(u)
      if (u.length > 0) setUnitId(u[0].id)
    })
  }, [])

  const unitCodeFor = (id: string) => units.find((u) => u.id === id)?.code ?? '?'

  return (
    <div className="screen">
      <h1>Materials</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim() || !unitId) return
          const photoBlobId = photoBlob ? await savePhoto(photoBlob) : undefined
          await createMaterial({
            name: name.trim(),
            unitId,
            sapMaterialNumber: sapMaterialNumber.trim() || undefined,
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
          <label htmlFor="material-sap-number">SAP material number (optional)</label>
          <input
            id="material-sap-number"
            value={sapMaterialNumber}
            onChange={(e) => setSapMaterialNumber(e.target.value)}
          />
        </div>
        <BarcodeScanner onDetected={setBarcodeValue} />
        {barcodeValue && <div>Scanned code: {barcodeValue}</div>}
        <PhotoCapture onCapture={setPhotoBlob} />
        <button type="submit">Add material</button>
      </form>
      <ul>
        {materials.map((m) => (
          <li key={m.id} className="list-item">{m.name} ({unitCodeFor(m.unitId)})</li>
        ))}
      </ul>
    </div>
  )
}
