import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CountingSessionProvider, useCountingSession } from './CountingSession'

afterEach(() => {
  window.localStorage.clear()
})

function TestConsumer() {
  const { session, setSession } = useCountingSession()
  return (
    <div>
      <div data-testid="session">{session ? JSON.stringify(session) : 'none'}</div>
      <button
        onClick={() =>
          setSession({ userId: 'u1', inventoryId: 'inv1', passId: 'p1', zoneId: 'z1', materialId: 'm1' })
        }
      >
        set
      </button>
      <button onClick={() => setSession(null)}>clear</button>
    </div>
  )
}

describe('CountingSession', () => {
  it('starts with no session, persists on set, and clears on null', () => {
    const { unmount } = render(
      <CountingSessionProvider>
        <TestConsumer />
      </CountingSessionProvider>,
    )

    expect(screen.getByTestId('session').textContent).toBe('none')

    fireEvent.click(screen.getByText('set'))
    expect(screen.getByTestId('session').textContent).toContain('"inventoryId":"inv1"')
    expect(window.localStorage.getItem('mx-inventory-counting-session')).toContain('"inventoryId":"inv1"')

    fireEvent.click(screen.getByText('clear'))
    expect(screen.getByTestId('session').textContent).toBe('none')
    expect(window.localStorage.getItem('mx-inventory-counting-session')).toBeNull()

    unmount()
  })

  it('rehydrates an existing session from localStorage on mount', () => {
    window.localStorage.setItem(
      'mx-inventory-counting-session',
      JSON.stringify({ userId: 'u1', inventoryId: 'inv1', passId: 'p1' }),
    )

    render(
      <CountingSessionProvider>
        <TestConsumer />
      </CountingSessionProvider>,
    )

    expect(screen.getByTestId('session').textContent).toContain('"inventoryId":"inv1"')
  })
})
