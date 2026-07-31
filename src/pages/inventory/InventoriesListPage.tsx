import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../db/schema'
import { useCountingSession } from '../../context/CountingSession'
import type { Inventory, InventoryPass } from '../../db/types'

export default function InventoriesListPage() {
  const { setSession } = useCountingSession()
  const [rows, setRows] = useState<Array<{ inventory: Inventory; currentPass: InventoryPass | undefined }>>([])

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

  return (
    <div className="screen">
      <h1>Inventories</h1>
      <ul>
        {rows.map(({ inventory, currentPass }) => (
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
