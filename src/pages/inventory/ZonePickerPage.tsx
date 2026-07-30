import { useCallback, useEffect, useState } from 'react'
import { listZones, findZoneByBarcode } from '../../db/repositories/zoneRepository'
import type { Zone } from '../../db/types'
import BarcodeScanner from '../../components/BarcodeScanner'

interface ZonePickerPageProps {
  onZoneChosen: (zoneId: string) => void
}

export default function ZonePickerPage({ onZoneChosen }: ZonePickerPageProps) {
  const [zones, setZones] = useState<Zone[]>([])

  useEffect(() => {
    listZones().then(setZones)
  }, [])

  const handleDetected = useCallback(
    async (value: string) => {
      const zone = await findZoneByBarcode(value)
      if (zone) onZoneChosen(zone.id)
    },
    [onZoneChosen],
  )

  return (
    <div className="screen">
      <h1>Pick a Zone</h1>
      <BarcodeScanner onDetected={handleDetected} />
      <ul>
        {zones.map((z) => (
          <li key={z.id}>
            <button className="secondary" style={{ width: '100%' }} onClick={() => onZoneChosen(z.id)}>
              {z.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
