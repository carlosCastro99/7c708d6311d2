import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../../db/schema'
import { useCountingSession } from '../../context/CountingSession'
import type { Inventory, InventoryPass } from '../../db/types'

const IN_PROGRESS_STATUSES = ['in_progress', 'needs_3rd_pass']
const COMPLETED_STATUSES = ['closed_single_pass', 'successful']

export default function InventoriesListPage() {
  const { setSession } = useCountingSession()
  const [rows, setRows] = useState<Array<{ inventory: Inventory; currentPass: InventoryPass | undefined }>>([])
  const [searchParams] = useSearchParams()
  const statusFilter = searchParams.get('status')

  useEffect(() => {
    (async () => {
      const inventories = (await db.inventories.toArray()).sort((a, b) => b.createdAt - a.createdAt)
      const withPasses = await Promise.all(
        inventories.map(async (inventory) => {
          const passes = await db.passes.where('inventoryId').equals(inventory.id).toArray()
          const currentPass = passes.sort((a, b) => b.passNumber - a.passNumber)[0]
          return { inventory, currentPass }
        }),
      )
      setRows(withPasses)
    })()
  }, [])

  const filteredRows = rows.filter(({ inventory }) => {
    if (statusFilter === 'in_progress') return IN_PROGRESS_STATUSES.includes(inventory.status)
    if (statusFilter === 'completed') return COMPLETED_STATUSES.includes(inventory.status)
    return true
  })

  const heading = statusFilter === 'in_progress'
    ? 'Inventories — In Progress'
    : statusFilter === 'completed'
      ? 'Inventories — Completed'
      : 'Inventories'

  return (
    <div className="screen">
      <h1>{heading}</h1>
      {statusFilter && (
        <Link to="/inventories" className="link-button">Show all</Link>
      )}
      <ul>
        {filteredRows.map(({ inventory, currentPass }) => (
          <li key={inventory.id} className="list-item">
            <span>{inventory.name}</span> <span>({inventory.status})</span>
            {(inventory.status === 'in_progress' || inventory.status === 'needs_3rd_pass') && currentPass && (
              <Link
                to={`/inventory/${inventory.id}/pass/${currentPass.id}`}
                onClick={() => setSession({ userId: inventory.createdByUserId, inventoryId: inventory.id, passId: currentPass.id })}
              >
                Resume
              </Link>
            )}
            {(inventory.status === 'closed_single_pass' || inventory.status === 'successful') && (
              <Link to={`/inventory/${inventory.id}/export`}>View / Export</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
