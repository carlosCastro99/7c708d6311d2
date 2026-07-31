import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App', () => {
  it('renders the home page with a prominent New Inventory action', async () => {
    render(<App />)
    expect(await screen.findByRole('link', { name: /new inventory/i })).toBeInTheDocument()
  })

  it('reveals the rest of the navigation via the hamburger drawer', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /open menu/i }))
    expect(screen.getByRole('link', { name: /master data/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /inventories/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /backup/i })).toBeInTheDocument()
  })
})
