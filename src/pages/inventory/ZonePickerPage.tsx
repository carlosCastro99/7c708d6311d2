import { useCallback, useEffect, useState } from 'react'
import { listZones, findZoneByBarcode } from '../../db/repositories/zoneRepository'
import { db } from '../../db/schema'
import type { Zone, ZoneCountStatus } from '../../db/types'
import BarcodeScanner from '../../components/BarcodeScanner'

interface ZonePickerPageProps {
  passId: string
  onZoneChosen: (zoneId: string) => void
}

type ZoneStatus = 'not_started' | ZoneCountStatus

const STATUS_INFO: Record<ZoneStatus, { label: string; chipClass: string }> = {
  not_started: { label: 'Not Started', chipClass: 'status-chip-neutral' },
  open: { label: 'In Progress', chipClass: 'status-chip-info' },
  closed: { label: 'Closed', chipClass: 'status-chip-success' },
}

export default function ZonePickerPage({ passId, onZoneChosen }: ZonePickerPageProps) {
  const [zones, setZones] = useState<Zone[]>([])
  const [statusByZone, setStatusByZone] = useState<Record<string, ZoneStatus>>({})

  useEffect(() => {
    listZones().then(setZones)
  }, [])

  useEffect(() => {
    (async () => {
      const zoneCounts = await db.zoneCounts.where('passId').equals(passId).toArray()
      const statuses: Record<string, ZoneStatus> = {}
      for (const zc of zoneCounts) statuses[zc.zoneId] = zc.status
      setStatusByZone(statuses)
    })()
  }, [passId])

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
        {zones.map((z) => {
          const status = statusByZone[z.id] ?? 'not_started'
          const { label, chipClass } = STATUS_INFO[status]
          return (
            <li key={z.id}>
              <button type="button" className="secondary zone-picker-button" onClick={() => onZoneChosen(z.id)}>
                <span>{z.name}</span>
                <span className={`status-chip ${chipClass}`}>{label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
