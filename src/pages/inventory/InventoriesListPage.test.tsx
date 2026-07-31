import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../../db/schema'
import { CountingSessionProvider } from '../../context/CountingSession'
import { startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount, closePass } from '../../db/repositories/inventoryRepository'
import InventoriesListPage from './InventoriesListPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  window.localStorage.clear()
})

describe('InventoriesListPage', () => {
  it('lists inventories with a Resume link for in-progress ones and a View/Export link for closed ones', async () => {
    const { inventory: openInv } = await startInventory('Open Inventory', 'user-1')

    const { inventory: closedInv, pass } = await startInventory('Closed Inventory', 'user-1')
    const zc = await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')
    await setCountLine(zc.id, 'material-1', 5, 'user-1')
    await closeZoneCount(zc.id, 'user-1')
    await closePass(pass.id, 'user-1')
    await db.inventories.put({ ...(await db.inventories.get(closedInv.id))!, status: 'closed_single_pass' })

    render(
      <CountingSessionProvider>
        <MemoryRouter>
          <InventoriesListPage />
        </MemoryRouter>
      </CountingSessionProvider>,
    )

    expect(await screen.findByText('Open Inventory')).toBeInTheDocument()
    expect(screen.getByText('Closed Inventory')).toBeInTheDocument()

    const openRow = screen.getByText('Open Inventory').closest('li')!
    expect(within(openRow).getByRole('link', { name: /resume/i })).toHaveAttribute(
      'href',
      expect.stringContaining(`/inventory/${openInv.id}/pass/`),
    )

    const closedRow = screen.getByText('Closed Inventory').closest('li')!
    expect(within(closedRow).getByRole('link', { name: /view.*export/i })).toHaveAttribute(
      'href',
      `/inventory/${closedInv.id}/export`,
    )
  })

  it('filters to only in-progress inventories when linked with ?status=in_progress', async () => {
    await startInventory('Open Inventory', 'user-1')
    const { inventory: closedInv, pass } = await startInventory('Closed Inventory', 'user-1')
    const zc = await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')
    await setCountLine(zc.id, 'material-1', 5, 'user-1')
    await closeZoneCount(zc.id, 'user-1')
    await closePass(pass.id, 'user-1')
    await db.inventories.put({ ...(await db.inventories.get(closedInv.id))!, status: 'closed_single_pass' })

    render(
      <CountingSessionProvider>
        <MemoryRouter initialEntries={['/inventories?status=in_progress']}>
          <Routes>
            <Route path="/inventories" element={<InventoriesListPage />} />
          </Routes>
        </MemoryRouter>
      </CountingSessionProvider>,
    )

    expect(await screen.findByText('Open Inventory')).toBeInTheDocument()
    expect(screen.queryByText('Closed Inventory')).not.toBeInTheDocument()
  })

  it('filters to only completed inventories when linked with ?status=completed', async () => {
    await startInventory('Open Inventory', 'user-1')
    const { inventory: closedInv, pass } = await startInventory('Closed Inventory', 'user-1')
    const zc = await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')
    await setCountLine(zc.id, 'material-1', 5, 'user-1')
    await closeZoneCount(zc.id, 'user-1')
    await closePass(pass.id, 'user-1')
    await db.inventories.put({ ...(await db.inventories.get(closedInv.id))!, status: 'closed_single_pass' })

    render(
      <CountingSessionProvider>
        <MemoryRouter initialEntries={['/inventories?status=completed']}>
          <Routes>
            <Route path="/inventories" element={<InventoriesListPage />} />
          </Routes>
        </MemoryRouter>
      </CountingSessionProvider>,
    )

    expect(await screen.findByText('Closed Inventory')).toBeInTheDocument()
    expect(screen.queryByText('Open Inventory')).not.toBeInTheDocument()
  })
})
