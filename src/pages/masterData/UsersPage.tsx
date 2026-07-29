import { useEffect, useState } from 'react'
import { createUser, listUsers } from '../../db/repositories/userRepository'
import type { User } from '../../db/types'

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [name, setName] = useState('')

  const refresh = () => listUsers().then(setUsers)

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="screen">
      <h1>Users</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          await createUser(name.trim())
          setName('')
          await refresh()
        }}
      >
        <div className="form-row">
          <label htmlFor="user-name">Name</label>
          <input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="submit">Add user</button>
      </form>
      <ul>
        {users.map((u) => (
          <li key={u.id} className="list-item">{u.name}</li>
        ))}
      </ul>
    </div>
  )
}
