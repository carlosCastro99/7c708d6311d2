import { useEffect, useState } from 'react'
import { listMaterials, findMaterialByBarcode } from '../../db/repositories/materialRepository'
import type { Material } from '../../db/types'
import BarcodeScanner from '../../components/BarcodeScanner'

interface MaterialPickerPageProps {
  onMaterialChosen: (materialId: string) => void
}

export default function MaterialPickerPage({ onMaterialChosen }: MaterialPickerPageProps) {
  const [materials, setMaterials] = useState<Material[]>([])

  useEffect(() => {
    listMaterials().then(setMaterials)
  }, [])

  return (
    <div className="screen">
      <h1>Pick a Material</h1>
      <BarcodeScanner
        onDetected={async (value) => {
          const material = await findMaterialByBarcode(value)
          if (material) onMaterialChosen(material.id)
        }}
      />
      <ul>
        {materials.map((m) => (
          <li key={m.id}>
            <button className="secondary" style={{ width: '100%' }} onClick={() => onMaterialChosen(m.id)}>
              {m.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
