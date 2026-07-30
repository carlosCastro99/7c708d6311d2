import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import { startInventory } from '../../db/repositories/inventoryRepository'
import PassClosePage from './PassClosePage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('PassClosePage', () => {
  it('lets the user finish with a single pass, closing the inventory', async () => {
    const { inventory, pass } = await startInventory('Test Inventory', 'user-1')
    const onFinishedSinglePass = vi.fn()
    const user = userEvent.setup()
    render(
      <PassClosePage
        passId={pass.id}
        inventoryId={inventory.id}
        userId="user-1"
        onFinishedSinglePass={onFinishedSinglePass}
        onSecondPassStarted={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /finish with one pass/i }))

    await waitFor(() => expect(onFinishedSinglePass).toHaveBeenCalled())
    const updated = await db.inventories.get(inventory.id)
    expect(updated?.status).toBe('closed_single_pass')
  })

  it('lets the user start a second pass', async () => {
    const { inventory, pass } = await startInventory('Test Inventory', 'user-1')
    const onSecondPassStarted = vi.fn()
    const user = userEvent.setup()
    render(
      <PassClosePage
        passId={pass.id}
        inventoryId={inventory.id}
        userId="user-1"
        onFinishedSinglePass={vi.fn()}
        onSecondPassStarted={onSecondPassStarted}
      />,
    )

    await user.click(screen.getByRole('button', { name: /start second pass/i }))

    await waitFor(() => expect(onSecondPassStarted).toHaveBeenCalledWith(expect.any(String)))
  })
})
