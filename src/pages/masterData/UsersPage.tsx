import { useEffect, useState } from 'react'
import { createUser, listUsers, updateUser, deleteUser } from '../../db/repositories/userRepository'
import ErrorBanner from '../../components/ErrorBanner'
import type { User } from '../../db/types'

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => listUsers().then(setUsers)

  useEffect(() => {
    refresh()
  }, [])

  const startEdit = (user: User) => {
    setEditingId(user.id)
    setEditName(user.name)
    setError(null)
  }

  const saveEdit = async () => {
    if (!editName.trim()) return
    await updateUser(editingId!, editName.trim())
    setEditingId(null)
    await refresh()
  }

  const confirmDelete = async (id: string) => {
    try {
      await deleteUser(id)
      setPendingDeleteId(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPendingDeleteId(null)
    }
  }

  return (
    <div className="screen">
      <h1>Users</h1>
      {error && <ErrorBanner message={error} />}
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
          <li key={u.id} className="list-item edit-row">
            {editingId === u.id ? (
              <div className="edit-row-form">
                <input aria-label={`Edit name for ${u.name}`} value={editName} onChange={(e) => setEditName(e.target.value)} />
                <div className="action-row">
                  <button type="button" onClick={saveEdit}>Save</button>
                  <button type="button" className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : pendingDeleteId === u.id ? (
              <div className="edit-row-form">
                <p>Delete {u.name}? This cannot be undone.</p>
                <div className="action-row">
                  <button type="button" className="danger" onClick={() => confirmDelete(u.id)}>Confirm delete</button>
                  <button type="button" className="secondary" onClick={() => setPendingDeleteId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <span>{u.name}</span>
                <div className="action-row" style={{ margin: 0 }}>
                  <button type="button" className="secondary" onClick={() => startEdit(u)}>Edit</button>
                  <button type="button" className="danger" onClick={() => setPendingDeleteId(u.id)}>Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
