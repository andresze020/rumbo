import { describe, expect, it } from 'vitest'
import { buildSubPeriods, type SubPeriodRow } from './sub-periods'

const rows: SubPeriodRow[] = [
  { type: 'income', date: '2026-01-15', baseSigned: 1000 },
  { type: 'expense', date: '2026-01-20', baseSigned: -300 },
  { type: 'expense', date: '2026-03-02', baseSigned: -50 },
]

describe('buildSubPeriods', () => {
  it('keeps week rows for a month-long range', () => {
    const result = buildSubPeriods(rows, '2026-01-01', '2026-01-31', 1)
    expect(result?.unit).toBe('week')
    expect(result?.periods[0]).toMatchObject({ dateFrom: '2026-01-01', dateTo: '2026-01-04' })
  })

  it('splits year to date into calendar months that add up to the range', () => {
    const result = buildSubPeriods(rows, '2026-01-01', '2026-03-10', 1)
    expect(result?.unit).toBe('month')
    expect(result?.periods.map((p) => [p.dateFrom, p.dateTo, p.fullPeriodLabel])).toEqual([
      ['2026-01-01', '2026-01-31', '2026-01'],
      ['2026-02-01', '2026-02-28', '2026-02'],
      // Clipped by the range, so it is not named as a whole month.
      ['2026-03-01', '2026-03-10', null],
    ])
    const [jan, feb, mar] = result!.periods
    expect(jan).toMatchObject({ income: 1000, expenses: 300, net: 700, txCount: 2 })
    expect(feb).toMatchObject({ income: 0, expenses: 0, net: 0, txCount: 0 })
    expect(mar).toMatchObject({ expenses: 50, txCount: 1 })
  })

  it('follows a custom month start day (BR-036)', () => {
    const result = buildSubPeriods([], '2025-12-25', '2026-02-24', 25)
    expect(result?.periods.map((p) => [p.dateFrom, p.dateTo, p.fullPeriodLabel])).toEqual([
      ['2025-12-25', '2026-01-24', '2025-12'],
      ['2026-01-25', '2026-02-24', '2026-01'],
    ])
  })

  it('returns null for short ranges and for ranges over a year', () => {
    expect(buildSubPeriods(rows, '2026-01-01', '2026-01-10', 1)).toBeNull()
    expect(buildSubPeriods(rows, '2024-01-01', '2026-03-10', 1)).toBeNull()
  })
})
