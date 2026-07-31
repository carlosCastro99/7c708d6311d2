import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/schema'
import Logo from '../components/Logo'
import PaperRollsDecoration from '../components/PaperRollsDecoration'

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
    <div className="screen home-screen">
      <PaperRollsDecoration />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--md-space-1)', color: 'var(--md-primary)' }}>
        <Logo size={32} />
        <h1 style={{ margin: 0, color: 'var(--md-on-surface)' }}>MX Inventory</h1>
      </div>

      <div className="kpi-grid">
        <Link to="/inventories?status=in_progress" className="kpi-tile">
          <div className="kpi-value">{kpis?.inProgress ?? '—'}</div>
          <div className="kpi-label">In progress</div>
        </Link>
        <Link to="/inventories?status=completed" className="kpi-tile">
          <div className="kpi-value">{kpis?.completed ?? '—'}</div>
          <div className="kpi-label">Completed</div>
        </Link>
        <Link to="/master-data/zones" className="kpi-tile">
          <div className="kpi-value">{kpis?.zones ?? '—'}</div>
          <div className="kpi-label">Zones</div>
        </Link>
        <Link to="/master-data/materials" className="kpi-tile">
          <div className="kpi-value">{kpis?.materials ?? '—'}</div>
          <div className="kpi-label">Materials</div>
        </Link>
      </div>

      <Link to="/inventory/new" className="primary-cta">+ New Inventory</Link>
    </div>
  )
}
