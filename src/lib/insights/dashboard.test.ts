import { describe, expect, it } from 'vitest'

import {
  buildDashboardInsights,
  mostOverBudgetLine,
  scheduledDirection,
  summarizeDebts,
  type DashboardInsightInput,
  type InsightBudgetLine,
} from './dashboard'

const MONTH = '2026-09'

function line(overrides: Partial<InsightBudgetLine>): InsightBudgetLine {
  return {
    line_id: 'l1',
    category_id: 'c1',
    category_name: 'Groceries',
    planned_amount: 100,
    actual_amount: 50,
    ...overrides,
  }
}

function input(overrides: Partial<DashboardInsightInput> = {}): DashboardInsightInput {
  return {
    month: MONTH,
    budgetLines: [],
    hasMonthlyActivity: true,
    monthlySavings: 0,
    totalLiabilities: 0,
    prevLiabilities: 0,
    topCategory: null,
    ...overrides,
  }
}

describe('mostOverBudgetLine', () => {
  it('ignores lines within plan and lines with no plan', () => {
    expect(
      mostOverBudgetLine([
        line({ actual_amount: 100 }),
        line({ planned_amount: 0, actual_amount: 500 }),
        line({ planned_amount: null, actual_amount: 500 }),
      ])
    ).toBeNull()
  })

  it('picks the highest actual/planned ratio, not the largest overrun', () => {
    const picked = mostOverBudgetLine([
      line({ line_id: 'a', category_name: 'Rent', planned_amount: 1000, actual_amount: 1200 }),
      line({ line_id: 'b', category_name: 'Coffee', planned_amount: 20, actual_amount: 40 }),
    ])
    expect(picked?.line.line_id).toBe('b')
    expect(picked?.ratio).toBe(2)
  })

  it('breaks ratio ties by category name so the result does not depend on row order', () => {
    const rows = [
      line({ line_id: 'x', category_name: 'Zoo', planned_amount: 10, actual_amount: 15 }),
      line({ line_id: 'y', category_name: 'Art', planned_amount: 20, actual_amount: 30 }),
    ]
    expect(mostOverBudgetLine(rows)?.line.line_id).toBe('y')
    expect(mostOverBudgetLine([...rows].reverse())?.line.line_id).toBe('y')
  })
})

describe('buildDashboardInsights', () => {
  it('returns nothing when there is nothing to say', () => {
    expect(buildDashboardInsights(input({ hasMonthlyActivity: false }))).toEqual([])
  })

  it('over-budget: names the category, the ratio and links to its expenses this month', () => {
    const [insight] = buildDashboardInsights(
      input({ budgetLines: [line({ category_id: 'cat-9', actual_amount: 150 })] })
    )
    expect(insight).toEqual({
      kind: 'over-budget',
      tone: 'warning',
      category: 'Groceries',
      percent: 1.5,
      href: '/dashboard/transactions?month=2026-09&category_id=cat-9&type=expense',
    })
  })

  it('over-budget without a category id falls back to the budget screen', () => {
    const [insight] = buildDashboardInsights(
      input({ budgetLines: [line({ category_id: null, actual_amount: 150 })] })
    )
    expect(insight.href).toBe('/dashboard/budgets?month=2026-09')
  })

  it('cash flow: positive and negative are traced to income − expenses, with an action', () => {
    expect(buildDashboardInsights(input({ monthlySavings: 250 }))).toEqual([
      { kind: 'cash-flow-positive', tone: 'positive', amount: 250, href: '/dashboard/month-review?month=2026-09' },
    ])
    expect(buildDashboardInsights(input({ monthlySavings: -80 }))).toEqual([
      {
        kind: 'cash-flow-negative',
        tone: 'warning',
        amount: 80,
        href: '/dashboard/transactions?month=2026-09&type=expense',
      },
    ])
  })

  it('cash flow: says nothing without activity or within rounding noise', () => {
    expect(buildDashboardInsights(input({ hasMonthlyActivity: false, monthlySavings: 500 }))).toEqual([])
    expect(buildDashboardInsights(input({ monthlySavings: 0.004 }))).toEqual([])
  })

  it('liabilities-down: only when account liabilities actually fell from a non-zero base', () => {
    expect(buildDashboardInsights(input({ prevLiabilities: 1000, totalLiabilities: 900 }))).toEqual([
      { kind: 'liabilities-down', tone: 'positive', amount: 100, href: '/dashboard/accounts' },
    ])
    expect(buildDashboardInsights(input({ prevLiabilities: 900, totalLiabilities: 1000 }))).toEqual([])
    expect(buildDashboardInsights(input({ prevLiabilities: 0, totalLiabilities: -5 }))).toEqual([])
  })

  it('top-category: only fills a free slot', () => {
    const top = { category_id: 'c2', name: 'Dining', amount: 300 }
    expect(buildDashboardInsights(input({ topCategory: top }))).toEqual([
      {
        kind: 'top-category',
        tone: 'info',
        category: 'Dining',
        amount: 300,
        href: '/dashboard/transactions?month=2026-09&category_id=c2&type=expense',
      },
    ])
    const full = buildDashboardInsights(
      input({
        topCategory: top,
        monthlySavings: 10,
        budgetLines: [line({ actual_amount: 150 })],
      })
    )
    expect(full.map((i) => i.kind)).toEqual(['over-budget', 'cash-flow-positive'])
  })

  it('orders by priority and caps at the limit deterministically', () => {
    const all = input({
      budgetLines: [line({ actual_amount: 150 })],
      monthlySavings: -20,
      prevLiabilities: 500,
      totalLiabilities: 400,
      topCategory: { category_id: 'c2', name: 'Dining', amount: 300 },
    })
    expect(buildDashboardInsights(all).map((i) => i.kind)).toEqual(['over-budget', 'cash-flow-negative'])
    expect(buildDashboardInsights({ ...all, limit: 5 }).map((i) => i.kind)).toEqual([
      'over-budget',
      'cash-flow-negative',
      'liabilities-down',
      'top-category',
    ])
    expect(buildDashboardInsights(all)).toEqual(buildDashboardInsights(all))
  })
})

describe('summarizeDebts', () => {
  it('never reports "no debt" while accounts owe money', () => {
    expect(summarizeDebts({ activeDebtCount: 0, plannerTotal: 0, totalLiabilities: 1200 })).toEqual({
      state: 'untracked-liabilities',
      accountLiabilities: 1200,
    })
  })

  it('is "none" only with no planner debt and nothing owed', () => {
    expect(summarizeDebts({ activeDebtCount: 0, plannerTotal: 0, totalLiabilities: 0 })).toEqual({ state: 'none' })
    expect(summarizeDebts({ activeDebtCount: 0, plannerTotal: 0, totalLiabilities: 0.004 })).toEqual({ state: 'none' })
  })

  it('reports the part of account liabilities the planner does not cover', () => {
    expect(summarizeDebts({ activeDebtCount: 2, plannerTotal: 800, totalLiabilities: 1000 })).toEqual({
      state: 'tracked',
      plannerTotal: 800,
      untrackedLiabilities: 200,
    })
    expect(summarizeDebts({ activeDebtCount: 1, plannerTotal: 800, totalLiabilities: 700 })).toEqual({
      state: 'tracked',
      plannerTotal: 800,
      untrackedLiabilities: 0,
    })
  })
})

describe('scheduledDirection', () => {
  it('signs income in, transfers neutral and every other type out', () => {
    expect(scheduledDirection('income')).toBe('in')
    expect(scheduledDirection('transfer')).toBe('neutral')
    expect(scheduledDirection('expense')).toBe('out')
    expect(scheduledDirection('debt_payment')).toBe('out')
  })
})
