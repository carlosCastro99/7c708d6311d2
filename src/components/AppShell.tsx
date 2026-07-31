import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Logo from './Logo'

interface AppShellProps {
  children: ReactNode
}

const NAV_LINKS = [
  { to: '/inventory/new', label: 'Start Inventory' },
  { to: '/inventories', label: 'Inventories' },
  { to: '/master-data', label: 'Master Data' },
  { to: '/backup', label: 'Backup' },
]

export default function AppShell({ children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const isHome = location.pathname === '/'

  return (
    <div className="app-shell">
      <header className="app-bar">
        {isHome ? (
          <button
            type="button"
            className="app-bar-icon"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
          >
            ☰
          </button>
        ) : (
          <button
            type="button"
            className="app-bar-icon"
            aria-label="Back"
            onClick={() => navigate(-1)}
          >
            ‹
          </button>
        )}
        <Logo />
        <span className="app-bar-title">MX Inventory</span>
      </header>

      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <nav className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <Logo size={24} />
              <span>MX Inventory</span>
            </div>
            <ul className="nav-list">
              {NAV_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} onClick={() => setDrawerOpen(false)}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}

      <main className="app-content">{children}</main>
    </div>
  )
}
