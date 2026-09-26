import { groupByAsOfDate } from '@/lib/balances/multi-date'
import { computeValuation, selectNetWorthAccounts } from '@/lib/net-worth/valuation'
import { snapshotDateForMonth } from '@/lib/periods/month'

export type BalanceTrendMetric =
  | 'net-worth'
  | 'total-assets'
  | 'total-liabilities'
  | 'projected-net-worth'

export type TrendPoint = {
  month: string
  label: string
  value: number
}

export type BalanceTrendRow = {
  as_of_date: string
  account_class: string
  include_in_net_worth: boolean
  is_archived: boolean
  posted_balance_base_currency: number | string
  projected_balance_base_currency: number | string
}

/** First-of-month dates for the `n` months ending at `currentMonth` (YYYY-MM), oldest first. */
export function lastNMonthDates(currentMonth: string, n: number): string[] {
  const [year, mon] = currentMonth.split('-').map(Number)
  const months: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(year, mon - 1 - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
  }
  return months
}

export function trendMonthLabel(monthDate: string): string {
  const [year, mon] = monthDate.slice(0, 7).split('-').map(Number)
  const d = new Date(year, mon - 1, 1)
  const monthStr = d.toLocaleDateString('en-CA', { month: 'short' })
  return `${monthStr} '${String(year).slice(2)}`
}

/**
 * The months of a balance trend and the date each one is valued at: month end
 * for past months, today for the current one (RUM-003, snapshotDateForMonth).
 * Exposed so a caller that already needs some of these dates (the Dashboard
 * needs this month and last month's end) can ask for all of them in one
 * get_account_balances_as_of_many call instead of two.
 */
export function balanceTrendDates(currentMonth: string, n: number, todayIso: string) {
  const monthDates = lastNMonthDates(currentMonth, n)
  const snapshotDates = monthDates.map((d) => snapshotDateForMonth(d.slice(0, 7), todayIso))
  return { monthDates, snapshotDates }
}

/** One point per month from multi-date balance rows, through the shared valuation formula (RUM-002). */
export function balanceTrendFromRows(
  rows: BalanceTrendRow[],
  dates: { monthDates: string[]; snapshotDates: string[] },
  metric: BalanceTrendMetric
): TrendPoint[] {
  const byDate = groupByAsOfDate(rows)
  return dates.monthDates.map((d, i) => {
    const valuation = computeValuation(selectNetWorthAccounts(byDate.get(dates.snapshotDates[i]) ?? []))
    let value = 0
    if (metric === 'net-worth') value = valuation.netWorth
    else if (metric === 'total-assets') value = valuation.totalAssets
    else if (metric === 'total-liabilities') value = valuation.totalLiabilities
    else if (metric === 'projected-net-worth') value = valuation.projectedNetWorth
    return { month: d.slice(0, 7), label: trendMonthLabel(d), value }
  })
}
