import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import { createZone } from '../../db/repositories/zoneRepository'
import { startInventory, getOrOpenZoneCount } from '../../db/repositories/inventoryRepository'
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

  it('edits an existing zone', async () => {
    await createZone({ name: 'Warehouse A' })
    const user = userEvent.setup()
    render(<ZonesPage />)

    await screen.findByText('Warehouse A')
    await user.click(screen.getByRole('button', { name: /edit/i }))
    const nameInput = screen.getByLabelText(/edit name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Warehouse A1')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText('Warehouse A1')).toBeInTheDocument()
  })

  it('deletes a zone after confirming', async () => {
    await createZone({ name: 'Warehouse A' })
    const user = userEvent.setup()
    render(<ZonesPage />)

    await screen.findByText('Warehouse A')
    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.click(await screen.findByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(screen.queryByText('Warehouse A')).not.toBeInTheDocument())
  })

  it('shows an error and keeps the zone when deleting one already used in a count', async () => {
    const zone = await createZone({ name: 'Warehouse A' })
    const { pass } = await startInventory('Inv', 'user-1')
    await getOrOpenZoneCount(pass.id, zone.id, 'user-1')
    const user = userEvent.setup()
    render(<ZonesPage />)

    await screen.findByText('Warehouse A')
    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.click(await screen.findByRole('button', { name: /confirm delete/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/in use|already been used/i)
    expect(screen.getByText('Warehouse A')).toBeInTheDocument()
  })
})
