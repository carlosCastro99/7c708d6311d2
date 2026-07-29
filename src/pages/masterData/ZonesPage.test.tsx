import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import ZonesPage from './ZonesPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('ZonesPage', () => {
  it('adds a zone with an optional SAP storage location', async () => {
    const user = userEvent.setup()
    render(<ZonesPage />)

    await user.type(screen.getByLabelText(/zone name/i), 'Warehouse A')
    await user.type(screen.getByLabelText(/sap storage location/i), 'SL01')
    await user.click(screen.getByRole('button', { name: /add zone/i }))

    expect(await screen.findByText(/Warehouse A/)).toBeInTheDocument()
  })
})
