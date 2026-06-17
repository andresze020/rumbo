import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, Download, ScrollText, Tag, Store, Waves } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { MonthNav } from '@/components/month-nav'
import { Callout } from '@/components/callout'
import { CategoryDonut, type DonutSlice } from '@/components/category-donut'
import { LineTrendChart } from '@/components/analysis/charts'
import { buttonVariants } from '@/components/ui/button'
import { formatCurrency, formatCurrencyCompact, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  getHousehold,
  getMonthlySeries,
  getCategoryLookup,
  getExpenseCategories,
  getTopMerchants,
  lastNMonths,
  longMonthLabel,
  parseMonthParam,
  POSITIVE_COLOR,
  NEGATIVE_COLOR,
  SERIES_PALETTE,
  type CategorySlice,
  type MerchantSlice,
} from '@/lib/analysis/server'

type ReportsPageProps = {
  searchParams: Promise<{ month?: string; view?: string }>
}

const CARD = 'rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'
const TABS = [
  { key: 'category', label: 'By category', icon: Tag },
  { key: 'merchant', label: 'By merchant', icon: Store },
] as const

function deltaLabel(current: number, previous: number, higherIsBad = false): { text: string; good: boolean } | null {
  if (previous === 0) return null
  const diff = (current - previous) / Math.abs(previous)
  if (Math.abs(diff) < 0.0005) return { text: 'No change vs prev. month', good: true }
  const isUp = diff > 0
  const pct = new Intl.NumberFormat('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    Math.abs(diff) * 100
  )
  return { text: `${isUp ? '↑' : '↓'} ${pct}% vs prev. month`, good: higherIsBad ? !isUp : isUp }
}

function RankedList({
  rows,
  currency,
  emptyLabel,
  month,
  linkCategories,
}: {
  rows: Array<{ id: string | null; name: string; value: number; count: number }>
  currency: string
  emptyLabel: string
  month: string
  linkCategories: boolean
}) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{emptyLabel}</p>
  }
  const max = Math.max(...rows.map((r) => r.value)) || 1
  return (
    <ul className="space-y-3">
      {rows.map((row, i) => {
        const color = SERIES_PALETTE[i % SERIES_PALETTE.length]
        const href =
          linkCategories && row.id
            ? `/dashboard/transactions?category_id=${row.id}&month=${month}&type=expense`
            : null
        const inner = (
          <>
            <div className="mb-1.5 flex items-center gap-2 text-xs">
              <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.name}</span>
              <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(row.value, currency)}</span>
              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {row.count} tx
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${(row.value / max) * 100}%`, backgroundColor: color }} />
            </div>
          </>
        )
        return (
          <li key={`${row.name}-${i}`}>
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
  )
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams
  const month = parseMonthParam(params.month)
  const view = params.view === 'merchant' ? 'merchant' : 'category'
  const ctx = await getHousehold()
  const currency = ctx.household.base_currency

  const months = lastNMonths(month, 6)
  const [series, categoryLookup] = await Promise.all([getMonthlySeries(ctx, months), getCategoryLookup(ctx)])
  const [categories, merchants] = await Promise.all([
    getExpenseCategories(ctx, month, categoryLookup),
    getTopMerchants(ctx, month, 8),
  ])

  const thisMonth = series[series.length - 1] ?? { income: 0, expenses: 0, savings: 0, savingsRate: null }

  // 3-month trailing average (excluding current) for the KPI sublabels.
  const trailing = series.slice(0, -1).slice(-3)
  const avgSpend = trailing.length ? trailing.reduce((s, m) => s + m.expenses, 0) / trailing.length : 0
  const avgIncome = trailing.length ? trailing.reduce((s, m) => s + m.income, 0) / trailing.length : 0
  const spendVsAvg = deltaLabel(thisMonth.expenses, avgSpend, true)
  const incomeVsAvg = deltaLabel(thisMonth.income, avgIncome, false)

  const txCount = categories.reduce((s, c) => s + c.count, 0)
  const hasActivity = thisMonth.income !== 0 || thisMonth.expenses !== 0

  // Donut + ranked list source depends on the active tab.
  const TOP = 6
  const slices: CategorySlice[] | MerchantSlice[] = view === 'merchant' ? merchants : categories
  const donutSource = view === 'merchant' ? merchants : categories
  const donutData: DonutSlice[] = donutSource.slice(0, TOP).map((s) => ({
    name: s.name,
    value: s.value,
    categoryId: view === 'category' ? (s as CategorySlice).categoryId : null,
  }))
  const otherTotal = donutSource.slice(TOP).reduce((sum, s) => sum + s.value, 0)
  if (otherTotal > 0) donutData.push({ name: 'Other', value: otherTotal, categoryId: null })
  const donutTotal = donutSource.reduce((sum, s) => sum + s.value, 0)

  const rankedRows = (slices as Array<CategorySlice | MerchantSlice>).slice(0, 8).map((s) => ({
    id: view === 'category' ? (s as CategorySlice).categoryId : null,
    name: s.name,
    value: s.value,
    count: s.count,
  }))

  const kpis = [
    {
      label: 'Total spent',
      value: formatCurrency(thisMonth.expenses, currency),
      valueClass: 'text-red-600 dark:text-red-400',
      sub: spendVsAvg,
      icon: <ArrowDownRight />,
      accent: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
    },
    {
      label: 'Income',
      value: formatCurrency(thisMonth.income, currency),
      valueClass: 'text-emerald-600 dark:text-emerald-400',
      sub: incomeVsAvg,
      icon: <ArrowUpRight />,
      accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    },
    {
      label: 'Net flow',
      value: `${thisMonth.savings >= 0 ? '+' : '−'}${formatCurrency(Math.abs(thisMonth.savings), currency)}`,
      valueClass: thisMonth.savings >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      sub: { text: `${formatPercent(thisMonth.savingsRate)} savings rate`, good: thisMonth.savings >= 0 },
      icon: <Waves />,
      accent: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
    },
    {
      label: 'Transactions',
      value: String(txCount),
      valueClass: undefined,
      sub: { text: `across ${categories.length} categories`, good: true },
      icon: <ScrollText />,
      accent: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
    },
  ]

  return (
    <main className="mx-auto flex w-full max-w-[1340px] flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        eyebrow="Analysis"
        title="Reports"
        description={`Spending and income breakdowns for ${longMonthLabel(month)}.`}
        actions={
          <>
            <MonthNav
              month={month}
              basePath="/dashboard/reports"
              searchParams={{ view }}
              previousLabel="Previous month"
              nextLabel="Next month"
            />
            <Link
              href="/dashboard/export"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Download aria-hidden="true" />
              Export
            </Link>
          </>
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
          No posted income or expense activity for {longMonthLabel(month)}.
        </Callout>
      ) : null}

      {/* 6-month trend */}
      <div className={cn(CARD, 'p-4 sm:p-5')}>
        <h2 className="mb-1 text-sm font-bold">Trend · last 6 months</h2>
        <p className="mb-3 text-xs text-muted-foreground">Posted income vs. expenses in {currency}.</p>
        <LineTrendChart
          labels={series.map((m) => m.label)}
          formatValue={(v) => formatCurrencyCompact(v, currency)}
          series={[
            { key: 'expenses', label: 'Expenses', color: NEGATIVE_COLOR, values: series.map((m) => m.expenses), area: true },
            { key: 'income', label: 'Income', color: POSITIVE_COLOR, values: series.map((m) => m.income), dashed: true },
          ]}
        />
      </div>

      {/* Tabs */}
      <div className="flex w-full gap-1 overflow-x-auto rounded-xl border bg-muted/40 p-1 sm:w-fit">
        {TABS.map((tab) => {
          const active = view === tab.key
          const Icon = tab.icon
          return (
            <Link
              key={tab.key}
              href={`/dashboard/reports?month=${month}&view=${tab.key}`}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors sm:flex-none',
                active
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {tab.label}
            </Link>
          )
        })}
      </div>

      {/* Distribution + ranked list */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className={cn(CARD, 'p-4 sm:p-5')}>
          <h2 className="mb-3 text-sm font-bold">
            Distribution · {view === 'merchant' ? 'by merchant' : 'by category'}
          </h2>
          {donutData.length ? (
            <CategoryDonut data={donutData} currency={currency} total={donutTotal} totalLabel="Total" month={month} />
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No {view === 'merchant' ? 'merchant' : 'category'} spending recorded for {longMonthLabel(month)}.
            </p>
          )}
        </div>

        <div className={cn(CARD, 'p-4 sm:p-5')}>
          <h2 className="mb-3 text-sm font-bold">
            {view === 'merchant' ? 'Top merchants' : 'Top categories'}
          </h2>
          <RankedList
            rows={rankedRows}
            currency={currency}
            month={month}
            linkCategories={view === 'category'}
            emptyLabel={`No ${view === 'merchant' ? 'merchant' : 'category'} spending recorded for ${longMonthLabel(month)}.`}
          />
        </div>
      </div>

      {/* Cross-links */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={`/dashboard/cash-flow?month=${month}`} className={cn(CARD, 'flex items-center gap-3 p-4 transition-colors hover:bg-muted/40')}>
          <span className="flex size-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400" aria-hidden="true">
            <Waves className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Cash flow</p>
            <p className="text-xs text-muted-foreground">See how money moves in and out month by month.</p>
          </div>
        </Link>
        <Link href={`/dashboard/trends?month=${month}`} className={cn(CARD, 'flex items-center gap-3 p-4 transition-colors hover:bg-muted/40')}>
          <span className="flex size-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400" aria-hidden="true">
            <ScrollText className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Trends</p>
            <p className="text-xs text-muted-foreground">Track income, spending and savings over time.</p>
          </div>
        </Link>
      </div>
    </main>
  )
}
