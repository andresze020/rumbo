import { describe, expect, it } from 'vitest'

import { trendMonthLabel } from './trend'

describe('trendMonthLabel', () => {
  it('defaults to English month abbreviations', () => {
    expect(trendMonthLabel('2026-01')).toBe("Jan '26")
  })

  it('uses the given locale for the month abbreviation', () => {
    expect(trendMonthLabel('2026-01', 'es')).toBe("ene '26")
    expect(trendMonthLabel('2026-01', 'fr')).toBe("janv. '26")
  })
})
