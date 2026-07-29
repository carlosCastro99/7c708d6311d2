import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
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
})
