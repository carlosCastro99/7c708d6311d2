interface PhotoCaptureProps {
  onCapture: (blob: Blob) => void
  existingPhotoUrl?: string
}

export default function PhotoCapture({ onCapture, existingPhotoUrl }: PhotoCaptureProps) {
  return (
    <div className="form-row">
      <label htmlFor="photo-capture-input">Add photo (optional)</label>
      <input
        id="photo-capture-input"
        aria-label="Add photo"
        type="file"
        accept="image/*"
        capture="environment"
        className="tap-target"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onCapture(file)
        }}
      />
      {existingPhotoUrl && <img src={existingPhotoUrl} alt="Captured" style={{ maxWidth: '100%' }} />}
    </div>
  )
}
