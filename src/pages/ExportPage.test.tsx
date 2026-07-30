import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../db/schema'
import { createUser } from '../db/repositories/userRepository'
import { createZone } from '../db/repositories/zoneRepository'
import { createUnit } from '../db/repositories/unitRepository'
import { createMaterial } from '../db/repositories/materialRepository'
import {
  startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount, closePass, closeInventory,
} from '../db/repositories/inventoryRepository'
import ExportPage from './ExportPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('ExportPage', () => {
  it('renders download links once export data is ready', async () => {
    const user = await createUser('Alex')
    const zone = await createZone({ name: 'Warehouse A' })
    const unit = await createUnit('KG', 'Kilogram')
    const material = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const { inventory, pass } = await startInventory('Q3 Paper Warehouse', user.id)
    const zc = await getOrOpenZoneCount(pass.id, zone.id, user.id)
    await setCountLine(zc.id, material.id, 98, user.id, 100)
    await closeZoneCount(zc.id, user.id)
    await closePass(pass.id, user.id)
    await closeInventory(inventory.id, 'closed_single_pass')

    render(<ExportPage inventoryId={inventory.id} />)

    expect(await screen.findByRole('link', { name: /download detail csv/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /download summary csv/i })).toBeInTheDocument()
  })
})
