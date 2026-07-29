import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { db } from '../../db/schema'
import { listZones } from '../../db/repositories/zoneRepository'
import ImportPage from './ImportPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('ImportPage', () => {
  it('imports zones from an uploaded CSV file', async () => {
    render(<ImportPage />)

    const csv = 'name,sapStorageLocation\nWarehouse A,SL01'
    const file = new File([csv], 'zones.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/zones csv/i) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/imported 1 zone/i)).toBeInTheDocument()
    const zones = await listZones()
    expect(zones.map((z) => z.name)).toEqual(['Warehouse A'])
  })
})
