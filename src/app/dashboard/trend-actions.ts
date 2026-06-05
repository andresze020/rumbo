'use server'

import { createClient } from '@/lib/supabase/server'

export type TrendMetric =
  | 'monthly-income'
  | 'monthly-expenses'
  | 'monthly-savings'
  | 'savings-rate'
  | 'net-worth'
  | 'total-assets'
  | 'total-liabilities'
  | 'projected-net-worth'

export type TrendPoint = {
  month: string
  label: string
  value: number
}

export type TrendResult =
  | { ok: true; data: TrendPoint[] }
  | { ok: false; error: string }

function getLastNMonthDates(currentMonth: string, n: number): string[] {
  const [year, mon] = currentMonth.split('-').map(Number)
  const months: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(year, mon - 1 - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
  }
  return months
}

function getMonthEndDate(monthDate: string): string {
  const [year, mon] = monthDate.slice(0, 7).split('-').map(Number)
  return new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10)
}

function formatMonthLabel(monthDate: string): string {
  const [year, mon] = monthDate.slice(0, 7).split('-').map(Number)
  const d = new Date(year, mon - 1, 1)
  const monthStr = d.toLocaleDateString('en-CA', { month: 'short' })
  return `${monthStr} '${String(year).slice(2)}`
}

type AccountBalanceRow = {
  account_class: string
  include_in_net_worth: boolean
  is_archived: boolean
  posted_balance_base_currency: number | string
  projected_balance_base_currency: number | string
}

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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.default_household_id) return { ok: false, error: 'No household' }

  const householdId = profile.default_household_id
  const monthDates = getLastNMonthDates(currentMonth, numMonths)

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
      return { month: monthDates[i].slice(0, 7), label: formatMonthLabel(monthDates[i]), value }
    })

    return { ok: true, data }
  }

  // Balance-type metrics: one get_account_balances call per month-end
  const results = await Promise.all(
    monthDates.map((d) =>
      supabase.rpc('get_account_balances', {
        p_household_id: householdId,
        p_as_of_date: getMonthEndDate(d),
      })
    )
  )

  const data: TrendPoint[] = results.map((result, i) => {
    const balances = ((result.data ?? []) as AccountBalanceRow[]).filter(
      (a) => a.include_in_net_worth && !a.is_archived
    )
    const assets = balances
      .filter((a) => a.account_class === 'asset')
      .reduce((sum, a) => sum + Number(a.posted_balance_base_currency ?? 0), 0)
    const signedLiabilities = balances
      .filter((a) => a.account_class === 'liability')
      .reduce((sum, a) => sum + Number(a.posted_balance_base_currency ?? 0), 0)
    const projectedAssets = balances
      .filter((a) => a.account_class === 'asset')
      .reduce((sum, a) => sum + Number(a.projected_balance_base_currency ?? 0), 0)
    const signedProjectedLiabilities = balances
      .filter((a) => a.account_class === 'liability')
      .reduce((sum, a) => sum + Number(a.projected_balance_base_currency ?? 0), 0)

    let value = 0
    if (metric === 'net-worth') value = assets + signedLiabilities
    else if (metric === 'total-assets') value = assets
    else if (metric === 'total-liabilities') value = Math.max(0, -signedLiabilities)
    else if (metric === 'projected-net-worth') value = projectedAssets + signedProjectedLiabilities

    return { month: monthDates[i].slice(0, 7), label: formatMonthLabel(monthDates[i]), value }
  })

  return { ok: true, data }
}
