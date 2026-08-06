import { useEffect, useState } from 'react'
import { createZone, listZones, updateZone, deleteZone } from '../../db/repositories/zoneRepository'
import { savePhoto } from '../../db/repositories/photoRepository'
import ErrorBanner from '../../components/ErrorBanner'
import type { Zone } from '../../db/types'
import PhotoCapture from '../../components/PhotoCapture'
import BarcodeScanner from '../../components/BarcodeScanner'

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([])
  const [name, setName] = useState('')
  const [sapStorageLocation, setSapStorageLocation] = useState('')
  const [barcodeValue, setBarcodeValue] = useState('')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSapLocation, setEditSapLocation] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => listZones().then(setZones)

  useEffect(() => {
    refresh()
  }, [])

  const startEdit = (zone: Zone) => {
    setEditingId(zone.id)
    setEditName(zone.name)
    setEditSapLocation(zone.sapStorageLocation ?? '')
    setError(null)
  }

  const saveEdit = async () => {
    if (!editName.trim()) return
    await updateZone(editingId!, { name: editName.trim(), sapStorageLocation: editSapLocation.trim() || undefined })
    setEditingId(null)
    await refresh()
  }

  const confirmDelete = async (id: string) => {
    try {
      await deleteZone(id)
      setPendingDeleteId(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPendingDeleteId(null)
    }
  }

  return (
    <div className="screen">
      <h1>Zones</h1>
      {error && <ErrorBanner message={error} />}
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          const photoBlobId = photoBlob ? await savePhoto(photoBlob) : undefined
          await createZone({
            name: name.trim(),
            sapStorageLocation: sapStorageLocation.trim() || undefined,
            barcodeValue: barcodeValue.trim() || undefined,
            photoBlobId,
          })
          setName('')
          setSapStorageLocation('')
          setBarcodeValue('')
          setPhotoBlob(null)
          await refresh()
        }}
      >
        <div className="form-row">
          <label htmlFor="zone-name">Zone name</label>
          <input id="zone-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="zone-sap-location">SAP storage location (optional)</label>
          <input
            id="zone-sap-location"
            value={sapStorageLocation}
            onChange={(e) => setSapStorageLocation(e.target.value)}
          />
        </div>
        <BarcodeScanner onDetected={setBarcodeValue} />
        {barcodeValue && <div>Scanned code: {barcodeValue}</div>}
        <PhotoCapture onCapture={setPhotoBlob} />
        <button type="submit">Add zone</button>
      </form>
      <ul>
        {zones.map((z) => (
          <li key={z.id} className="list-item edit-row">
            {editingId === z.id ? (
              <div className="edit-row-form">
                <input aria-label={`Edit name for ${z.name}`} value={editName} onChange={(e) => setEditName(e.target.value)} />
                <input
                  aria-label={`Edit SAP storage location for ${z.name}`}
                  value={editSapLocation}
                  onChange={(e) => setEditSapLocation(e.target.value)}
                  placeholder="SAP storage location (optional)"
                />
                <div className="action-row">
                  <button type="button" onClick={saveEdit}>Save</button>
                  <button type="button" className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : pendingDeleteId === z.id ? (
              <div className="edit-row-form">
                <p>Delete {z.name}? This cannot be undone.</p>
                <div className="action-row">
                  <button type="button" className="danger" onClick={() => confirmDelete(z.id)}>Confirm delete</button>
                  <button type="button" className="secondary" onClick={() => setPendingDeleteId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <span>{z.name}{z.sapStorageLocation ? ` (${z.sapStorageLocation})` : ''}</span>
                <div className="action-row" style={{ margin: 0 }}>
                  <button type="button" className="secondary" onClick={() => startEdit(z)}>Edit</button>
                  <button type="button" className="danger" onClick={() => setPendingDeleteId(z.id)}>Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
