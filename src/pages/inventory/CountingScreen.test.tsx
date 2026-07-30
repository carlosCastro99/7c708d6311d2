import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import CountingScreen from './CountingScreen'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('CountingScreen', () => {
  it('increments the counter and saves the count line', async () => {
    await db.zoneCounts.add({
      id: 'zc-1', passId: 'pass-1', zoneId: 'zone-1', status: 'open', openedByUserId: 'user-1', openedAt: Date.now(),
    })
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(
      <CountingScreen
        zoneCountId="zc-1"
        materialId="material-1"
        userId="user-1"
        initialQuantity={0}
        onSaved={onSaved}
      />,
    )

    await user.click(screen.getByRole('button', { name: '+1' }))
    await user.click(screen.getByRole('button', { name: '+1' }))
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const line = await db.countLines.where({ zoneCountId: 'zc-1', materialId: 'material-1' }).first()
    expect(line?.quantity).toBe(2)
  })

  it('visually flags a variance beyond 10% of the expected quantity', async () => {
    await db.zoneCounts.add({
      id: 'zc-2', passId: 'pass-1', zoneId: 'zone-1', status: 'open', openedByUserId: 'user-1', openedAt: Date.now(),
    })
    render(
      <CountingScreen
        zoneCountId="zc-2"
        materialId="material-1"
        userId="user-1"
        expectedQuantity={100}
        initialQuantity={80}
        onSaved={() => {}}
      />,
    )

    expect(screen.getByText(/variance/i)).toHaveClass('variance-warning')
  })
})
