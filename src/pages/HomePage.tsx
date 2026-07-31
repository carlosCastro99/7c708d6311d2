import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div className="screen">
      <h1>MX Inventory</h1>
      <ul>
        <li><Link to="/inventory/new">Start Inventory</Link></li>
        <li><Link to="/inventories">Inventories</Link></li>
        <li><Link to="/master-data">Master Data</Link></li>
        <li><Link to="/backup">Backup</Link></li>
      </ul>
    </div>
  )
}
