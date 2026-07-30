import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the home page with navigation links', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: /start inventory/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /master data/i })).toBeInTheDocument()
  })
})
