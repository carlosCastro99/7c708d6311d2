import { BrowserRouter, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom'
import { CountingSessionProvider, useCountingSession } from './context/CountingSession'
import HomePage from './pages/HomePage'
import UsersPage from './pages/masterData/UsersPage'
import UnitsPage from './pages/masterData/UnitsPage'
import ZonesPage from './pages/masterData/ZonesPage'
import MaterialsPage from './pages/masterData/MaterialsPage'
import ImportPage from './pages/masterData/ImportPage'
import StartInventoryPage from './pages/inventory/StartInventoryPage'
import CountingWizard from './pages/inventory/CountingWizard'
import InventoriesListPage from './pages/inventory/InventoriesListPage'
import ExportPage from './pages/ExportPage'
import BackupPage from './pages/BackupPage'

function MasterDataHome() {
  return (
    <div className="screen">
      <h1>Master Data</h1>
      <ul>
        <li><Link to="/master-data/users">Users</Link></li>
        <li><Link to="/master-data/units">Units</Link></li>
        <li><Link to="/master-data/zones">Zones</Link></li>
        <li><Link to="/master-data/materials">Materials</Link></li>
        <li><Link to="/master-data/import">Import from CSV</Link></li>
      </ul>
    </div>
  )
}

function StartInventoryRoute() {
  const navigate = useNavigate()
  const { setSession } = useCountingSession()
  return (
    <StartInventoryPage
      onStarted={(inventoryId, passId, userId) => {
        setSession({ userId, inventoryId, passId })
        navigate(`/inventory/${inventoryId}/pass/${passId}`)
      }}
    />
  )
}

function ExportRoute() {
  const { inventoryId } = useParams<{ inventoryId: string }>()
  return <ExportPage inventoryId={inventoryId!} />
}

function App() {
  return (
    <CountingSessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/master-data" element={<MasterDataHome />} />
          <Route path="/master-data/users" element={<UsersPage />} />
          <Route path="/master-data/units" element={<UnitsPage />} />
          <Route path="/master-data/zones" element={<ZonesPage />} />
          <Route path="/master-data/materials" element={<MaterialsPage />} />
          <Route path="/master-data/import" element={<ImportPage />} />
          <Route path="/inventory/new" element={<StartInventoryRoute />} />
          <Route path="/inventory/:inventoryId/pass/:passId" element={<CountingWizard />} />
          <Route path="/inventory/:inventoryId/export" element={<ExportRoute />} />
          <Route path="/inventories" element={<InventoriesListPage />} />
          <Route path="/backup" element={<BackupPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </BrowserRouter>
    </CountingSessionProvider>
  )
}

export default App
