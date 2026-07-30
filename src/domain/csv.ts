import Papa from 'papaparse'

export function parseZonesCsv(csvText: string): Array<{ name: string; sapStorageLocation?: string }> {
  const { data } = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
  return data.map((row) => ({
    name: row.name,
    sapStorageLocation: row.sapStorageLocation ? row.sapStorageLocation.trim() || undefined : undefined,
  }))
}

export function parseMaterialsCsv(
  csvText: string,
): Array<{ name: string; unitCode: string; sapMaterialNumber?: string }> {
  const { data } = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
  return data.map((row) => ({
    name: row.name,
    unitCode: row.unitCode,
    sapMaterialNumber: row.sapMaterialNumber ? row.sapMaterialNumber.trim() || undefined : undefined,
  }))
}

export function parseExpectedQuantitiesCsv(
  csvText: string,
): Array<{ zoneName: string; materialName: string; expectedQuantity: number }> {
  const { data } = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
  return data.map((row) => ({
    zoneName: row.zoneName,
    materialName: row.materialName,
    expectedQuantity: Number(row.expectedQuantity),
  }))
}

export interface DetailRow {
  inventoryName: string
  passNumber: number
  zoneName: string
  sapStorageLocation?: string
  materialName: string
  sapMaterialNumber?: string
  unitCode: string
  expectedQuantity?: number
  countedQuantity: number
  variance?: number
  status: string
  countedByUser: string
  timestamp: string
}

export function buildDetailCsv(rows: DetailRow[]): string {
  return Papa.unparse(
    rows.map((r) => ({
      inventoryName: r.inventoryName,
      passNumber: r.passNumber,
      zoneName: r.zoneName,
      sapStorageLocation: r.sapStorageLocation ?? '',
      materialName: r.materialName,
      sapMaterialNumber: r.sapMaterialNumber ?? '',
      unitCode: r.unitCode,
      expectedQuantity: r.expectedQuantity ?? '',
      countedQuantity: r.countedQuantity,
      variance: r.variance ?? '',
      status: r.status,
      countedByUser: r.countedByUser,
      timestamp: r.timestamp,
    })),
    { newline: '\n' },
  )
}

export interface SummaryRow {
  zoneName: string
  materialName: string
  officialQuantity: number
  expectedQuantity?: number
  variance?: number
}

export function buildSummaryCsv(rows: SummaryRow[]): string {
  return Papa.unparse(
    rows.map((r) => ({
      zoneName: r.zoneName,
      materialName: r.materialName,
      officialQuantity: r.officialQuantity,
      expectedQuantity: r.expectedQuantity ?? '',
      variance: r.variance ?? '',
    })),
    { newline: '\n' },
  )
}
