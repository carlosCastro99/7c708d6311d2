import { useCallback, useEffect, useState } from 'react'
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

  const handleDetected = useCallback(
    async (value: string) => {
      const material = await findMaterialByBarcode(value)
      if (material) onMaterialChosen(material.id)
    },
    [onMaterialChosen],
  )

  return (
    <div className="screen">
      <h1>Pick a Material</h1>
      <BarcodeScanner onDetected={handleDetected} />
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
