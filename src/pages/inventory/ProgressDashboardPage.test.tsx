import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../../db/schema'
import { createZone } from '../../db/repositories/zoneRepository'
import { createUnit } from '../../db/repositories/unitRepository'
import { createMaterial } from '../../db/repositories/materialRepository'
import {
  startInventory, getOrOpenZoneCount, setCountLine, closeZoneCount,
} from '../../db/repositories/inventoryRepository'
import ProgressDashboardPage from './ProgressDashboardPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('ProgressDashboardPage', () => {
  it('shows zones closed vs total and materials counted', async () => {
    const zoneA = await createZone({ name: 'Warehouse A' })
    const zoneB = await createZone({ name: 'Warehouse B' })
    const unit = await createUnit('KG', 'Kilogram')
    const material = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const { pass } = await startInventory('Inv', 'user-1')

    const zcA = await getOrOpenZoneCount(pass.id, zoneA.id, 'user-1')
    await setCountLine(zcA.id, material.id, 5, 'user-1')
    await closeZoneCount(zcA.id, 'user-1')
    await getOrOpenZoneCount(pass.id, zoneB.id, 'user-1')

    render(<ProgressDashboardPage passId={pass.id} />)

    expect(await screen.findByText(/1 \/ 2 zones closed/i)).toBeInTheDocument()
    expect(screen.getByText(/1 material line/i)).toBeInTheDocument()
  })

  it('flags expected zone/material pairs with no count line as not counted', async () => {
    const zoneA = await createZone({ name: 'Warehouse A' })
    const unit = await createUnit('KG', 'Kilogram')
    const materialCounted = await createMaterial({ name: 'Kraft Paper', unitId: unit.id })
    const materialMissing = await createMaterial({ name: 'Recycled Pulp', unitId: unit.id })
    const { pass } = await startInventory('Inv', 'user-1')

    const zcA = await getOrOpenZoneCount(pass.id, zoneA.id, 'user-1')
    await setCountLine(zcA.id, materialCounted.id, 5, 'user-1', 5)
    await db.countLines.where({ zoneCountId: zcA.id }).first()

    render(
      <ProgressDashboardPage
        passId={pass.id}
        expectedPairs={[
          { zoneId: zoneA.id, materialId: materialCounted.id },
          { zoneId: zoneA.id, materialId: materialMissing.id },
        ]}
      />,
    )

    expect(await screen.findByText(/not counted/i)).toBeInTheDocument()
    expect(screen.getByText(/Recycled Pulp/i)).toBeInTheDocument()
  })
})
