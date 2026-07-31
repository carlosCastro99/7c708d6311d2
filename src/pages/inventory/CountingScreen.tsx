import { useState } from 'react'
import { setCountLine } from '../../db/repositories/inventoryRepository'
import { savePhoto } from '../../db/repositories/photoRepository'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import ErrorBanner from '../../components/ErrorBanner'
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
  const [lotNumber, setLotNumber] = useState('')

  const [save, { pending, error }] = useAsyncAction(async () => {
    const photoBlobId = photoBlob ? await savePhoto(photoBlob) : undefined
    await setCountLine(zoneCountId, materialId, quantity, userId, expectedQuantity, photoBlobId, lotNumber.trim() || undefined)
    onSaved()
  })

  return (
    <div className="screen">
      <h1>Count</h1>
      {error && <ErrorBanner message={error.message} />}
      {expectedQuantity !== undefined && (
        <p>
          Expected: {expectedQuantity}{' '}
          {Math.abs(quantity - expectedQuantity) / Math.max(expectedQuantity, 1) > 0.1 && (
            <span className="variance-warning">Variance: {quantity - expectedQuantity}</span>
          )}
        </p>
      )}
      <TapCounter value={quantity} onChange={setQuantity} />
      <div className="form-row">
        <label htmlFor="counting-lot-number">Lot / batch number (optional)</label>
        <input
          id="counting-lot-number"
          value={lotNumber}
          onChange={(e) => setLotNumber(e.target.value)}
        />
      </div>
      <PhotoCapture onCapture={setPhotoBlob} />
      <button type="button" disabled={pending} onClick={() => save()}>
        Save count
      </button>
    </div>
  )
}
