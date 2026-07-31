import { describe, it, expect } from 'vitest'
import { parseZonesCsv, parseMaterialsCsv, parseExpectedQuantitiesCsv, buildDetailCsv, buildSummaryCsv } from './csv'

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

describe('csv export building', () => {
  it('builds a detail CSV with a header row', () => {
    const csv = buildDetailCsv([
      {
        inventoryName: 'Q3 Paper Warehouse', passNumber: 1, zoneName: 'Warehouse A',
        sapStorageLocation: 'SL01', materialName: 'Kraft Paper', sapMaterialNumber: 'SAP001',
        unitCode: 'KG', expectedQuantity: 100, countedQuantity: 98, variance: -2,
        status: 'matched', countedByUser: 'Alex', timestamp: '2026-07-29T10:00:00.000Z',
      },
    ])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe(
      'inventoryName,passNumber,zoneName,sapStorageLocation,materialName,sapMaterialNumber,unitCode,expectedQuantity,countedQuantity,variance,status,countedByUser,timestamp,lotNumber',
    )
    expect(lines[1]).toContain('Q3 Paper Warehouse')
    expect(lines[1]).toContain('Kraft Paper')
  })

  it('builds a summary CSV with a header row', () => {
    const csv = buildSummaryCsv([
      { zoneName: 'Warehouse A', materialName: 'Kraft Paper', officialQuantity: 98, expectedQuantity: 100, variance: -2 },
    ])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('zoneName,materialName,officialQuantity,expectedQuantity,variance')
    expect(lines[1]).toBe('Warehouse A,Kraft Paper,98,100,-2')
  })
})
