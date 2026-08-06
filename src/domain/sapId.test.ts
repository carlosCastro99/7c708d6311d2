import { describe, it, expect } from 'vitest'
import { formatSapId, isValidSapId } from './sapId'

describe('formatSapId', () => {
  it('inserts dashes progressively as digits are typed', () => {
    expect(formatSapId('1')).toBe('1')
    expect(formatSapId('1234')).toBe('1234')
    expect(formatSapId('12345')).toBe('1234-5')
    expect(formatSapId('1234567')).toBe('1234-567')
    expect(formatSapId('12345678')).toBe('1234-567-8')
    expect(formatSapId('12345678901')).toBe('1234-567-8901')
  })

  it('strips non-digit characters and caps at 11 digits', () => {
    expect(formatSapId('1234-567-8901')).toBe('1234-567-8901')
    expect(formatSapId('abc1234def567ghi8901jkl9999')).toBe('1234-567-8901')
  })
})

describe('isValidSapId', () => {
  it('accepts the exact XXXX-XXX-XXXX shape', () => {
    expect(isValidSapId('1234-567-8901')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isValidSapId('')).toBe(false)
    expect(isValidSapId('1234-567')).toBe(false)
    expect(isValidSapId('1234567 8901')).toBe(false)
    expect(isValidSapId('1234-56-8901')).toBe(false)
    expect(isValidSapId('abcd-567-8901')).toBe(false)
  })
})
