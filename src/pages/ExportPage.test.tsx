import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { URL as NodeURL } from 'node:url'
import { db } from '../db/schema'
import { createUser } from '../db/repositories/userRepository'
import { createZone } from '../db/repositories/zoneRepository'
import { createUnit } from '../db/repositories/unitRepository'
import { createMaterial } from '../db/repositories/materialRepository'
import {
  startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount, closePass, closeInventory, startNextPass,
} from '../db/repositories/inventoryRepository'
import ExportPage from './ExportPage'

// jsdom's URL class has no createObjectURL, so src/test/setup.ts installs a
// fallback mock that returns fake, unregistered "blob:xxxxx" ids. Those work
// for the existing test (which only checks link presence) but aren't
// fetchable. This test fetches the blob content, so swap in Node's real
// createObjectURL/revokeObjectURL (which register with Node's actual blob
// registry that fetch() reads from) for this file only.
URL.createObjectURL = NodeURL.createObjectURL as unknown as typeof URL.createObjectURL
URL.revokeObjectURL = NodeURL.revokeObjectURL as unknown as typeof URL.revokeObjectURL

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

  it('computes matched/mismatched/manually_resolved status per line across a full multi-pass inventory', async () => {
    const user = await createUser('Alex')
    const zone = await createZone({ name: 'Warehouse A' })
    const unit = await createUnit('KG', 'Kilogram')
    const materialA = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const materialB = await createMaterial({ name: 'Pulp', unitId: unit.id })

    const { inventory, pass } = await startInventory('Multi-pass Inv', user.id)
    const zc1 = await getOrOpenZoneCount(pass.id, zone.id, user.id)
    await setCountLine(zc1.id, materialA.id, 10, user.id)
    await setCountLine(zc1.id, materialB.id, 10, user.id)
    await closeZoneCount(zc1.id, user.id)
    await closePass(pass.id, user.id)

    const pass2 = await startNextPass(inventory.id, 2)
    const zc2 = await getOrOpenZoneCount(pass2.id, zone.id, user.id)
    await setCountLine(zc2.id, materialA.id, 10, user.id) // matches pass 1
    await setCountLine(zc2.id, materialB.id, 12, user.id) // mismatches pass 1
    await closeZoneCount(zc2.id, user.id)
    await closePass(pass2.id, user.id)

    const pass3 = await startNextPass(inventory.id, 3)
    const zc3 = await getOrOpenZoneCount(pass3.id, zone.id, user.id)
    await setCountLine(zc3.id, materialB.id, 12, user.id) // pass3 matches pass2
    await closeZoneCount(zc3.id, user.id)
    await closePass(pass3.id, user.id)
    await db.inventories.put({ ...(await db.inventories.get(inventory.id))!, status: 'successful' })

    render(<ExportPage inventoryId={inventory.id} />)
    const detailLink = await screen.findByRole('link', { name: /download detail csv/i })
    const detailUrl = detailLink.getAttribute('href')!
    const detailCsv = await (await fetch(detailUrl)).text()

    expect(detailCsv).toContain('matched')
    expect(detailCsv).toContain('mismatched')
    expect(detailCsv).toContain('manually_resolved')
  })

  it('renders an on-screen summary table with zone, material, and quantity', async () => {
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

    expect(await screen.findByText('Q3 Paper Warehouse')).toBeInTheDocument()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Warehouse A')).toBeInTheDocument()
    expect(within(table).getByText('Kraft Paper')).toBeInTheDocument()
    expect(within(table).getByText('98')).toBeInTheDocument()
    expect(within(table).getByText('100')).toBeInTheDocument()
    expect(within(table).getByText('-2')).toBeInTheDocument()
  })
})
