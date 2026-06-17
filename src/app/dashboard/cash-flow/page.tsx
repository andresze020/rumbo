import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, Wallet, Waves } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { MonthNav } from '@/components/month-nav'
import { Callout } from '@/components/callout'
import { CashFlowBars, LineTrendChart } from '@/components/analysis/charts'
import { formatCurrency, formatCurrencyCompact, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  getHousehold,
  getMonthlySeries,
  getCategoryLookup,
  getExpenseCategories,
  lastNMonths,
  longMonthLabel,
  parseMonthParam,
  POSITIVE_COLOR,
  NEGATIVE_COLOR,
  ACCENT_COLOR,
  SERIES_PALETTE,
} from '@/lib/analysis/server'

type CashFlowPageProps = {
  searchParams: Promise<{ month?: string; range?: string }>
}

const CARD = 'rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'
const RANGES = [
  { key: '6', label: '6M', value: 6 },
  { key: '12', label: '12M', value: 12 },
] as const

const POSITIVE_CLASS = 'text-emerald-600 dark:text-emerald-400'
const NEGATIVE_CLASS = 'text-red-600 dark:text-red-400'

function signedCurrency(value: number, currency: string): string {
  const sign = value >= 0 ? '+' : '−'
  return `${sign}${formatCurrency(Math.abs(value), currency)}`
}

export default async function CashFlowPage({ searchParams }: CashFlowPageProps) {
  const params = await searchParams
  const month = parseMonthParam(params.month)
  const range = params.range === '12' ? 12 : 6
  const rangeKey = String(range)

  const ctx = await getHousehold()
  const currency = ctx.household.base_currency

  const months = lastNMonths(month, range)
  const [series, categoryLookup] = await Promise.all([
    getMonthlySeries(ctx, months),
    getCategoryLookup(ctx),
  ])
  const categories = await getExpenseCategories(ctx, month, categoryLookup)
  const topCategories = categories.slice(0, 5)

  const thisMonth = series[series.length - 1] ?? {
    income: 0,
    expenses: 0,
    savings: 0,
    savingsRate: null,
  }

  const count = series.length || 1
  const avgIncome = series.reduce((s, m) => s + m.income, 0) / count
  const avgExpenses = series.reduce((s, m) => s + m.expenses, 0) / count
  const avgNet = series.reduce((s, m) => s + m.savings, 0) / count

  const hasActivity = series.some((m) => m.income !== 0 || m.expenses !== 0)

  // Running cumulative net (savings) across the window.
  const cumulativeValues = series.reduce<number[]>((acc, m) => {
    acc.push((acc[acc.length - 1] ?? 0) + m.savings)
    return acc
  }, [])

  const barData = series.map((m) => ({
    label: m.label,
    income: m.income,
    expenses: m.expenses,
    net: m.savings,
  }))

  const categoryMax = Math.max(...topCategories.map((c) => c.value), 1)

  const kpis = [
    {
      label: 'Money in (avg/mo)',
      value: formatCurrency(avgIncome, currency),
      valueClass: POSITIVE_CLASS,
      icon: <ArrowUpRight />,
      accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    },
    {
      label: 'Money out (avg/mo)',
      value: formatCurrency(avgExpenses, currency),
      valueClass: NEGATIVE_CLASS,
      icon: <ArrowDownRight />,
      accent: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
    },
    {
      label: 'Net (avg/mo)',
      value: signedCurrency(avgNet, currency),
      valueClass: avgNet >= 0 ? POSITIVE_CLASS : NEGATIVE_CLASS,
      icon: <Waves />,
      accent: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
    },
    {
      label: 'Net this month',
      value: signedCurrency(thisMonth.savings, currency),
      valueClass: thisMonth.savings >= 0 ? POSITIVE_CLASS : NEGATIVE_CLASS,
      icon: <Wallet />,
      accent: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
    },
  ]

  const reversed = [...series].reverse()

  return (
    <main className="mx-auto flex w-full max-w-[1340px] flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        eyebrow="Analysis"
        title="Cash flow"
        description="How money flows in and out, month by month."
        actions={
          <>
            <div className="flex gap-1 rounded-xl border bg-muted/40 p-1">
              {RANGES.map((r) => {
                const active = range === r.value
                return (
                  <Link
                    key={r.key}
                    href={`/dashboard/cash-flow?month=${month}&range=${r.key}`}
                    className={cn(
                      'rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                      active
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {r.label}
                  </Link>
                )
              })}
            </div>
            <MonthNav
              month={month}
              basePath="/dashboard/cash-flow"
              searchParams={{ range: rangeKey }}
              previousLabel="Previous month"
              nextLabel="Next month"
            />
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={cn(CARD, 'p-4')}>
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
                  kpi.accent
                )}
                aria-hidden="true"
              >
                {kpi.icon}
              </span>
              <span className="truncate text-sm font-medium text-muted-foreground">{kpi.label}</span>
            </div>
            <p className={cn('mt-2.5 text-xl font-semibold tabular-nums sm:text-2xl', kpi.valueClass)}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {!hasActivity ? (
        <Callout variant="info" className="border-dashed text-muted-foreground">
          No posted income or expense activity in the last {range} months ending {longMonthLabel(month)}.
        </Callout>
      ) : null}

      {/* Inflow vs. outflow */}
      <div className={cn(CARD, 'p-4 sm:p-5')}>
        <h2 className="mb-1 text-sm font-bold">Inflow vs. outflow</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Posted income, expenses and net over the last {range} months in {currency}.
        </p>
        <CashFlowBars
          data={barData}
          formatValue={(v) => formatCurrencyCompact(v, currency)}
          incomeColor={POSITIVE_COLOR}
          expenseColor={NEGATIVE_COLOR}
        />
      </div>

      {/* Cumulative net + where it goes */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className={cn(CARD, 'p-4 sm:p-5')}>
          <h2 className="mb-1 text-sm font-bold">Cumulative net</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Running net cash built or drained across the window.
          </p>
          <LineTrendChart
            labels={series.map((m) => m.label)}
            formatValue={(v) => formatCurrencyCompact(v, currency)}
            series={[
              {
                key: 'cumulative',
                label: 'Cumulative net',
                color: ACCENT_COLOR,
                values: cumulativeValues,
                area: true,
              },
            ]}
          />
        </div>

        <div className={cn(CARD, 'p-4 sm:p-5')}>
          <h2 className="mb-3 text-sm font-bold">Where it goes · {longMonthLabel(month)}</h2>
          {topCategories.length ? (
            <ul className="space-y-3">
              {topCategories.map((cat, i) => {
                const color = SERIES_PALETTE[i % SERIES_PALETTE.length]
                const href = cat.categoryId
                  ? `/dashboard/transactions?category_id=${cat.categoryId}&month=${month}&type=expense`
                  : null
                const inner = (
                  <>
                    <div className="mb-1.5 flex items-center gap-2 text-xs">
                      <span
                        className="size-2 shrink-0 rounded-sm"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{cat.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatCurrency(cat.value, currency)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(cat.value / categoryMax) * 100}%`, backgroundColor: color }}
                      />
                    </div>
                  </>
                )
                return (
                  <li key={`${cat.name}-${i}`}>
                    {href ? (
                      <Link href={href} className="block transition-opacity hover:opacity-80">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No category spending recorded for {longMonthLabel(month)}.
            </p>
          )}
          <Link
            href={`/dashboard/reports?month=${month}`}
            className="mt-4 inline-block text-xs font-medium text-primary hover:underline"
          >
            Full breakdown →
          </Link>
        </div>
      </div>

      {/* Month by month */}
      <div className={cn(CARD, 'p-4 sm:p-5')}>
        <h2 className="mb-3 text-sm font-bold">Month by month</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Month</th>
                <th className="py-2 pr-4 text-right font-medium">In</th>
                <th className="py-2 pr-4 text-right font-medium">Out</th>
                <th className="py-2 pr-4 text-right font-medium">Net</th>
                <th className="py-2 text-right font-medium">Savings rate</th>
              </tr>
            </thead>
            <tbody>
              {reversed.map((m) => (
                <tr key={m.month} className="border-b last:border-0">
                  <td className="whitespace-nowrap py-2.5 pr-4 font-medium">{longMonthLabel(m.month)}</td>
                  <td className={cn('py-2.5 pr-4 text-right tabular-nums', POSITIVE_CLASS)}>
                    {formatCurrency(m.income, currency)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-rose-600 dark:text-rose-400">
                    {formatCurrency(m.expenses, currency)}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 pr-4 text-right font-medium tabular-nums',
                      m.savings >= 0 ? POSITIVE_CLASS : NEGATIVE_CLASS
                    )}
                  >
                    {signedCurrency(m.savings, currency)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatPercent(m.savingsRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
