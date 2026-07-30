import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom'
import HomePage from './pages/HomePage'
import UsersPage from './pages/masterData/UsersPage'
import UnitsPage from './pages/masterData/UnitsPage'
import ZonesPage from './pages/masterData/ZonesPage'
import MaterialsPage from './pages/masterData/MaterialsPage'
import ImportPage from './pages/masterData/ImportPage'
import StartInventoryPage from './pages/inventory/StartInventoryPage'
import ExportPage from './pages/ExportPage'

function MasterDataHome() {
  return (
    <div className="screen">
      <h1>Master Data</h1>
      <ul>
        <li><a href="/master-data/users">Users</a></li>
        <li><a href="/master-data/units">Units</a></li>
        <li><a href="/master-data/zones">Zones</a></li>
        <li><a href="/master-data/materials">Materials</a></li>
        <li><a href="/master-data/import">Import from CSV</a></li>
      </ul>
    </div>
  )
}

function StartInventoryRoute() {
  const navigate = useNavigate()
  return (
    <StartInventoryPage
      onStarted={(inventoryId, passId) => navigate(`/inventory/${inventoryId}/pass/${passId}/zone-picker`)}
    />
  )
}

function ExportRoute() {
  const { inventoryId } = useParams<{ inventoryId: string }>()
  return <ExportPage inventoryId={inventoryId!} />
}

function App() {
  return (
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
        <Route path="/inventory/:inventoryId/export" element={<ExportRoute />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
