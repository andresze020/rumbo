/**
 * MQ-005 — what the Dashboard's Cash flow deltas compare the month on screen
 * against.
 *
 * A closed month is compared with the whole previous month, as before. The
 * open month is not: on the 1st it has a day of data, and measuring that
 * against thirty days of September read "↓ 100% vs Sep" on every line — income
 * and savings in red, spending in green. So the open month is compared with
 * the previous month *up to the same day*, and labelled that way.
 *
 * Pure. The daily amounts come from `getDailyCashFlow`, which mirrors
 * `get_monthly_dashboard_summary` row for row, so a full month of them adds up
 * to that RPC's totals.
 */

import { daysInMonth, previousMonth, type DailyAmounts } from './spending-pace'

export type CashFlowTotals = {
  income: number
  expenses: number
  /** income − expenses, as `get_monthly_dashboard_summary` defines it. */
  savings: number
}

export type CashFlowComparison =
  /** Open month: the previous month's totals through `day` (its own last day when shorter). */
  | { kind: 'same-day'; day: number; previous: CashFlowTotals }
  /** Closed month: compare with the previous month's full-month summary. */
  | { kind: 'full-month' }
  /** A month that has not started: nothing to compare. */
  | { kind: 'none' }

function lastDataDay(month: string, amounts: DailyAmounts): number {
  let last = 0
  for (const [date, amount] of amounts) {
    if (date.startsWith(`${month}-`) && amount !== 0) last = Math.max(last, Number(date.slice(8, 10)))
  }
  return last
}

function sumThrough(month: string, day: number, amounts: DailyAmounts): number {
  let total = 0
  for (let d = 1; d <= day; d += 1) {
    total += amounts.get(`${month}-${String(d).padStart(2, '0')}`) ?? 0
  }
  return total
}

/**
 * `todayIso` is `YYYY-MM-DD`. For the open month the cut-off is today — or a
 * later day of the month that already holds a posted entry, since the month's
 * totals include it (the same rule as the spending-pace line). The previous
 * month is read through that day, or through its own last day when it is
 * shorter: on 31 March, February is compared whole.
 */
export function cashFlowComparison(
  month: string,
  todayIso: string,
  flows: { income: DailyAmounts; expenses: DailyAmounts }
): CashFlowComparison {
  const todayMonth = todayIso.slice(0, 7)
  if (month > todayMonth) return { kind: 'none' }
  if (month < todayMonth) return { kind: 'full-month' }

  const throughDay = Math.max(
    Number(todayIso.slice(8, 10)),
    lastDataDay(month, flows.income),
    lastDataDay(month, flows.expenses)
  )
  const prev = previousMonth(month)
  const day = Math.min(throughDay, daysInMonth(prev))
  const income = sumThrough(prev, day, flows.income)
  const expenses = sumThrough(prev, day, flows.expenses)
  return { kind: 'same-day', day, previous: { income, expenses, savings: income - expenses } }
}
