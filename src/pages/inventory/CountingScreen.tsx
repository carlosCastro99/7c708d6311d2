import { useState } from 'react'
import { setCountLine } from '../../db/repositories/inventoryRepository'
import { savePhoto } from '../../db/repositories/photoRepository'
import TapCounter from '../../components/TapCounter'
import PhotoCapture from '../../components/PhotoCapture'

interface CountingScreenProps {
  zoneCountId: string
  materialId: string
  userId: string
  expectedQuantity?: number
  initialQuantity: number
  onSaved: () => void
}

export default function CountingScreen({
  zoneCountId, materialId, userId, expectedQuantity, initialQuantity, onSaved,
}: CountingScreenProps) {
  const [quantity, setQuantity] = useState(initialQuantity)
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)

  return (
    <div className="screen">
      <h1>Count</h1>
      {expectedQuantity !== undefined && <p>Expected: {expectedQuantity}</p>}
      <TapCounter value={quantity} onChange={setQuantity} />
      <PhotoCapture onCapture={setPhotoBlob} />
      <button
        type="button"
        onClick={async () => {
          const photoBlobId = photoBlob ? await savePhoto(photoBlob) : undefined
          await setCountLine(zoneCountId, materialId, quantity, userId, expectedQuantity, photoBlobId)
          onSaved()
        }}
      >
        Save count
      </button>
    </div>
  )
}
