import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../../db/schema'
import { deleteInventory } from '../../db/repositories/inventoryRepository'
import { useCountingSession } from '../../context/CountingSession'
import ErrorBanner from '../../components/ErrorBanner'
import type { Inventory, InventoryPass, InventoryStatus } from '../../db/types'

const IN_PROGRESS_STATUSES = ['in_progress', 'needs_3rd_pass']
const COMPLETED_STATUSES = ['closed_single_pass', 'successful']

const STATUS_INFO: Record<InventoryStatus, { label: string; chipClass: string }> = {
  in_progress: { label: 'In Progress', chipClass: 'status-chip-info' },
  needs_3rd_pass: { label: 'Needs 3rd Pass', chipClass: 'status-chip-warning' },
  closed_single_pass: { label: 'Closed', chipClass: 'status-chip-neutral' },
  successful: { label: 'Successful', chipClass: 'status-chip-success' },
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function InventoriesListPage() {
  const { setSession } = useCountingSession()
  const [rows, setRows] = useState<Array<{ inventory: Inventory; currentPass: InventoryPass | undefined }>>([])
  const [searchParams] = useSearchParams()
  const statusFilter = searchParams.get('status')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    const inventories = (await db.inventories.toArray()).sort((a, b) => b.createdAt - a.createdAt)
    const withPasses = await Promise.all(
      inventories.map(async (inventory) => {
        const passes = await db.passes.where('inventoryId').equals(inventory.id).toArray()
        const currentPass = passes.sort((a, b) => b.passNumber - a.passNumber)[0]
        return { inventory, currentPass }
      }),
    )
    setRows(withPasses)
  }

  useEffect(() => {
    refresh()
  }, [])

  const confirmDelete = async (id: string) => {
    try {
      await deleteInventory(id)
      setPendingDeleteId(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPendingDeleteId(null)
    }
  }

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
      {error && <ErrorBanner message={error} />}
      {statusFilter && (
        <Link to="/inventories" className="link-button">Show all</Link>
      )}
      <ul>
        {filteredRows.map(({ inventory, currentPass }) => {
          const { label, chipClass } = STATUS_INFO[inventory.status]
          const dateLabel = inventory.closedAt
            ? `Closed ${formatDate(inventory.closedAt)}`
            : `Started ${formatDate(inventory.createdAt)}`

          if (pendingDeleteId === inventory.id) {
            return (
              <li key={inventory.id} className="list-item edit-row">
                <div className="edit-row-form">
                  <p>Permanently delete "{inventory.name}" and everything counted in it? This cannot be undone.</p>
                  <div className="action-row">
                    <button type="button" className="danger" onClick={() => confirmDelete(inventory.id)}>Confirm delete</button>
                    <button type="button" className="secondary" onClick={() => setPendingDeleteId(null)}>Cancel</button>
                  </div>
                </div>
              </li>
            )
          }

          return (
            <li key={inventory.id} className="list-item inventory-row">
              <div className="inventory-row-main">
                <span className="inventory-row-name">{inventory.name}</span>
                <span className={`status-chip ${chipClass}`}>{label}</span>
              </div>
              <div className="inventory-row-meta">
                <span className="on-surface-variant">{dateLabel}</span>
                {(inventory.status === 'in_progress' || inventory.status === 'needs_3rd_pass') && currentPass && (
                  <Link
                    to={`/inventory/${inventory.id}/pass/${currentPass.id}`}
                    onClick={() => setSession({ userId: inventory.createdByUserId, inventoryId: inventory.id, passId: currentPass.id })}
                    className="link-button"
                  >
                    Resume
                  </Link>
                )}
                {(inventory.status === 'closed_single_pass' || inventory.status === 'successful') && (
                  <Link to={`/inventory/${inventory.id}/export`} className="link-button">View / Export</Link>
                )}
                <button type="button" className="danger" onClick={() => setPendingDeleteId(inventory.id)}>Delete</button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
