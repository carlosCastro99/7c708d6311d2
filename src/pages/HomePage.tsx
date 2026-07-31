import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/schema'

interface Kpis {
  inProgress: number
  completed: number
  zones: number
  materials: number
}

export default function HomePage() {
  const [kpis, setKpis] = useState<Kpis | null>(null)

  useEffect(() => {
    (async () => {
      const [inventories, zones, materials] = await Promise.all([
        db.inventories.toArray(),
        db.zones.count(),
        db.materials.count(),
      ])
      const inProgress = inventories.filter((i) => i.status === 'in_progress' || i.status === 'needs_3rd_pass').length
      const completed = inventories.filter((i) => i.status === 'closed_single_pass' || i.status === 'successful').length
      setKpis({ inProgress, completed, zones, materials })
    })()
  }, [])

  return (
    <div className="screen">
      <h1>MX Inventory</h1>

      <div className="kpi-grid">
        <div className="kpi-tile">
          <div className="kpi-value">{kpis?.inProgress ?? '—'}</div>
          <div className="kpi-label">In progress</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-value">{kpis?.completed ?? '—'}</div>
          <div className="kpi-label">Completed</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-value">{kpis?.zones ?? '—'}</div>
          <div className="kpi-label">Zones</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-value">{kpis?.materials ?? '—'}</div>
          <div className="kpi-label">Materials</div>
        </div>
      </div>

      <Link to="/inventory/new" className="primary-cta">+ New Inventory</Link>
    </div>
  )
}
