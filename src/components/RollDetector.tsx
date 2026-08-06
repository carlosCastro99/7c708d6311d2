import { useRef, useState } from 'react'
import { detectRolls, estimateRadius, type Point, type RollDetectionResult, type RollDetectionEngine } from '../domain/rollDetection'
import { createOpenCvEngine } from '../domain/openCvRollDetectionEngine'
import ErrorBanner from './ErrorBanner'

interface RollDetectorProps {
  onAccept: (count: number) => void
  onCancel: () => void
  engineFactory?: () => Promise<RollDetectionEngine>
}

type Phase = 'capturing' | 'calibrating' | 'detecting' | 'result' | 'error'

export default function RollDetector({ onAccept, onCancel, engineFactory = createOpenCvEngine }: RollDetectorProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<Phase>('capturing')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([])
  const [result, setResult] = useState<RollDetectionResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handlePhotoSelected = (file: File) => {
    setPhotoUrl(URL.createObjectURL(file))
    setCalibrationPoints([])
    setResult(null)
    setErrorMessage(null)
    setPhase('calibrating')
  }

  const handleImageLoad = () => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d')?.drawImage(img, 0, 0)
  }

  const redrawPhoto = () => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return
    canvas.getContext('2d')?.drawImage(img, 0, 0)
  }

  const drawCircles = (circles: RollDetectionResult['circles']) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#00c853'
    ctx.lineWidth = 3
    for (const c of circles) {
      ctx.beginPath()
      ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  const runDetection = async (a: Point, b: Point) => {
    setPhase('detecting')
    try {
      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')!
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const engine = await engineFactory()
      const detection = detectRolls(imageData, estimateRadius(a, b), engine)
      setResult(detection)
      drawCircles(detection.circles)
      setPhase('result')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase !== 'calibrating') return
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const point = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
    const next = [...calibrationPoints, point]
    setCalibrationPoints(next)
    if (next.length === 2) {
      void runDetection(next[0], next[1])
    }
  }

  const retryCalibration = () => {
    setCalibrationPoints([])
    setResult(null)
    setErrorMessage(null)
    setPhase('calibrating')
    redrawPhoto()
  }

  return (
    <div className="roll-detector">
      {phase === 'capturing' && (
        <div className="form-row">
          <label htmlFor="roll-detector-photo-input">Take a photo of the position</label>
          <input
            id="roll-detector-photo-input"
            aria-label="Take a photo of the position"
            type="file"
            accept="image/*"
            capture="environment"
            className="tap-target"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handlePhotoSelected(file)
            }}
          />
        </div>
      )}

      {photoUrl && (
        <>
          <img ref={imgRef} src={photoUrl} onLoad={handleImageLoad} alt="" style={{ display: 'none' }} />
          {phase === 'calibrating' && <p>Tap the two edges of one roll to calibrate ({calibrationPoints.length}/2)</p>}
          {phase === 'detecting' && <p>Detecting rolls…</p>}
          {phase === 'error' && <ErrorBanner message={`Couldn't detect rolls automatically — enter the count manually. (${errorMessage})`} />}
          {phase === 'result' && result && <p>Detected: {result.count} roll{result.count === 1 ? '' : 's'}</p>}
          <canvas ref={canvasRef} onClick={handleCanvasClick} style={{ maxWidth: '100%', touchAction: 'manipulation' }} />
        </>
      )}

      <div className="action-row">
        {phase === 'result' && result && (
          <button type="button" onClick={() => onAccept(result.count)}>Use {result.count}</button>
        )}
        {(phase === 'result' || phase === 'error') && (
          <button type="button" className="secondary" onClick={retryCalibration}>Retry calibration</button>
        )}
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
