'use server'

import { createClient } from '@/lib/supabase/server'
import { getRequestProfile, getRequestUser } from '@/lib/supabase/request'
import {
  balanceTrendDates,
  balanceTrendFromRows,
  lastNMonthDates,
  trendMonthLabel,
  type BalanceTrendRow,
  type TrendPoint as BalanceTrendPoint,
} from '@/lib/net-worth/trend'

export type TrendMetric =
  | 'monthly-income'
  | 'monthly-expenses'
  | 'monthly-savings'
  | 'savings-rate'
  | 'net-worth'
  | 'total-assets'
  | 'total-liabilities'
  | 'projected-net-worth'


// A local alias, not `export type { … } from`: the Server Actions compiler
// treats a re-export in a 'use server' file as an action and fails the build.
export type TrendPoint = BalanceTrendPoint

export type TrendResult =
  | { ok: true; data: TrendPoint[] }
  | { ok: false; error: string }

type MonthlySummaryRow = {
  monthly_income: number | string
  monthly_expenses: number | string
  monthly_savings: number | string
  savings_rate: number | string | null
}

export async function getDashboardTrend(
  metric: TrendMetric,
  currentMonth: string,
  numMonths = 6
): Promise<TrendResult> {
  // Shared with the rest of this request (lib/supabase/request).
  const user = await getRequestUser()
  if (!user) return { ok: false, error: 'Unauthorized' }

  const profile = await getRequestProfile()
  if (!profile?.default_household_id) return { ok: false, error: 'No household' }

  const supabase = await createClient()
  const householdId = profile.default_household_id
  const monthDates = lastNMonthDates(currentMonth, numMonths)

  const isMonthlyMetric =
    metric === 'monthly-income' ||
    metric === 'monthly-expenses' ||
    metric === 'monthly-savings' ||
    metric === 'savings-rate'

  if (isMonthlyMetric) {
    const results = await Promise.all(
      monthDates.map((d) =>
        supabase.rpc('get_monthly_dashboard_summary', {
          p_household_id: householdId,
          p_month: d,
        })
      )
    )

    const data: TrendPoint[] = results.map((result, i) => {
      const row = ((result.data ?? [])[0] as MonthlySummaryRow | undefined) ?? null
      let value = 0
      if (row) {
        if (metric === 'monthly-income') value = Number(row.monthly_income ?? 0)
        else if (metric === 'monthly-expenses') value = Number(row.monthly_expenses ?? 0)
        else if (metric === 'monthly-savings') value = Number(row.monthly_savings ?? 0)
        else if (metric === 'savings-rate') value = Number(row.savings_rate ?? 0)
      }
      return { month: monthDates[i].slice(0, 7), label: trendMonthLabel(monthDates[i]), value }
    })

    return { ok: true, data }
  }

  // Balance-type metrics: one aggregation for every requested snapshot date,
  // not one get_account_balances call per month. get_account_balances(household,
  // as_of_date) has no lower date bound (RUM-001), so each of those N calls
  // re-aggregated the whole ledger from scratch; get_account_balances_as_of_many
  // (RUM-006) answers every requested date from a single pass instead. This
  // exact N+1 pattern was found and deliberately deferred out of RUM-006's
  // scope (three other call sites only) — see docs/performance-ux-execution-status.md.
  //
  // RUM-003: monthDates' last entry is always currentMonth (getLastNMonthDates'
  // i=0 case) — snapshotDateForMonth resolves that one point to today instead
  // of an unrealized month-end, same fix as Dashboard/Net worth.
  const todayIso = new Date().toISOString().slice(0, 10)
  const dates = balanceTrendDates(currentMonth, numMonths, todayIso)
  const { data: multiDateBalances } = await supabase.rpc('get_account_balances_as_of_many', {
    p_household_id: householdId,
    p_as_of_dates: dates.snapshotDates,
  })
  // RUM-002: valued through the one shared formula (lib/net-worth/trend →
  // computeValuation); see that module for the history of this block.
  const data: TrendPoint[] = balanceTrendFromRows(
    (multiDateBalances ?? []) as BalanceTrendRow[],
    dates,
    metric as Parameters<typeof balanceTrendFromRows>[2]
  )

  return { ok: true, data }
}
