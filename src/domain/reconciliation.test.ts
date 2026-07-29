import { describe, it, expect } from 'vitest'
import { comparePasses, resolveThirdPass } from './reconciliation'

describe('comparePasses', () => {
  it('reports all lines matched when quantities agree', () => {
    const passA = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    const passB = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    const result = comparePasses(passA, passB)
    expect(result.matched).toEqual(passA)
    expect(result.mismatched).toEqual([])
  })

  it('reports mismatched lines with both quantities', () => {
    const passA = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    const passB = [{ zoneId: 'z1', materialId: 'm1', quantity: 12 }]
    const result = comparePasses(passA, passB)
    expect(result.matched).toEqual([])
    expect(result.mismatched).toEqual([
      { zoneId: 'z1', materialId: 'm1', passAQuantity: 10, passBQuantity: 12 },
    ])
  })

  it('treats a line missing from one pass as mismatched against zero', () => {
    const passA = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    const passB: typeof passA = []
    const result = comparePasses(passA, passB)
    expect(result.mismatched).toEqual([
      { zoneId: 'z1', materialId: 'm1', passAQuantity: 10, passBQuantity: 0 },
    ])
  })
})

describe('resolveThirdPass', () => {
  it('resolves to pass1 value when pass3 matches pass1', () => {
    const pass1 = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    const pass2 = [{ zoneId: 'z1', materialId: 'm1', quantity: 12 }]
    const pass3 = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    expect(resolveThirdPass(pass1, pass2, pass3)).toEqual([
      { zoneId: 'z1', materialId: 'm1', resolution: 'pass3_matches_pass1', officialQuantity: 10 },
    ])
  })

  it('resolves to pass2 value when pass3 matches pass2', () => {
    const pass1 = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    const pass2 = [{ zoneId: 'z1', materialId: 'm1', quantity: 12 }]
    const pass3 = [{ zoneId: 'z1', materialId: 'm1', quantity: 12 }]
    expect(resolveThirdPass(pass1, pass2, pass3)).toEqual([
      { zoneId: 'z1', materialId: 'm1', resolution: 'pass3_matches_pass2', officialQuantity: 12 },
    ])
  })

  it('flags for manual resolution when all three passes differ', () => {
    const pass1 = [{ zoneId: 'z1', materialId: 'm1', quantity: 10 }]
    const pass2 = [{ zoneId: 'z1', materialId: 'm1', quantity: 12 }]
    const pass3 = [{ zoneId: 'z1', materialId: 'm1', quantity: 14 }]
    expect(resolveThirdPass(pass1, pass2, pass3)).toEqual([
      { zoneId: 'z1', materialId: 'm1', resolution: 'needs_manual_resolution' },
    ])
  })
})
