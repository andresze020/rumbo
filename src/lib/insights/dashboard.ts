/**
 * RUM-009 — Dashboard insights, as a pure function of the month's aggregates.
 *
 * Each insight is deterministic (same inputs → same list, same order) and
 * traceable to one concrete aggregate, named in its `kind`:
 *
 *   over-budget         budget line with the highest actual/planned ratio above
 *                       100% (ties → category name, then line id).
 *   cash-flow-positive  month income − expenses > 0 (only with activity).
 *   cash-flow-negative  month income − expenses < 0 (only with activity).
 *   liabilities-down    account-level liabilities (net-worth valuation) fell
 *                       versus the previous month. This is the balance owed on
 *                       liability accounts, NOT the Debt Planner's records —
 *                       the copy says so to avoid contradicting the Debts card.
 *   top-category        largest expense category this month; filler, only
 *                       when fewer than `limit` stronger signals exist.
 *
 * The former "upcoming payments" insight was dropped: it repeated the count of
 * the Scheduled activity card sitting next to it, and that count was capped by
 * the card's own query limit, so it under-reported.
 *
 * Every insight carries an `href` to the screen where the user can act on it.
 * No generative AI, no network: the component only maps kinds to icons/copy.
 */

import type { InsightTone } from '@/components/insight-card'

/** Below this magnitude an amount is treated as zero (rounding noise). */
const EPSILON = 0.01

export type InsightBudgetLine = {
  line_id: string | null
  category_id: string | null
  category_name: string | null
  planned_amount: number | string | null
  actual_amount: number | string | null
}

export type InsightTopCategory = {
  category_id: string | null
  name: string
  amount: number
}

export type DashboardInsightInput = {
  /** YYYY-MM of the month on screen; scopes every href. */
  month: string
  budgetLines: InsightBudgetLine[]
  hasMonthlyActivity: boolean
  /** income − expenses for the month, in the dashboard currency. */
  monthlySavings: number
  /** Account liabilities (display magnitude) at this month's snapshot. */
  totalLiabilities: number
  /** Same, at the previous month's snapshot. */
  prevLiabilities: number
  topCategory: InsightTopCategory | null
  limit?: number
}

export type DashboardInsight =
  | { kind: 'over-budget'; tone: InsightTone; category: string; percent: number; href: string }
  | { kind: 'cash-flow-positive'; tone: InsightTone; amount: number; href: string }
  | { kind: 'cash-flow-negative'; tone: InsightTone; amount: number; href: string }
  | { kind: 'liabilities-down'; tone: InsightTone; amount: number; href: string }
  | { kind: 'top-category'; tone: InsightTone; category: string; amount: number; href: string }

function transactionsHref(month: string, extra: Record<string, string>) {
  const params = new URLSearchParams({ month, ...extra })
  return `/dashboard/transactions?${params.toString()}`
}

/** Budget line most over plan, or null when every line is within plan. */
export function mostOverBudgetLine(lines: InsightBudgetLine[]) {
  const over = lines
    .map((line) => {
      const planned = Number(line.planned_amount ?? 0)
      const actual = Number(line.actual_amount ?? 0)
      return { line, planned, actual, ratio: planned > 0 ? actual / planned : 0 }
    })
    .filter((row) => row.planned > 0 && row.actual > row.planned)
    .sort(
      (a, b) =>
        b.ratio - a.ratio ||
        (a.line.category_name ?? '').localeCompare(b.line.category_name ?? '') ||
        (a.line.line_id ?? '').localeCompare(b.line.line_id ?? '')
    )
  return over[0] ?? null
}

export function buildDashboardInsights(input: DashboardInsightInput): DashboardInsight[] {
  const limit = input.limit ?? 2
  const { month } = input
  const insights: DashboardInsight[] = []

  const over = mostOverBudgetLine(input.budgetLines)
  if (over) {
    insights.push({
      kind: 'over-budget',
      tone: 'warning',
      category: over.line.category_name ?? '—',
      percent: over.ratio,
      href: over.line.category_id
        ? transactionsHref(month, { category_id: over.line.category_id, type: 'expense' })
        : `/dashboard/budgets?month=${month}`,
    })
  }

  if (input.hasMonthlyActivity && input.monthlySavings > EPSILON) {
    insights.push({
      kind: 'cash-flow-positive',
      tone: 'positive',
      amount: input.monthlySavings,
      href: `/dashboard/month-review?month=${month}`,
    })
  } else if (input.hasMonthlyActivity && input.monthlySavings < -EPSILON) {
    insights.push({
      kind: 'cash-flow-negative',
      tone: 'warning',
      amount: Math.abs(input.monthlySavings),
      href: transactionsHref(month, { type: 'expense' }),
    })
  }

  const liabilitiesDrop = input.prevLiabilities - input.totalLiabilities
  if (liabilitiesDrop > EPSILON && input.prevLiabilities > 0) {
    insights.push({
      kind: 'liabilities-down',
      tone: 'positive',
      amount: liabilitiesDrop,
      href: '/dashboard/accounts',
    })
  }

  if (input.topCategory && input.topCategory.amount > EPSILON && insights.length < limit) {
    insights.push({
      kind: 'top-category',
      tone: 'info',
      category: input.topCategory.name,
      amount: input.topCategory.amount,
      href: input.topCategory.category_id
        ? transactionsHref(month, { category_id: input.topCategory.category_id, type: 'expense' })
        : transactionsHref(month, { type: 'expense' }),
    })
  }

  return insights.slice(0, limit)
}

/**
 * Debts card state. The card reads Debt Planner records; account liabilities
 * (credit cards, loans without a planner record) come from balances. The two
 * can differ, so the card must never say "no debt" while accounts owe money.
 *
 *   tracked                 ≥1 active planner debt. `untrackedLiabilities` is
 *                           what accounts owe beyond the planner's total.
 *   untracked-liabilities   no planner debt, but accounts owe money.
 *   none                    no planner debt and nothing owed on accounts.
 */
export type DebtsSummary =
  | { state: 'tracked'; plannerTotal: number; untrackedLiabilities: number }
  | { state: 'untracked-liabilities'; accountLiabilities: number }
  | { state: 'none' }

export function summarizeDebts({
  activeDebtCount,
  plannerTotal,
  totalLiabilities,
}: {
  activeDebtCount: number
  plannerTotal: number
  totalLiabilities: number
}): DebtsSummary {
  if (activeDebtCount > 0) {
    const rest = totalLiabilities - plannerTotal
    return { state: 'tracked', plannerTotal, untrackedLiabilities: rest > EPSILON ? rest : 0 }
  }
  if (totalLiabilities > EPSILON) {
    return { state: 'untracked-liabilities', accountLiabilities: totalLiabilities }
  }
  return { state: 'none' }
}

/**
 * Scheduled activity sign. Income adds, expense-like types (expense, debt
 * payment, investment, adjustment) take money out, and a transfer only moves
 * money between the household's own accounts — it is neither income nor
 * expense, so it is shown without a sign.
 */
export type ScheduledDirection = 'in' | 'out' | 'neutral'

export function scheduledDirection(transactionType: string): ScheduledDirection {
  if (transactionType === 'income') return 'in'
  if (transactionType === 'transfer') return 'neutral'
  return 'out'
}
