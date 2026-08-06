import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import { createUnit } from '../../db/repositories/unitRepository'
import { createMaterial } from '../../db/repositories/materialRepository'
import { startInventory, getOrOpenZoneCount, setCountLine } from '../../db/repositories/inventoryRepository'
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

  it('shows materials in a table sorted by SAP id, paginated 10 per page, with the SAP id column visible', async () => {
    const unit = await createUnit('KG', 'Kilogram')
    for (let i = 12; i >= 1; i--) {
      await createMaterial({ name: `Material ${i}`, unitId: unit.id, sapMaterialNumber: String(i).padStart(4, '0') })
    }

    render(<MaterialsPage />)

    await screen.findByText('Material 1')
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(11) // header + 10 data rows
    expect(within(rows[1]).getByText('0001')).toBeInTheDocument()
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /next/i }))

    expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument()
    expect(screen.getByText('0012')).toBeInTheDocument()
  })

  it('edits an existing material', async () => {
    const unit = await createUnit('KG', 'Kilogram')
    await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const user = userEvent.setup()
    render(<MaterialsPage />)

    await screen.findByText('Kraft Paper')
    await user.click(screen.getByRole('button', { name: /edit/i }))
    const nameInput = screen.getByLabelText(/edit name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Kraft Paper (Grade A)')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText('Kraft Paper (Grade A)')).toBeInTheDocument()
  })

  it('deletes a material after confirming', async () => {
    const unit = await createUnit('KG', 'Kilogram')
    await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const user = userEvent.setup()
    render(<MaterialsPage />)

    await screen.findByText('Kraft Paper')
    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.click(await screen.findByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(screen.queryByText('Kraft Paper')).not.toBeInTheDocument())
  })

  it('shows an error and keeps the material when deleting one already used in a count', async () => {
    const unit = await createUnit('KG', 'Kilogram')
    const material = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const { pass } = await startInventory('Inv', 'user-1')
    const zc = await getOrOpenZoneCount(pass.id, 'zone-1', 'user-1')
    await setCountLine(zc.id, material.id, 5, 'user-1')
    const user = userEvent.setup()
    render(<MaterialsPage />)

    await screen.findByText('Kraft Paper')
    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.click(await screen.findByRole('button', { name: /confirm delete/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/in use|already been used/i)
    expect(screen.getByText('Kraft Paper')).toBeInTheDocument()
  })
})
