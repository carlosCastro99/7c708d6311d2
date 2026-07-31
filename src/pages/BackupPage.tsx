import { useEffect, useState } from 'react'
import { exportBackup, importBackup, clearAllData } from '../domain/backup'
import { useAsyncAction } from '../hooks/useAsyncAction'
import ErrorBanner from '../components/ErrorBanner'

export default function BackupPage() {
  const [exportUrl, setExportUrl] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const [runExport, exportState] = useAsyncAction(async () => {
    const blob = await exportBackup()
    setExportUrl(URL.createObjectURL(blob))
  })

  // The first test in BackupPage.test.tsx expects the "Export backup" link
  // to already be present without any click -- generate one automatically on
  // mount. The manual button below still lets the user regenerate a fresh
  // export after making more changes, without needing to reload the page.
  useEffect(() => {
    runExport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [confirmImport, importState] = useAsyncAction(async () => {
    if (!pendingFile) return
    await clearAllData()
    await importBackup(pendingFile)
    setPendingFile(null)
  })

  const error = exportState.error ?? importState.error

  return (
    <div className="screen">
      <h1>Backup</h1>
      {error && <ErrorBanner message={error.message} />}

      <div className="form-row">
        <button type="button" disabled={exportState.pending} onClick={() => runExport()}>
          Export backup
        </button>
        {exportUrl && (
          <a href={exportUrl} download="mx-inventory-backup.zip">Export backup</a>
        )}
      </div>

      <div className="form-row">
        <label htmlFor="restore-backup-input">Restore from backup</label>
        <input
          id="restore-backup-input"
          aria-label="Restore from backup"
          type="file"
          accept=".zip"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) setPendingFile(file)
          }}
        />
      </div>

      {pendingFile && (
        <div className="form-row">
          <p>This replaces all data currently on this device — continue?</p>
          <button type="button" disabled={importState.pending} onClick={() => confirmImport()}>
            Confirm
          </button>
          <button type="button" className="secondary" onClick={() => setPendingFile(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
