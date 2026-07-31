import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/schema'
import HomePage from './HomePage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('HomePage', () => {
  it('links each KPI tile to its corresponding filtered list', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('In progress')).toBeInTheDocument()
    expect(screen.getByText('In progress').closest('a')).toHaveAttribute('href', '/inventories?status=in_progress')
    expect(screen.getByText('Completed').closest('a')).toHaveAttribute('href', '/inventories?status=completed')
    expect(screen.getByText('Zones').closest('a')).toHaveAttribute('href', '/master-data/zones')
    expect(screen.getByText('Materials').closest('a')).toHaveAttribute('href', '/master-data/materials')
  })
})
