import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

interface BarcodeScannerProps {
  onDetected: (value: string) => void
}

export default function BarcodeScanner({ onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    if (!scanning || !videoRef.current) return
    const reader = new BrowserMultiFormatReader()
    let stop: (() => void) | undefined

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result) {
          onDetected(result.getText())
          setScanning(false)
        }
      })
      .then((controls) => {
        stop = () => controls.stop()
      })
      .catch(() => setScanning(false))

    return () => stop?.()
  }, [scanning, onDetected])

  return (
    <div className="form-row">
      {!scanning && (
        <button type="button" className="secondary" onClick={() => setScanning(true)}>
          Scan barcode / QR
        </button>
      )}
      {scanning && (
        <>
          <video ref={videoRef} style={{ width: '100%' }} />
          <button type="button" className="secondary" onClick={() => setScanning(false)}>
            Cancel scan
          </button>
        </>
      )}
    </div>
  )
}
