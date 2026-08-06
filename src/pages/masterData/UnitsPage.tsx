import { useEffect, useState } from 'react'
import { createUnit, listUnits, updateUnit, deleteUnit } from '../../db/repositories/unitRepository'
import ErrorBanner from '../../components/ErrorBanner'
import type { UnitOfMeasure } from '../../db/types'

export default function UnitsPage() {
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => listUnits().then(setUnits)

  useEffect(() => {
    refresh()
  }, [])

  const startEdit = (unit: UnitOfMeasure) => {
    setEditingId(unit.id)
    setEditCode(unit.code)
    setEditLabel(unit.label)
    setError(null)
  }

  const saveEdit = async () => {
    if (!editCode.trim() || !editLabel.trim()) return
    await updateUnit(editingId!, { code: editCode.trim().toUpperCase(), label: editLabel.trim() })
    setEditingId(null)
    await refresh()
  }

  const confirmDelete = async (id: string) => {
    try {
      await deleteUnit(id)
      setPendingDeleteId(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPendingDeleteId(null)
    }
  }

  return (
    <div className="screen">
      <h1>Units of Measure</h1>
      {error && <ErrorBanner message={error} />}
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!code.trim() || !label.trim()) return
          await createUnit(code.trim().toUpperCase(), label.trim())
          setCode('')
          setLabel('')
          await refresh()
        }}
      >
        <div className="form-row">
          <label htmlFor="unit-code">Code</label>
          <input id="unit-code" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="unit-label">Label</label>
          <input id="unit-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <button type="submit">Add unit</button>
      </form>
      <ul>
        {units.map((u) => (
          <li key={u.id} className="list-item edit-row">
            {editingId === u.id ? (
              <div className="edit-row-form">
                <input aria-label={`Edit code for ${u.code}`} value={editCode} onChange={(e) => setEditCode(e.target.value)} />
                <input aria-label={`Edit label for ${u.code}`} value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                <div className="action-row">
                  <button type="button" onClick={saveEdit}>Save</button>
                  <button type="button" className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : pendingDeleteId === u.id ? (
              <div className="edit-row-form">
                <p>Delete {u.code} — {u.label}? This cannot be undone.</p>
                <div className="action-row">
                  <button type="button" className="danger" onClick={() => confirmDelete(u.id)}>Confirm delete</button>
                  <button type="button" className="secondary" onClick={() => setPendingDeleteId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <span>{u.code} — {u.label}</span>
                <div className="action-row" style={{ margin: 0 }}>
                  <button type="button" className="secondary" onClick={() => startEdit(u)}>Edit</button>
                  <button type="button" className="danger" onClick={() => setPendingDeleteId(u.id)}>Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
