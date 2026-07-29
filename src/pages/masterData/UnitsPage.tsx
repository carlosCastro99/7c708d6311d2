import { useEffect, useState } from 'react'
import { createUnit, listUnits } from '../../db/repositories/unitRepository'
import type { UnitOfMeasure } from '../../db/types'

export default function UnitsPage() {
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')

  const refresh = () => listUnits().then(setUnits)

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="screen">
      <h1>Units of Measure</h1>
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
          <li key={u.id} className="list-item">{u.code} — {u.label}</li>
        ))}
      </ul>
    </div>
  )
}
