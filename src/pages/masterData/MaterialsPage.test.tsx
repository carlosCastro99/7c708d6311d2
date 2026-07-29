import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import { createUnit } from '../../db/repositories/unitRepository'
import MaterialsPage from './MaterialsPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('MaterialsPage', () => {
  it('adds a material against an existing unit', async () => {
    await createUnit('KG', 'Kilogram')
    const user = userEvent.setup()
    render(<MaterialsPage />)

    await user.type(await screen.findByLabelText(/material name/i), 'Kraft Paper')
    await user.selectOptions(screen.getByLabelText(/unit/i), 'KG')
    await user.click(screen.getByRole('button', { name: /add material/i }))

    expect(await screen.findByText(/Kraft Paper/)).toBeInTheDocument()
  })
})
