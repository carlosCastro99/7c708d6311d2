import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import {
  startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount, closePass, startNextPass,
} from '../../db/repositories/inventoryRepository'
import ManualResolutionPage from './ManualResolutionPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

async function countAndClose(passId: string, zoneId: string, materialId: string, qty: number) {
  const zc = await getOrOpenZoneCount(passId, zoneId, 'user-1')
  await setCountLine(zc.id, materialId, qty, 'user-1')
  await closeZoneCount(zc.id, 'user-1')
}

describe('ManualResolutionPage', () => {
  it('shows a reason form for lines where all three passes disagree, and closes the inventory once resolved', async () => {
    const { inventory, pass } = await startInventory('Inv', 'user-1')
    await countAndClose(pass.id, 'zone-1', 'material-1', 10)
    await closePass(pass.id, 'user-1')

    const pass2 = await startNextPass(inventory.id, 2)
    await countAndClose(pass2.id, 'zone-1', 'material-1', 12)
    await closePass(pass2.id, 'user-1')

    const pass3 = await startNextPass(inventory.id, 3)
    await countAndClose(pass3.id, 'zone-1', 'material-1', 14)
    await closePass(pass3.id, 'user-1')

    const onResolved = vi.fn()
    const user = userEvent.setup()
    render(
      <ManualResolutionPage
        inventoryId={inventory.id} pass1Id={pass.id} pass2Id={pass2.id} pass3Id={pass3.id}
        userId="user-1" onResolved={onResolved}
      />,
    )

    expect(await screen.findByText(/needs manual resolution/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/final quantity/i), '13')
    await user.type(screen.getByLabelText(/reason/i), 'supervisor recount, agreed on 13')
    await user.click(screen.getByRole('button', { name: /confirm final count/i }))

    await waitFor(() => expect(onResolved).toHaveBeenCalled())
    const updated = await db.inventories.get(inventory.id)
    expect(updated?.status).toBe('successful')
  })
})
