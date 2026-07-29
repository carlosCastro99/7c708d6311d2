import { useEffect, useState } from 'react'
import { listUsers } from '../../db/repositories/userRepository'
import { startInventory } from '../../db/repositories/inventoryRepository'
import type { User } from '../../db/types'

interface StartInventoryPageProps {
  onStarted: (inventoryId: string, passId: string) => void
}

export default function StartInventoryPage({ onStarted }: StartInventoryPageProps) {
  const [users, setUsers] = useState<User[]>([])
  const [userId, setUserId] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    listUsers().then((u) => {
      setUsers(u)
      if (u.length > 0) setUserId(u[0].id)
    })
  }, [])

  return (
    <div className="screen">
      <h1>Start Inventory</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!userId || !name.trim()) return
          const { inventory, pass } = await startInventory(name.trim(), userId)
          onStarted(inventory.id, pass.id)
        }}
      >
        <div className="form-row">
          <label htmlFor="start-inv-user">User</label>
          <select id="start-inv-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="start-inv-name">Inventory name</label>
          <input id="start-inv-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="submit">Start inventory</button>
      </form>
    </div>
  )
}
