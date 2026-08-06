import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import { createUser } from '../../db/repositories/userRepository'
import { startInventory } from '../../db/repositories/inventoryRepository'
import UsersPage from './UsersPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('UsersPage', () => {
  it('adds a user and shows it in the list', async () => {
    const user = userEvent.setup()
    render(<UsersPage />)

    await user.type(screen.getByLabelText(/name/i), 'Alex')
    await user.click(screen.getByRole('button', { name: /add user/i }))

    expect(await screen.findByText('Alex')).toBeInTheDocument()
  })

  it('edits an existing user', async () => {
    await createUser('Alex')
    const user = userEvent.setup()
    render(<UsersPage />)

    await screen.findByText('Alex')
    await user.click(screen.getByRole('button', { name: /edit/i }))
    const nameInput = screen.getByLabelText(/edit name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Alexandra')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText('Alexandra')).toBeInTheDocument()
  })

  it('deletes a user after confirming', async () => {
    await createUser('Alex')
    const user = userEvent.setup()
    render(<UsersPage />)

    await screen.findByText('Alex')
    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.click(await screen.findByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(screen.queryByText('Alex')).not.toBeInTheDocument())
  })

  it('shows an error and keeps the user when deleting one already involved in an inventory', async () => {
    const createdUser = await createUser('Alex')
    await startInventory('Inv', createdUser.id)
    const user = userEvent.setup()
    render(<UsersPage />)

    await screen.findByText('Alex')
    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.click(await screen.findByRole('button', { name: /confirm delete/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/in use|already been involved/i)
    expect(screen.getByText('Alex')).toBeInTheDocument()
  })
})
