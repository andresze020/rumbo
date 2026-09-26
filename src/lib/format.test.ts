import { describe, expect, it } from 'vitest'

import { formatCurrency, formatCurrencyCompact } from './format'

const NBSP = ' '

describe('formatCurrency', () => {
  it('keeps the currency symbol glued to the number in en', () => {
    expect(formatCurrency(23997.2, 'CAD', 'en')).toBe('$23,997.20')
  })

  it('separates a trailing currency code with a breakable space in es', () => {
    const result = formatCurrency(23997.2, 'CAD', 'es')
    expect(result).toBe('23.997,20 CAD')
    expect(result).not.toContain(NBSP)
  })

  it('keeps the thousands grouping non-breaking but the trailing code breakable in fr', () => {
    const result = formatCurrency(23997.2, 'CAD', 'fr')
    expect(result).toBe(`23${NBSP}997,20 $`)
    // The grouping separator (between "23" and "997") must stay non-breaking...
    expect(result).toContain(NBSP)
    // ...but the space right before the trailing "$" must not.
    expect(result.endsWith(' $')).toBe(true)
  })
})

describe('formatCurrencyCompact', () => {
  it('also keeps the trailing currency code breakable for large magnitudes in es', () => {
    // "1,3 M CAD": the compact unit ("M") stays glued to its number
    // (nbsp) — same reasoning as a thousands grouping separator — but the
    // boundary right before the trailing currency code is breakable.
    const result = formatCurrencyCompact(1_250_000, 'CAD', 'es')
    expect(result).toBe(`1,3${NBSP}M CAD`)
    expect(result.endsWith(' CAD')).toBe(true)
  })
})
