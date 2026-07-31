import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { db } from '../../db/schema'
import { createZone, listZones } from '../../db/repositories/zoneRepository'
import { createUnit } from '../../db/repositories/unitRepository'
import { createMaterial } from '../../db/repositories/materialRepository'
import { getExpectedQuantity } from '../../db/repositories/expectedQuantityRepository'
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

  it('deduplicates duplicate zone names within the same CSV file', async () => {
    render(<ImportPage />)

    const csv = 'name,sapStorageLocation\nWarehouse A,SL01\nWarehouse A,SL02'
    const file = new File([csv], 'zones.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/zones csv/i) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/imported 1 zone/i)).toBeInTheDocument()
    const zones = await listZones()
    expect(zones).toHaveLength(1)
    expect(zones.map((z) => z.name)).toEqual(['Warehouse A'])
  })

  it('imports expected quantities matched by zone and material name', async () => {
    const zone = await createZone({ name: 'Warehouse A' })
    const unit = await createUnit('KG', 'Kilogram')
    const material = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })

    render(<ImportPage />)

    const csv = 'zoneName,materialName,expectedQuantity\nWarehouse A,Kraft Paper,150\nUnknown Zone,Kraft Paper,10'
    const file = new File([csv], 'expected.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/expected quantities csv/i) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/imported 1 expected quantit/i)).toBeInTheDocument()
    expect(await getExpectedQuantity(zone.id, material.id)).toBe(150)
  })
})
