import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import { createUser } from '../../db/repositories/userRepository'
import StartInventoryPage from './StartInventoryPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('StartInventoryPage', () => {
  it('starts an inventory for the chosen user and name', async () => {
    await createUser('Alex')
    const onStarted = vi.fn()
    const user = userEvent.setup()
    render(<StartInventoryPage onStarted={onStarted} />)

    const userSelect = await screen.findByLabelText(/user/i)
    await screen.findByRole('option', { name: 'Alex' })
    await user.selectOptions(userSelect, 'Alex')
    await user.type(screen.getByLabelText(/inventory name/i), 'Q3 Paper Warehouse')
    await user.click(screen.getByRole('button', { name: /start inventory/i }))

    await waitFor(() => {
      expect(onStarted).toHaveBeenCalledWith(expect.any(String), expect.any(String))
    })
  })
})
