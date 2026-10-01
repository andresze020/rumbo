import { describe, expect, it } from 'vitest'

import { cashFlowComparison } from './month-comparison'

const none = new Map<string, number>()

describe('cashFlowComparison', () => {
  it('compares the open month with the previous month up to the same day', () => {
    const income = new Map([
      ['2026-09-01', 1000],
      ['2026-09-15', 500],
      ['2026-10-01', 200],
    ])
    const expenses = new Map([
      ['2026-09-01', 40],
      ['2026-09-02', 60],
      ['2026-09-30', 900],
    ])
    expect(cashFlowComparison('2026-10', '2026-10-02', { income, expenses })).toEqual({
      kind: 'same-day',
      day: 2,
      previous: { income: 1000, expenses: 100, savings: 900 },
    })
  })

  it('on the 1st of a month with no data, reads only the 1st of the previous month', () => {
    const expenses = new Map([
      ['2026-09-01', 25],
      ['2026-09-20', 400],
    ])
    expect(cashFlowComparison('2026-10', '2026-10-01', { income: none, expenses })).toEqual({
      kind: 'same-day',
      day: 1,
      previous: { income: 0, expenses: 25, savings: -25 },
    })
  })

  it('on 31 March, compares with the whole of February (a shorter month)', () => {
    const expenses = new Map([
      ['2026-02-01', 10],
      ['2026-02-28', 30],
    ])
    expect(cashFlowComparison('2026-03', '2026-03-31', { income: none, expenses })).toEqual({
      kind: 'same-day',
      day: 28,
      previous: { income: 0, expenses: 40, savings: -40 },
    })
  })

  it('counts a leap February through the 29th', () => {
    const expenses = new Map([['2028-02-29', 70]])
    expect(cashFlowComparison('2028-03', '2028-03-30', { income: none, expenses })).toEqual({
      kind: 'same-day',
      day: 29,
      previous: { income: 0, expenses: 70, savings: -70 },
    })
  })

  it('runs to a posted entry dated later this month, as the month total does', () => {
    const expenses = new Map([
      ['2026-09-05', 10],
      ['2026-09-12', 20],
      ['2026-10-12', 99],
    ])
    expect(cashFlowComparison('2026-10', '2026-10-03', { income: none, expenses })).toEqual({
      kind: 'same-day',
      day: 12,
      previous: { income: 0, expenses: 30, savings: -30 },
    })
  })

  it('compares a closed month with the full previous month', () => {
    expect(cashFlowComparison('2026-08', '2026-10-02', { income: none, expenses: none })).toEqual({
      kind: 'full-month',
    })
  })

  it('has nothing to compare for a month that has not started', () => {
    expect(cashFlowComparison('2026-11', '2026-10-02', { income: none, expenses: none })).toEqual({
      kind: 'none',
    })
  })
})
