import { describe, expect, it } from 'vitest'

import { summarizeGoals } from './summary'

describe('summarizeGoals (MQ-006)', () => {
  it('converts a goal in another currency into the base-currency total', () => {
    const totals = summarizeGoals(
      [
        { currency_code: 'CAD', current_amount: '100', target_amount: '1000', status: 'active' },
        { currency_code: 'COP', current_amount: '300000', target_amount: '3000000', status: 'active' },
      ],
      'CAD',
      new Map([['COP', 0.0003]])
    )
    expect(totals.saved).toBeCloseTo(190, 6)
    expect(totals.target).toBeCloseTo(1900, 6)
    expect(totals.converted).toEqual(['COP'])
    expect(totals.unconverted).toEqual([])
  })

  it('reports a currency with no rate on its own instead of dropping it', () => {
    const totals = summarizeGoals(
      [
        { currency_code: 'CAD', current_amount: 50, target_amount: 500, status: 'paused' },
        { currency_code: 'COP', current_amount: 200, target_amount: 1000, status: 'active' },
        { currency_code: 'COP', current_amount: 100, target_amount: 500, status: 'completed' },
      ],
      'CAD',
      new Map([['COP', null]])
    )
    expect(totals.saved).toBe(50)
    expect(totals.target).toBe(500)
    expect(totals.converted).toEqual([])
    expect(totals.unconverted).toEqual([{ currency: 'COP', saved: 300, target: 1500 }])
  })

  it('leaves archived goals out, whatever their currency', () => {
    const totals = summarizeGoals(
      [
        { currency_code: 'CAD', current_amount: 80, target_amount: 100, status: 'archived' },
        { currency_code: 'USD', current_amount: 10, target_amount: 20, status: 'archived' },
      ],
      'CAD',
      new Map()
    )
    expect(totals).toEqual({ saved: 0, target: 0, converted: [], unconverted: [] })
  })
})
