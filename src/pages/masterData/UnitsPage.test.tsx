import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import UnitsPage from './UnitsPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('UnitsPage', () => {
  it('adds a unit and shows it in the list', async () => {
    const user = userEvent.setup()
    render(<UnitsPage />)

    await user.type(screen.getByLabelText(/code/i), 'KG')
    await user.type(screen.getByLabelText(/label/i), 'Kilogram')
    await user.click(screen.getByRole('button', { name: /add unit/i }))

    expect(await screen.findByText(/KG.*Kilogram/i)).toBeInTheDocument()
  })
})
