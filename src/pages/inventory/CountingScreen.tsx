import { useState } from 'react'
import { setCountLine } from '../../db/repositories/inventoryRepository'
import { savePhoto } from '../../db/repositories/photoRepository'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import ErrorBanner from '../../components/ErrorBanner'
import TapCounter from '../../components/TapCounter'
import PhotoCapture from '../../components/PhotoCapture'
import RollDetector from '../../components/RollDetector'

interface CountingScreenProps {
  zoneCountId: string
  materialId: string
  userId: string
  expectedQuantity?: number
  initialQuantity: number
  onSaved: () => void
  onBack: () => void
}

export default function CountingScreen({
  zoneCountId, materialId, userId, expectedQuantity, initialQuantity, onSaved, onBack,
}: CountingScreenProps) {
  const [quantity, setQuantity] = useState(initialQuantity)
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [lotNumber, setLotNumber] = useState('')
  const [showBackChoice, setShowBackChoice] = useState(false)
  const [showRollDetector, setShowRollDetector] = useState(false)

  const persistCount = async () => {
    const photoBlobId = photoBlob ? await savePhoto(photoBlob) : undefined
    await setCountLine(zoneCountId, materialId, quantity, userId, expectedQuantity, photoBlobId, lotNumber.trim() || undefined)
  }

  const [save, { pending, error }] = useAsyncAction(async () => {
    await persistCount()
    onSaved()
  })

  const [saveAndBack, { pending: backPending, error: backError }] = useAsyncAction(async () => {
    await persistCount()
    onBack()
  })

  const handleBackClick = () => {
    if (quantity !== initialQuantity) {
      setShowBackChoice(true)
    } else {
      onBack()
    }
  }

  return (
    <div className="screen">
      <div className="action-row" style={{ marginBottom: 0 }}>
        <button type="button" className="secondary" onClick={handleBackClick}>
          ‹ Back
        </button>
      </div>
      <h1>Count</h1>
      {(error ?? backError) && <ErrorBanner message={(error ?? backError)!.message} />}
      {expectedQuantity !== undefined && (
        <p>
          Expected: {expectedQuantity}{' '}
          {Math.abs(quantity - expectedQuantity) / Math.max(expectedQuantity, 1) > 0.1 && (
            <span className="variance-warning">Variance: {quantity - expectedQuantity}</span>
          )}
        </p>
      )}
      <TapCounter value={quantity} onChange={setQuantity} />

      {!showRollDetector && (
        <button type="button" className="secondary" onClick={() => setShowRollDetector(true)}>
          📷 Count using camera
        </button>
      )}
      {showRollDetector && (
        <RollDetector
          onAccept={(count) => {
            setQuantity(count)
            setShowRollDetector(false)
          }}
          onCancel={() => setShowRollDetector(false)}
        />
      )}

      <div className="form-row">
        <label htmlFor="counting-lot-number">Lot / batch number (optional)</label>
        <input
          id="counting-lot-number"
          value={lotNumber}
          onChange={(e) => setLotNumber(e.target.value)}
        />
      </div>
      <PhotoCapture onCapture={setPhotoBlob} />

      {showBackChoice && (
        <div role="alert" className="confirm-banner">
          <p>You have an unsaved count of {quantity}. Save it before going back?</p>
          <div className="action-row" style={{ margin: 0 }}>
            <button type="button" disabled={backPending} onClick={() => saveAndBack()}>
              Save &amp; go back
            </button>
            <button type="button" className="secondary" onClick={() => onBack()}>
              Discard &amp; go back
            </button>
            <button type="button" className="secondary" onClick={() => setShowBackChoice(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <button type="button" disabled={pending} onClick={() => save()}>
        Save count
      </button>
    </div>
  )
}
