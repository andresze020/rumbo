import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, PiggyBank, TrendingUp } from 'lucide-react'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { LocalizedClientBoundary } from '@/components/localized-client-boundary'
import { Callout } from '@/components/callout'
import { LineTrendChart } from '@/components/analysis/charts'
import { formatCurrency, formatCurrencyCompact, formatPercent } from '@/lib/format'
import { getLocale } from '@/lib/i18n/server'
import { localeToBcp47 } from '@/lib/format'
import type { Locale } from '@/lib/i18n/dictionaries'
import { cn } from '@/lib/utils'
import { getDashboardTrend } from '@/app/dashboard/trend-actions'
import {
  getHousehold,
  getMonthlySeries,
  lastNMonths,
  parseMonthParam,
  POSITIVE_COLOR,
  NEGATIVE_COLOR,
  ACCENT_COLOR,
} from '@/lib/analysis/server'

type TrendsPageProps = {
  searchParams: Promise<{ month?: string; range?: string }>
}

const CARD = 'rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'
const RANGES = [6, 12] as const

/** Parses `?range=6|12`, defaulting to 6. */
function parseRange(range: string | undefined): (typeof RANGES)[number] {
  return range === '12' ? 12 : 6
}

/** Small delta vs the previous month, color-coded by whether the move is "good". */
function deltaLabel(
  current: number,
  previous: number,
  locale: Locale,
  higherIsBad = false
): { text: string; good: boolean } | null {
  if (previous === 0) return null
  const diff = (current - previous) / Math.abs(previous)
  if (Math.abs(diff) < 0.0005) return { text: 'No change vs prev. month', good: true }
  const isUp = diff > 0
  const pct = new Intl.NumberFormat(localeToBcp47(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(diff) * 100)
  return { text: `${isUp ? '↑' : '↓'} ${pct}% vs prev. month`, good: higherIsBad ? !isUp : isUp }
}

export default async function TrendsPage({ searchParams }: TrendsPageProps) {
  const params = await searchParams
  const locale = await getLocale()
  const month = parseMonthParam(params.month)
  const range = parseRange(params.range)
  const ctx = await getHousehold()
  const currency = ctx.household.base_currency

  const months = lastNMonths(month, range)
  const [series, netWorthResult] = await Promise.all([
    getMonthlySeries(ctx, months, locale),
    getDashboardTrend('net-worth', month, range),
  ])
  const netWorth = netWorthResult.ok ? netWorthResult.data : []

  const thisMonth = series[series.length - 1] ?? {
    income: 0,
    expenses: 0,
    savings: 0,
    savingsRate: null,
  }
  const prevMonth = series[series.length - 2] ?? {
    income: 0,
    expenses: 0,
    savings: 0,
    savingsRate: null,
  }

  // Range averages for the KPIs.
  const count = series.length || 1
  const avgIncome = series.reduce((s, m) => s + m.income, 0) / count
  const avgExpenses = series.reduce((s, m) => s + m.expenses, 0) / count
  const avgSavings = series.reduce((s, m) => s + m.savings, 0) / count

  // Net-worth change across the range (current vs first month).
  const firstNetWorth = netWorth[0]?.value ?? 0
  const lastNetWorth = netWorth[netWorth.length - 1]?.value ?? 0
  const netWorthChange = lastNetWorth - firstNetWorth

  const incomeDelta = deltaLabel(thisMonth.income, prevMonth.income, locale, false)
  const expensesDelta = deltaLabel(thisMonth.expenses, prevMonth.expenses, locale, true)
  const savingsDelta = deltaLabel(thisMonth.savings, prevMonth.savings, locale, false)

  const hasActivity =
    series.some((m) => m.income !== 0 || m.expenses !== 0) || netWorth.some((p) => p.value !== 0)

  const kpis = [
    {
      label: 'Avg. monthly income',
      value: formatCurrency(avgIncome, currency, locale),
      valueClass: 'text-emerald-600 dark:text-emerald-400',
      sub: incomeDelta,
      icon: <ArrowUpRight />,
      accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    },
    {
      label: 'Avg. monthly spending',
      value: formatCurrency(avgExpenses, currency, locale),
      valueClass: 'text-red-600 dark:text-red-400',
      sub: expensesDelta,
      icon: <ArrowDownRight />,
      accent: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
    },
    {
      label: 'Avg. monthly savings',
      value: `${avgSavings >= 0 ? '+' : '−'}${formatCurrency(Math.abs(avgSavings), currency, locale)}`,
      valueClass: avgSavings >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      sub: savingsDelta,
      icon: <PiggyBank />,
      accent: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
    },
    {
      label: 'Net worth change',
      value: `${netWorthChange >= 0 ? '+' : '−'}${formatCurrency(Math.abs(netWorthChange), currency, locale)}`,
      valueClass: netWorthChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      sub: { text: `over the last ${range} months`, good: netWorthChange >= 0 },
      icon: <TrendingUp />,
      accent: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
    },
  ]

  const labels = series.map((m) => m.label)

  return (
    <LocalizedClientBoundary>
    <main className="mx-auto flex w-full max-w-[1340px] flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        eyebrow="Analysis"
        title="Trends"
        description={`How your money has moved over the last ${range} months.`}
        actions={
          <div className="flex w-full gap-1 overflow-x-auto rounded-xl border bg-muted/40 p-1 sm:w-fit">
            {RANGES.map((r) => {
              const active = range === r
              return (
                <Link
                  key={r}
                  href={`/dashboard/trends?month=${month}&range=${r}`}
                  className={cn(
                    'flex flex-1 items-center justify-center whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors sm:flex-none',
                    active
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {r}M
                </Link>
              )
            })}
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={cn(CARD, 'p-4')}>
            <div className="flex items-center gap-2.5">
              <span
                className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4', kpi.accent)}
                aria-hidden="true"
              >
                {kpi.icon}
              </span>
              <span className="truncate text-sm font-medium text-muted-foreground">{kpi.label}</span>
            </div>
            <p className={cn('mt-2.5 text-xl font-semibold tabular-nums sm:text-2xl', kpi.valueClass)}>{kpi.value}</p>
            {kpi.sub ? (
              <p
                className={cn(
                  'mt-1 text-[11.5px] font-medium',
                  kpi.sub.good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                )}
              >
                {kpi.sub.text}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {!hasActivity ? (
        <Callout variant="info" className="border-dashed text-muted-foreground">
          No financial activity recorded over the last {range} months.
        </Callout>
      ) : null}

      {/* Income vs. expenses */}
      <div className={cn(CARD, 'p-4 sm:p-5')}>
        <h2 className="mb-1 text-sm font-bold">Income vs. expenses</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Posted income and expenses per month in {currency}.
        </p>
        <LineTrendChart
          labels={labels}
          formatValue={(v) => formatCurrencyCompact(v, currency, locale)}
          series={[
            { key: 'expenses', label: 'Expenses', color: NEGATIVE_COLOR, values: series.map((m) => m.expenses), area: true },
            { key: 'income', label: 'Income', color: POSITIVE_COLOR, values: series.map((m) => m.income), dashed: true },
          ]}
        />
      </div>

      {/* Savings + net worth */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className={cn(CARD, 'p-4 sm:p-5')}>
          <h2 className="mb-1 text-sm font-bold">Monthly savings</h2>
          <p className="mb-3 text-xs text-muted-foreground">Income minus expenses each month.</p>
          <LineTrendChart
            labels={labels}
            formatValue={(v) => formatCurrencyCompact(v, currency, locale)}
            series={[
              { key: 'savings', label: 'Savings', color: ACCENT_COLOR, values: series.map((m) => m.savings), area: true },
            ]}
          />
        </div>

        <div className={cn(CARD, 'p-4 sm:p-5')}>
          <h2 className="mb-1 text-sm font-bold">Net worth</h2>
          <p className="mb-3 text-xs text-muted-foreground">Assets minus liabilities at each month-end.</p>
          <LineTrendChart
            labels={netWorth.length ? netWorth.map((p) => p.label) : labels}
            formatValue={(v) => formatCurrencyCompact(v, currency, locale)}
            series={[
              {
                key: 'net-worth',
                label: 'Net worth',
                color: POSITIVE_COLOR,
                values: netWorth.length ? netWorth.map((p) => p.value) : series.map(() => 0),
                area: true,
              },
            ]}
          />
        </div>
      </div>

      {/* Savings rate */}
      <div className={cn(CARD, 'p-4 sm:p-5')}>
        <h2 className="mb-1 text-sm font-bold">Savings rate</h2>
        <p className="mb-3 text-xs text-muted-foreground">Share of income kept each month.</p>
        <LineTrendChart
          labels={labels}
          formatValue={(v) => `${Math.round(v)}%`}
          series={[
            {
              key: 'savings-rate',
              label: 'Savings rate',
              color: ACCENT_COLOR,
              values: series.map((m) => (m.savingsRate ?? 0) * 100),
              area: true,
            },
          ]}
        />
      </div>

      {/* Month by month */}
      <div className={cn(CARD, 'p-4 sm:p-5')}>
        <h2 className="mb-3 text-sm font-bold">Month by month</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm tabular-nums">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 pr-4 text-left font-medium">Month</th>
                <th className="py-2 pr-4 text-right font-medium">Income</th>
                <th className="py-2 pr-4 text-right font-medium">Expenses</th>
                <th className="py-2 pr-4 text-right font-medium">Savings</th>
                <th className="py-2 text-right font-medium">Savings rate</th>
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map((m) => (
                <tr key={m.month} className="border-b last:border-0">
                  <td className="py-2.5 pr-4 text-left font-medium">{m.label}</td>
                  <td className="py-2.5 pr-4 text-right text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(m.income, currency, locale)}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-red-600 dark:text-red-400">
                    {formatCurrency(m.expenses, currency, locale)}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 pr-4 text-right font-medium',
                      m.savings >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {`${m.savings >= 0 ? '+' : '−'}${formatCurrency(Math.abs(m.savings), currency, locale)}`}
                  </td>
                  <td className="py-2.5 text-right text-muted-foreground">
                    {formatPercent(m.savingsRate, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
    </LocalizedClientBoundary>
  )
}
