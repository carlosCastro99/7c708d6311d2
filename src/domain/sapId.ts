const SAP_ID_PATTERN = /^\d{4}-\d{3}-\d{4}$/

// Auto-inserts dashes as digits are typed, capping at the fixed XXXX-XXX-XXXX
// shape (11 digits total). Non-digit characters are stripped so pasting a
// pre-formatted value ("1234-567-8901") still normalizes correctly.
export function formatSapId(rawInput: string): string {
  const digits = rawInput.replace(/\D/g, '').slice(0, 11)
  const parts = [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 11)].filter(Boolean)
  return parts.join('-')
}

export function isValidSapId(value: string): boolean {
  return SAP_ID_PATTERN.test(value)
}

export const SAP_ID_PLACEHOLDER = '1234-567-8901'
