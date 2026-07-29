import { useEffect, useState } from 'react'
import { createZone, listZones } from '../../db/repositories/zoneRepository'
import { savePhoto } from '../../db/repositories/photoRepository'
import type { Zone } from '../../db/types'
import PhotoCapture from '../../components/PhotoCapture'
import BarcodeScanner from '../../components/BarcodeScanner'

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([])
  const [name, setName] = useState('')
  const [sapStorageLocation, setSapStorageLocation] = useState('')
  const [barcodeValue, setBarcodeValue] = useState('')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)

  const refresh = () => listZones().then(setZones)

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="screen">
      <h1>Zones</h1>
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
          <li key={z.id} className="list-item">
            {z.name}{z.sapStorageLocation ? ` (${z.sapStorageLocation})` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
