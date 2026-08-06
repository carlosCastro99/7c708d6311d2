import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import { createUnit } from '../../db/repositories/unitRepository'
import { createMaterial } from '../../db/repositories/materialRepository'
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

  it('edits an existing unit', async () => {
    await createUnit('KG', 'Kilogram')
    const user = userEvent.setup()
    render(<UnitsPage />)

    await screen.findByText(/KG.*Kilogram/i)
    await user.click(screen.getByRole('button', { name: /edit/i }))
    const codeInput = screen.getByLabelText(/edit code/i)
    await user.clear(codeInput)
    await user.type(codeInput, 'KGM')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText(/KGM.*Kilogram/i)).toBeInTheDocument()
  })

  it('deletes a unit after confirming', async () => {
    await createUnit('KG', 'Kilogram')
    const user = userEvent.setup()
    render(<UnitsPage />)

    await screen.findByText(/KG.*Kilogram/i)
    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.click(await screen.findByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(screen.queryByText(/KG.*Kilogram/i)).not.toBeInTheDocument())
  })

  it('shows an error and keeps the unit when deleting one that is in use', async () => {
    const unit = await createUnit('KG', 'Kilogram')
    await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const user = userEvent.setup()
    render(<UnitsPage />)

    await screen.findByText(/KG.*Kilogram/i)
    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.click(await screen.findByRole('button', { name: /confirm delete/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/in use|used by/i)
    expect(screen.getByText(/KG.*Kilogram/i)).toBeInTheDocument()
  })
})
