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
