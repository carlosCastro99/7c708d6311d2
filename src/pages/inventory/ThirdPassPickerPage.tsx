import { useEffect, useState } from 'react'
import { db } from '../../db/schema'

interface ThirdPassPickerPageProps {
  mismatches: Array<{ zoneId: string; materialId: string }>
  onPairChosen: (zoneId: string, materialId: string) => void
}

interface DisplayPair {
  zoneId: string
  materialId: string
  zoneName: string
  materialName: string
}

export default function ThirdPassPickerPage({ mismatches, onPairChosen }: ThirdPassPickerPageProps) {
  const [pairs, setPairs] = useState<DisplayPair[]>([])

  useEffect(() => {
    (async () => {
      const withNames = await Promise.all(
        mismatches.map(async (m) => {
          const zone = await db.zones.get(m.zoneId)
          const material = await db.materials.get(m.materialId)
          return { ...m, zoneName: zone?.name ?? m.zoneId, materialName: material?.name ?? m.materialId }
        }),
      )
      setPairs(withNames)
    })()
  }, [mismatches])

  return (
    <div className="screen">
      <h1>Third Pass — Recount Mismatches</h1>
      <ul>
        {pairs.map((m) => (
          <li key={`${m.zoneId}-${m.materialId}`}>
            <button
              className="secondary"
              style={{ width: '100%' }}
              onClick={() => onPairChosen(m.zoneId, m.materialId)}
            >
              {m.zoneName} / {m.materialName}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
