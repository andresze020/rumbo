import { describe, expect, it } from 'vitest'

import {
  HEALTH_BUDGET_WEIGHT,
  HEALTH_SAVINGS_WEIGHT,
  budgetComponent,
  computeHealthScore,
  healthGrade,
  savingsComponent,
} from './score'

/**
 * RUM-010a seed tests.
 *
 * `src/lib/health/score.ts` is the best first target in the repo: the formula
 * is documented in the module header, the weights and thresholds are exported,
 * and nothing in it touches I/O, the clock or Supabase.
 *
 * Expected values are written out as literals on purpose. Deriving them from
 * the exported weights would make the test agree with any weight, which is
 * exactly the regression this file exists to catch.
 */

describe('savingsComponent', () => {
  it('maps the documented −20% / 0% / +20% anchors onto 0 / 50 / 100', () => {
    expect(savingsComponent(-0.2)).toBe(0)
    expect(savingsComponent(0)).toBe(50)
    expect(savingsComponent(0.2)).toBe(100)
    // Not `toBe`: (0.1 + 0.2) / 0.4 lands on 75.00000000000001 in binary floating
    // point. Worth knowing for RUM-003 — the sub-scores are plain `number`.
    expect(savingsComponent(0.1)).toBeCloseTo(75, 10)
  })

  it('clamps outside the band instead of running past 0–100', () => {
    expect(savingsComponent(-5)).toBe(0)
    expect(savingsComponent(5)).toBe(100)
  })

  it('treats an unknown savings rate as neutral, not as zero', () => {
    expect(savingsComponent(null)).toBe(50)
    expect(savingsComponent(Number.NaN)).toBe(50)
    expect(savingsComponent(Number.POSITIVE_INFINITY)).toBe(50)
  })
})

describe('budgetComponent', () => {
  it('scores anything within budget as perfect adherence', () => {
    expect(budgetComponent(0)).toBe(100)
    expect(budgetComponent(0.5)).toBe(100)
    expect(budgetComponent(1)).toBe(100)
  })

  it('degrades linearly from 100% used to 0 at 150% used', () => {
    expect(budgetComponent(1.25)).toBe(50)
    expect(budgetComponent(1.5)).toBe(0)
    expect(budgetComponent(3)).toBe(0)
  })

  it('does not punish a household whose budget percentage is undefined', () => {
    // A planned total of 0 makes actual/planned non-finite upstream; that is a
    // missing budget, not an overrun.
    expect(budgetComponent(Number.NaN)).toBe(100)
    expect(budgetComponent(Number.POSITIVE_INFINITY)).toBe(100)
  })
})

describe('computeHealthScore', () => {
  it('is the savings component alone when there is no budget', () => {
    expect(computeHealthScore({ savingsRate: 0.1, hasBudget: false, budgetPercent: 3 })).toBe(75)
    expect(computeHealthScore({ savingsRate: -0.2, hasBudget: false, budgetPercent: 0 })).toBe(0)
  })

  it('weights savings at 65% and budget adherence at 35% when a budget exists', () => {
    // savings 75 · budget 50 → 0.65·75 + 0.35·50 = 66.25 → 66
    expect(computeHealthScore({ savingsRate: 0.1, hasBudget: true, budgetPercent: 1.25 })).toBe(66)
    // neutral savings 50 · budget 100 → 32.5 + 35 = 67.5 → 68
    expect(computeHealthScore({ savingsRate: null, hasBudget: true, budgetPercent: 1 })).toBe(68)
    expect(HEALTH_SAVINGS_WEIGHT + HEALTH_BUDGET_WEIGHT).toBe(1)
  })

  it('always returns an integer inside 0–100', () => {
    const worst = computeHealthScore({ savingsRate: -10, hasBudget: true, budgetPercent: 10 })
    const best = computeHealthScore({ savingsRate: 10, hasBudget: true, budgetPercent: 0 })
    expect(worst).toBe(0)
    expect(best).toBe(100)
    expect(Number.isInteger(computeHealthScore({ savingsRate: 0.07, hasBudget: true, budgetPercent: 1.13 }))).toBe(true)
  })

  it('never scores a worse month above a better one', () => {
    const rates = [-0.3, -0.2, -0.05, 0, 0.05, 0.2, 0.4]
    const scores = rates.map((savingsRate) =>
      computeHealthScore({ savingsRate, hasBudget: true, budgetPercent: 1 }),
    )
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1])
    }
  })
})

describe('healthGrade', () => {
  it('cuts the bands exactly where the dashboard and month-review expect', () => {
    expect(healthGrade(100)).toBe('A+')
    expect(healthGrade(90)).toBe('A+')
    expect(healthGrade(89)).toBe('A')
    expect(healthGrade(80)).toBe('A')
    expect(healthGrade(79)).toBe('B+')
    expect(healthGrade(70)).toBe('B+')
    expect(healthGrade(69)).toBe('B')
    expect(healthGrade(60)).toBe('B')
    expect(healthGrade(59)).toBe('C+')
    expect(healthGrade(50)).toBe('C+')
    expect(healthGrade(49)).toBe('C')
    expect(healthGrade(40)).toBe('C')
    expect(healthGrade(39)).toBe('D')
    expect(healthGrade(0)).toBe('D')
  })
})
