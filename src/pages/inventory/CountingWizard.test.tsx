import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../../db/schema'
import { CountingSessionProvider } from '../../context/CountingSession'
import { createZone } from '../../db/repositories/zoneRepository'
import { createUnit } from '../../db/repositories/unitRepository'
import { createMaterial } from '../../db/repositories/materialRepository'
import { startInventory } from '../../db/repositories/inventoryRepository'
import CountingWizard from './CountingWizard'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  window.localStorage.clear()
})

describe('CountingWizard', () => {
  it('walks zone pick -> material pick -> count -> zone summary -> close zone', async () => {
    const zone = await createZone({ name: 'Warehouse A' })
    const unit = await createUnit('KG', 'Kilogram')
    const material = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const { inventory, pass } = await startInventory('Inv', 'user-1')

    // Seed the session the same way CountingSessionProvider reads it on mount
    // (see Task 2), rather than calling setSession during another component's
    // render, which React does not guarantee handles cleanly.
    window.localStorage.setItem(
      'mx-inventory-counting-session',
      JSON.stringify({ userId: 'user-1', inventoryId: inventory.id, passId: pass.id }),
    )

    const user = userEvent.setup()
    render(
      <CountingSessionProvider>
        <MemoryRouter initialEntries={[`/inventory/${inventory.id}/pass/${pass.id}`]}>
          <Routes>
            <Route path="/inventory/:inventoryId/pass/:passId" element={<CountingWizard />} />
          </Routes>
        </MemoryRouter>
      </CountingSessionProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Warehouse A' }))
    await user.click(await screen.findByRole('button', { name: 'Kraft Paper' }))
    await user.click(await screen.findByRole('button', { name: '+1' }))
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(async () => {
      const line = await db.countLines.where('materialId').equals(material.id).first()
      expect(line?.quantity).toBe(1)
    })

    expect(await screen.findByText(/zone summary/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /close zone/i }))

    await waitFor(async () => {
      const zc = await db.zoneCounts.where({ passId: pass.id, zoneId: zone.id }).first()
      expect(zc?.status).toBe('closed')
    })

    // Back at the zone picker; "Finish this pass" moves into PassClosePage.
    expect(await screen.findByRole('button', { name: /finish this pass/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /finish this pass/i }))
    expect(await screen.findByRole('button', { name: /finish with one pass/i })).toBeInTheDocument()
  })
})
