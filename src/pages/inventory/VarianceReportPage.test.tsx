import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import { startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount, closePass, startNextPass } from '../../db/repositories/inventoryRepository'
import VarianceReportPage from './VarianceReportPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

async function countAndClose(passId: string, zoneId: string, materialId: string, qty: number) {
  const zc = await getOrOpenZoneCount(passId, zoneId, 'user-1')
  await setCountLine(zc.id, materialId, qty, 'user-1')
  await closeZoneCount(zc.id, 'user-1')
}

describe('VarianceReportPage', () => {
  it('reports success and closes the inventory when both passes match', async () => {
    const { inventory, pass } = await startInventory('Inv', 'user-1')
    await countAndClose(pass.id, 'zone-1', 'material-1', 10)
    await closePass(pass.id, 'user-1')
    const pass2 = await startNextPass(inventory.id, 2)
    await countAndClose(pass2.id, 'zone-1', 'material-1', 10)
    await closePass(pass2.id, 'user-1')

    const onResolved = vi.fn()
    render(
      <VarianceReportPage inventoryId={inventory.id} pass1Id={pass.id} pass2Id={pass2.id} onResolved={onResolved} />,
    )

    expect(await screen.findByText(/successful/i)).toBeInTheDocument()
    expect(onResolved).toHaveBeenCalledWith('successful')
    const updated = await db.inventories.get(inventory.id)
    expect(updated?.status).toBe('successful')
  })

  it('lists mismatches and starts a third pass', async () => {
    const { inventory, pass } = await startInventory('Inv', 'user-1')
    await countAndClose(pass.id, 'zone-1', 'material-1', 10)
    await closePass(pass.id, 'user-1')
    const pass2 = await startNextPass(inventory.id, 2)
    await countAndClose(pass2.id, 'zone-1', 'material-1', 12)
    await closePass(pass2.id, 'user-1')

    const onResolved = vi.fn()
    const user = userEvent.setup()
    render(
      <VarianceReportPage inventoryId={inventory.id} pass1Id={pass.id} pass2Id={pass2.id} onResolved={onResolved} />,
    )

    expect(await screen.findByText(/10/)).toBeInTheDocument()
    expect(screen.getByText(/12/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /start third pass/i }))
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('needs_3rd_pass', expect.any(String)))
  })
})
