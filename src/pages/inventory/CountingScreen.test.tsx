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
        onBack={vi.fn()}
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
        onBack={vi.fn()}
      />,
    )

    expect(screen.getByText(/variance/i)).toHaveClass('variance-warning')
  })

  it('shows an error banner if saving fails', async () => {
    // No matching zoneCount exists in the DB, so setCountLine will throw "Zone count not found".
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(
      <CountingScreen
        zoneCountId="nonexistent-zc"
        materialId="material-1"
        userId="user-1"
        initialQuantity={0}
        onSaved={onSaved}
        onBack={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/zone count not found/i)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('goes back immediately with no prompt when nothing has changed', async () => {
    await db.zoneCounts.add({
      id: 'zc-3', passId: 'pass-1', zoneId: 'zone-1', status: 'open', openedByUserId: 'user-1', openedAt: Date.now(),
    })
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(
      <CountingScreen
        zoneCountId="zc-3"
        materialId="material-1"
        userId="user-1"
        initialQuantity={5}
        onSaved={vi.fn()}
        onBack={onBack}
      />,
    )

    await user.click(screen.getByRole('button', { name: /back/i }))

    expect(onBack).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('asks to save or discard before going back when the count has changed', async () => {
    await db.zoneCounts.add({
      id: 'zc-4', passId: 'pass-1', zoneId: 'zone-1', status: 'open', openedByUserId: 'user-1', openedAt: Date.now(),
    })
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(
      <CountingScreen
        zoneCountId="zc-4"
        materialId="material-1"
        userId="user-1"
        initialQuantity={0}
        onSaved={vi.fn()}
        onBack={onBack}
      />,
    )

    await user.click(screen.getByRole('button', { name: '+1' }))
    await user.click(screen.getByRole('button', { name: /back/i }))

    expect(onBack).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent(/unsaved count/i)

    await user.click(screen.getByRole('button', { name: /discard.*go back/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it('saves the count before going back when "Save & go back" is chosen', async () => {
    await db.zoneCounts.add({
      id: 'zc-5', passId: 'pass-1', zoneId: 'zone-1', status: 'open', openedByUserId: 'user-1', openedAt: Date.now(),
    })
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(
      <CountingScreen
        zoneCountId="zc-5"
        materialId="material-1"
        userId="user-1"
        initialQuantity={0}
        onSaved={vi.fn()}
        onBack={onBack}
      />,
    )

    await user.click(screen.getByRole('button', { name: '+1' }))
    await user.click(screen.getByRole('button', { name: /back/i }))
    await user.click(await screen.findByRole('button', { name: /save.*go back/i }))

    await waitFor(() => expect(onBack).toHaveBeenCalled())
    const line = await db.countLines.where({ zoneCountId: 'zc-5', materialId: 'material-1' }).first()
    expect(line?.quantity).toBe(1)
  })

  it('offers a "Count using camera" option that opens and can be cancelled without affecting the tap counter', async () => {
    await db.zoneCounts.add({
      id: 'zc-6', passId: 'pass-1', zoneId: 'zone-1', status: 'open', openedByUserId: 'user-1', openedAt: Date.now(),
    })
    const user = userEvent.setup()
    render(
      <CountingScreen
        zoneCountId="zc-6"
        materialId="material-1"
        userId="user-1"
        initialQuantity={3}
        onSaved={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /count using camera/i }))
    expect(screen.getByLabelText(/take a photo of the position/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByLabelText(/take a photo of the position/i)).not.toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})
