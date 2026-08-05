import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../../db/schema'
import { createUnit } from '../../db/repositories/unitRepository'
import { createMaterial, listMaterials } from '../../db/repositories/materialRepository'
import MaterialPickerPage from './MaterialPickerPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('MaterialPickerPage', () => {
  it('shows materials in a table sorted by SAP id, paginated 10 per page', async () => {
    const unit = await createUnit('KG', 'Kilogram')
    for (let i = 12; i >= 1; i--) {
      await createMaterial({ name: `Material ${i}`, unitId: unit.id, sapMaterialNumber: String(i).padStart(4, '0') })
    }

    const onMaterialChosen = vi.fn()
    render(<MaterialPickerPage onMaterialChosen={onMaterialChosen} />)

    await screen.findByText('Material 1')
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(11) // header + 10 data rows
    expect(within(rows[1]).getByText('0001')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Material 1')).toBeInTheDocument()
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /next/i }))

    expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument()
    expect(screen.getByText('0011')).toBeInTheDocument()
    expect(screen.getByText('0012')).toBeInTheDocument()
  })

  it('filters the table by search text matching name or SAP number', async () => {
    const unit = await createUnit('KG', 'Kilogram')
    await createMaterial({ name: 'Kraft Paper', unitId: unit.id, sapMaterialNumber: '1000123' })
    await createMaterial({ name: 'Recycled Pulp', unitId: unit.id, sapMaterialNumber: '2000456' })

    render(<MaterialPickerPage onMaterialChosen={vi.fn()} />)
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/search materials/i), 'kraft')

    expect(screen.getByText('Kraft Paper')).toBeInTheDocument()
    expect(screen.queryByText('Recycled Pulp')).not.toBeInTheDocument()
  })

  it('selects a material when its row Select button is clicked', async () => {
    const unit = await createUnit('KG', 'Kilogram')
    const material = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })

    const onMaterialChosen = vi.fn()
    render(<MaterialPickerPage onMaterialChosen={onMaterialChosen} />)
    await screen.findByText('Kraft Paper')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /select/i }))

    expect(onMaterialChosen).toHaveBeenCalledWith(material.id)
  })

  it('creates a new material inline and selects it immediately', async () => {
    const unit = await createUnit('KG', 'Kilogram')

    const onMaterialChosen = vi.fn()
    render(<MaterialPickerPage onMaterialChosen={onMaterialChosen} />)
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /create new material/i }))
    await user.type(screen.getByLabelText(/new material name/i), 'Brand New Material')
    await within(screen.getByLabelText(/^unit$/i)).findByRole('option', { name: unit.code })
    await user.selectOptions(screen.getByLabelText(/^unit$/i), unit.code)
    await user.click(screen.getByRole('button', { name: /create.*select/i }))

    await waitFor(() => expect(onMaterialChosen).toHaveBeenCalled())
    const created = (await listMaterials()).find((m) => m.name === 'Brand New Material')
    expect(created).toBeTruthy()
    expect(onMaterialChosen).toHaveBeenCalledWith(created!.id)
  })
})
