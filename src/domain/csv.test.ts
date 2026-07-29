import { describe, it, expect } from 'vitest'
import { parseZonesCsv, parseMaterialsCsv, parseExpectedQuantitiesCsv } from './csv'

describe('csv import parsing', () => {
  it('parses zones CSV', () => {
    const csv = 'name,sapStorageLocation\nWarehouse A,SL01\nWarehouse B,'
    expect(parseZonesCsv(csv)).toEqual([
      { name: 'Warehouse A', sapStorageLocation: 'SL01' },
      { name: 'Warehouse B', sapStorageLocation: undefined },
    ])
  })

  it('parses materials CSV', () => {
    const csv = 'name,unitCode,sapMaterialNumber\nKraft Paper,KG,SAP001'
    expect(parseMaterialsCsv(csv)).toEqual([
      { name: 'Kraft Paper', unitCode: 'KG', sapMaterialNumber: 'SAP001' },
    ])
  })

  it('parses expected quantities CSV', () => {
    const csv = 'zoneName,materialName,expectedQuantity\nWarehouse A,Kraft Paper,150'
    expect(parseExpectedQuantitiesCsv(csv)).toEqual([
      { zoneName: 'Warehouse A', materialName: 'Kraft Paper', expectedQuantity: 150 },
    ])
  })
})
