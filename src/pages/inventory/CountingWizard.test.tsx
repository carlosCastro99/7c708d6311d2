import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../../db/schema'
import { CountingSessionProvider } from '../../context/CountingSession'
import { createZone } from '../../db/repositories/zoneRepository'
import { createUnit } from '../../db/repositories/unitRepository'
import { createMaterial } from '../../db/repositories/materialRepository'
import {
  startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount, closePass, startNextPass,
} from '../../db/repositories/inventoryRepository'
import CountingWizard from './CountingWizard'

function seedSession(userId: string, inventoryId: string, passId: string) {
  window.localStorage.setItem(
    'mx-inventory-counting-session',
    JSON.stringify({ userId, inventoryId, passId }),
  )
}

function renderWizard(inventoryId: string, passId: string) {
  return render(
    <CountingSessionProvider>
      <MemoryRouter initialEntries={[`/inventory/${inventoryId}/pass/${passId}`]}>
        <Routes>
          <Route path="/inventory/:inventoryId/pass/:passId" element={<CountingWizard />} />
        </Routes>
      </MemoryRouter>
    </CountingSessionProvider>,
  )
}

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
    seedSession('user-1', inventory.id, pass.id)

    const user = userEvent.setup()
    renderWizard(inventory.id, pass.id)

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

  it('drives a full two-pass matching inventory to success without throwing (regression: pass 2 must actually get closed)', async () => {
    const zone = await createZone({ name: 'Warehouse A' })
    const unit = await createUnit('KG', 'Kilogram')
    const material = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const { inventory, pass } = await startInventory('Inv', 'user-1')

    seedSession('user-1', inventory.id, pass.id)
    const user = userEvent.setup()
    renderWizard(inventory.id, pass.id)

    await user.click(await screen.findByRole('button', { name: 'Warehouse A' }))
    await user.click(await screen.findByRole('button', { name: 'Kraft Paper' }))
    await user.click(await screen.findByRole('button', { name: '+1' }))
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/zone summary/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /close zone/i }))
    await user.click(await screen.findByRole('button', { name: /finish this pass/i }))
    await user.click(await screen.findByRole('button', { name: /start second pass/i }))

    // Pass 2: count the same zone/material with a matching quantity.
    await user.click(await screen.findByRole('button', { name: 'Warehouse A' }))
    await user.click(await screen.findByRole('button', { name: 'Kraft Paper' }))
    await user.click(await screen.findByRole('button', { name: '+1' }))
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/zone summary/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /close zone/i }))
    await user.click(await screen.findByRole('button', { name: /finish this pass/i }))

    // Before the fix, VarianceReportPage's effect threw "Cannot close
    // inventory: open passes remain" here because nothing had closed pass
    // 2's InventoryPass record, leaving the user stuck on an error banner.
    expect(await screen.findByText(/inventory successful/i)).toBeInTheDocument()
    const finalInventory = await db.inventories.get(inventory.id)
    expect(finalInventory?.status).toBe('successful')
    const passes = await db.passes.where('inventoryId').equals(inventory.id).toArray()
    expect(passes.every((p) => p.status === 'closed')).toBe(true)
  })

  it('correctly identifies pass 2 after a fresh mount, e.g. resuming from the Inventories list (regression: pass ids must not rely on remembered component state)', async () => {
    const zone = await createZone({ name: 'Warehouse A' })
    const unit = await createUnit('KG', 'Kilogram')
    const material = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const { inventory, pass } = await startInventory('Inv', 'user-1')

    // Drive pass 1 and most of pass 2 directly through the repository, as if
    // it happened in an earlier session/mount -- only the final zone close of
    // pass 2 happens through a *fresh* CountingWizard mount below, the same
    // way "Resume" from InventoriesListPage would land a worker mid-pass-2.
    async function countAndClose(passId: string, zoneId: string, materialId: string, qty: number) {
      const zc = await getOrOpenZoneCount(passId, zoneId, 'user-1')
      await setCountLine(zc.id, materialId, qty, 'user-1')
      await closeZoneCount(zc.id, 'user-1')
    }
    await countAndClose(pass.id, zone.id, material.id, 1)
    await closePass(pass.id, 'user-1')
    const pass2 = await startNextPass(inventory.id, 2)

    seedSession('user-1', inventory.id, pass2.id)
    const user = userEvent.setup()
    renderWizard(inventory.id, pass2.id)

    await user.click(await screen.findByRole('button', { name: 'Warehouse A' }))
    await user.click(await screen.findByRole('button', { name: 'Kraft Paper' }))
    await user.click(await screen.findByRole('button', { name: '+1' }))
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/zone summary/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /close zone/i }))

    // Before the fix, a fresh mount treated whatever pass the session pointed
    // at (pass 2 here) as "pass 1," so this button read "Finish this pass"
    // but led back into PassClosePage ("Pass 1 Complete") instead of
    // VarianceReportPage -- silently re-running pass-1 logic on pass 2.
    await user.click(await screen.findByRole('button', { name: /finish this pass/i }))
    expect(await screen.findByText(/inventory successful/i)).toBeInTheDocument()
    const finalInventory = await db.inventories.get(inventory.id)
    expect(finalInventory?.status).toBe('successful')
  })
})
