import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import { createZone } from '../../db/repositories/zoneRepository'
import {
  startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount,
} from '../../db/repositories/inventoryRepository'
import ZonePickerPage from './ZonePickerPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('ZonePickerPage', () => {
  it('shows Not Started, In Progress, and Closed status chips for each zone in this pass', async () => {
    await createZone({ name: 'Warehouse A' })
    const zoneOpen = await createZone({ name: 'Warehouse B' })
    const zoneClosed = await createZone({ name: 'Warehouse C' })
    const { pass } = await startInventory('Inv', 'user-1')

    await getOrOpenZoneCount(pass.id, zoneOpen.id, 'user-1')

    const zcClosed = await getOrOpenZoneCount(pass.id, zoneClosed.id, 'user-1')
    await setCountLine(zcClosed.id, 'material-1', 5, 'user-1')
    await closeZoneCount(zcClosed.id, 'user-1')

    render(<ZonePickerPage passId={pass.id} onZoneChosen={vi.fn()} />)

    const notStartedRow = (await screen.findByText('Warehouse A')).closest('button')!
    expect(within(notStartedRow).getByText(/not started/i)).toBeInTheDocument()

    const openRow = screen.getByText('Warehouse B').closest('button')!
    expect(within(openRow).getByText(/in progress/i)).toBeInTheDocument()

    const closedRow = screen.getByText('Warehouse C').closest('button')!
    expect(within(closedRow).getByText(/closed/i)).toBeInTheDocument()
  })

  it('calls onZoneChosen when a zone button is clicked', async () => {
    const zone = await createZone({ name: 'Warehouse A' })
    const { pass } = await startInventory('Inv', 'user-1')

    const onZoneChosen = vi.fn()
    render(<ZonePickerPage passId={pass.id} onZoneChosen={onZoneChosen} />)

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /warehouse a/i }))

    expect(onZoneChosen).toHaveBeenCalledWith(zone.id)
  })
})
