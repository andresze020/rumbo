import { describe, expect, it } from 'vitest'

import { buildSpendingPace, daysInMonth, previousMonth } from './spending-pace'

describe('spending pace', () => {
  it('knows month lengths and wraps the year', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-09')).toBe(30)
    expect(previousMonth('2026-01')).toBe('2025-12')
  })

  it('stops the open month at today and compares with the same day last month', () => {
    const amounts = new Map([
      ['2026-08-02', 100],
      ['2026-08-10', 50],
      ['2026-08-31', 400],
      ['2026-09-01', 30],
      ['2026-09-09', 20],
    ])
    const pace = buildSpendingPace('2026-09', '2026-09-10', amounts)!
    expect(pace.current).toHaveLength(10)
    expect(pace.current[9]).toBe(50)
    expect(pace.previous).toHaveLength(31)
    expect(pace.previous[30]).toBe(550)
    expect(pace.previousAtSameDay).toBe(150)
    expect(pace.diffAtSameDay).toBe(-100)
  })

  it('runs the open month to a posted expense dated after today, so it ends at the month total', () => {
    const amounts = new Map([
      ['2026-09-01', 30],
      ['2026-09-20', 70],
    ])
    const pace = buildSpendingPace('2026-09', '2026-09-10', amounts)!
    expect(pace.throughDay).toBe(20)
    expect(pace.current[19]).toBe(100)
  })

  it('runs a past month to its last day, clamping to a shorter previous month', () => {
    const amounts = new Map([
      ['2026-02-28', 200],
      ['2026-03-31', 300],
    ])
    const pace = buildSpendingPace('2026-03', '2026-09-10', amounts)!
    expect(pace.throughDay).toBe(31)
    expect(pace.current[30]).toBe(300)
    expect(pace.previousAtSameDay).toBe(200)
    expect(pace.diffAtSameDay).toBe(100)
  })

  it('has nothing to plot for a month that has not started', () => {
    expect(buildSpendingPace('2026-10', '2026-09-10', new Map())).toBeNull()
  })
})
