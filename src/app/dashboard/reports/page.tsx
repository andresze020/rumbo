import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, Download, ScrollText, Tag, Store, Waves } from 'lucide-react'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { LocalizedClientBoundary } from '@/components/localized-client-boundary'
import { Callout } from '@/components/callout'
import { CategoryDonut, type DonutSlice } from '@/components/category-donut'
import { LineTrendChart } from '@/components/analysis/charts'
import { ReportFilters } from './report-filters'
import { buttonVariants } from '@/components/ui/button'
import type { MultiSelectOption } from '@/components/multi-select-chip'
import { formatCurrency, formatCurrencyCompact, formatPercent } from '@/lib/format'
import { localeToBcp47 } from '@/lib/format'
import { getLocale } from '@/lib/i18n/server'
import type { Locale } from '@/lib/i18n/dictionaries'
import { cn } from '@/lib/utils'
import {
  getHousehold,
  getCategoryLookup,
  currentMonthParam,
  monthStartDate,
  monthEndDate,
  longMonthLabel,
  shiftMonth,
  POSITIVE_COLOR,
  NEGATIVE_COLOR,
  SERIES_PALETTE,
} from '@/lib/analysis/server'
import { getReportData, type ReportFilters as ReportFilterValues } from '@/lib/analysis/report-query'

type ReportsPageProps = {
  searchParams: Promise<{
    month?: string
    view?: string
    type?: string
    date_from?: string
    date_to?: string
    account_id?: string | string[]
    category_id?: string | string[]
    tag_id?: string | string[]
  }>
}

const CARD = 'rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'
const TABS = [
  { key: 'category', label: 'By category', icon: Tag },
  { key: 'merchant', label: 'By merchant', icon: Store },
] as const

const ALL_TIME_FROM = '2000-01-01'
const ALL_TIME_TO = '2099-12-31'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function toArray(value: string | string[] | undefined): string[] {
  return (Array.isArray(value) ? value : value ? [value] : []).map((v) => v.trim()).filter(Boolean)
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

/** UTC-formatted range label (calendar dates render the same in any timezone). */
function rangeLabel(dateFrom: string, dateTo: string, locale: Locale): string {
  if (dateFrom <= ALL_TIME_FROM && dateTo >= ALL_TIME_TO) return 'all time'
  const fromMonth = dateFrom.slice(0, 7)
  const toMonth = dateTo.slice(0, 7)
  if (fromMonth === toMonth) return longMonthLabel(fromMonth, locale)
  const fmt = new Intl.DateTimeFormat(localeToBcp47(locale), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `${fmt.format(new Date(`${dateFrom}T00:00:00Z`))} – ${fmt.format(new Date(`${dateTo}T00:00:00Z`))}`
}

function RankedList({
  rows,
  currency,
  emptyLabel,
  locale,
}: {
  rows: Array<{ name: string; value: number; count: number; href: string | null }>
  currency: string
  emptyLabel: string
  locale: Locale
}) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{emptyLabel}</p>
  }
  const max = Math.max(...rows.map((r) => r.value)) || 1
  return (
    <ul className="space-y-3">
      {rows.map((row, i) => {
        const color = SERIES_PALETTE[i % SERIES_PALETTE.length]
        const inner = (
          <>
            <div className="mb-1.5 flex items-center gap-2 text-xs">
              <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.name}</span>
              <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(row.value, currency, locale)}</span>
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
            {row.href ? (
              <Link href={row.href} className="block transition-opacity hover:opacity-80">
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
  const locale = await getLocale()
  const view = params.view === 'merchant' ? 'merchant' : 'category'
  const selectedType =
    params.type === 'income' || params.type === 'expense' ? params.type : 'all'
  const accountIds = toArray(params.account_id)
  const categoryIds = toArray(params.category_id)
  const tagIds = toArray(params.tag_id)

  // Date range: an explicit from/to wins; otherwise fall back to a month
  // (default current month, which reads as the "This month" preset).
  const rawFrom = typeof params.date_from === 'string' ? params.date_from : ''
  const rawTo = typeof params.date_to === 'string' ? params.date_to : ''
  const hasCustomRange = ISO_DATE.test(rawFrom) && ISO_DATE.test(rawTo)
  const fallbackMonth =
    params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : currentMonthParam()
  const dateFrom = hasCustomRange ? rawFrom : monthStartDate(fallbackMonth)
  const dateTo = hasCustomRange ? rawTo : monthEndDate(fallbackMonth)

  const hasActiveFilters =
    hasCustomRange ||
    params.month !== undefined ||
    selectedType !== 'all' ||
    accountIds.length > 0 ||
    categoryIds.length > 0 ||
    tagIds.length > 0

  const ctx = await getHousehold()
  const currency = ctx.household.base_currency
  const categoryLookup = await getCategoryLookup(ctx)

  const [{ data: accountRows }, { data: tagRows }] = await Promise.all([
    ctx.supabase
      .from('accounts')
      .select('id, name, institution_name, currency_code, is_archived')
      .eq('household_id', ctx.household.id)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    ctx.supabase
      .from('tags')
      .select('id, name')
      .eq('household_id', ctx.household.id)
      .eq('is_archived', false)
      .order('name', { ascending: true }),
  ])

  const filters: ReportFilterValues = {
    dateFrom,
    dateTo,
    type: selectedType,
    accountIds,
    categoryIds,
    tagIds,
  }
  const report = await getReportData(ctx, filters, categoryLookup)

  // ── Filter options ──────────────────────────────────────────────────────
  const accountOptions: MultiSelectOption[] = (accountRows ?? []).map((a) => ({
    id: a.id as string,
    label: [a.name, a.institution_name, a.currency_code].filter(Boolean).join(' · '),
    isArchived: Boolean(a.is_archived),
  }))
  const categoryOptions: MultiSelectOption[] = [...categoryLookup.values()]
    .map((c) => ({
      id: c.id,
      label: c.parent_category_id
        ? `${categoryLookup.get(c.parent_category_id)?.name ?? '—'} / ${c.name}`
        : c.name,
      isArchived: c.is_archived,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const tagOptions: MultiSelectOption[] = (tagRows ?? []).map((t) => ({
    id: t.id as string,
    label: t.name as string,
  }))

  // ── URL builders (preserve the active filters) ──────────────────────────
  function reportHref(overrides: {
    view?: string
    dateFrom?: string
    dateTo?: string
  }) {
    const qs = new URLSearchParams()
    qs.set('view', overrides.view ?? view)
    if (selectedType !== 'all') qs.set('type', selectedType)
    for (const id of accountIds) qs.append('account_id', id)
    for (const id of categoryIds) qs.append('category_id', id)
    for (const id of tagIds) qs.append('tag_id', id)
    qs.set('date_from', overrides.dateFrom ?? dateFrom)
    qs.set('date_to', overrides.dateTo ?? dateTo)
    return `/dashboard/reports?${qs.toString()}`
  }

  const todayMonth = currentMonthParam()
  const today = todayIso()
  const thisYear = todayMonth.slice(0, 4)
  const rawPresets = [
    { label: 'This month', from: monthStartDate(todayMonth), to: monthEndDate(todayMonth) },
    {
      label: 'Last month',
      from: monthStartDate(shiftMonth(todayMonth, -1)),
      to: monthEndDate(shiftMonth(todayMonth, -1)),
    },
    { label: 'Last 3 months', from: monthStartDate(shiftMonth(todayMonth, -2)), to: today },
    { label: 'Last 6 months', from: monthStartDate(shiftMonth(todayMonth, -5)), to: today },
    { label: 'Year to date', from: `${thisYear}-01-01`, to: today },
    { label: 'All time', from: ALL_TIME_FROM, to: ALL_TIME_TO },
  ]
  const presetLinks = rawPresets.map((p) => ({
    label: p.label,
    href: reportHref({ dateFrom: p.from, dateTo: p.to }),
    isActive: dateFrom === p.from && dateTo === p.to,
  }))

  // Deep-link a ranked category into the transactions list, keeping the range.
  function categoryTxHref(categoryId: string) {
    const qs = new URLSearchParams()
    qs.set('date_from', dateFrom)
    qs.set('date_to', dateTo)
    qs.set('category_id', categoryId)
    qs.set('type', report.breakdownType)
    return `/dashboard/transactions?${qs.toString()}`
  }

  const flowNoun = report.breakdownType === 'income' ? 'income' : 'spending'
  const hasActivity = report.income !== 0 || report.expenses !== 0

  // ── Donut + ranked list (from filtered data) ────────────────────────────
  const TOP = 6
  const breakdown = view === 'merchant' ? report.merchants : report.categories
  const donutData: DonutSlice[] = breakdown.slice(0, TOP).map((s) => ({
    name: s.name,
    value: s.value,
    categoryId: view === 'category' ? (s as (typeof report.categories)[number]).categoryId : null,
  }))
  const otherTotal = breakdown.slice(TOP).reduce((sum, s) => sum + s.value, 0)
  if (otherTotal > 0) donutData.push({ name: 'Other', value: otherTotal, categoryId: null })
  const donutTotal = breakdown.reduce((sum, s) => sum + s.value, 0)

  const rankedRows = breakdown.slice(0, 8).map((s) => ({
    name: s.name,
    value: s.value,
    count: s.count,
    href:
      view === 'category'
        ? categoryTxHref((s as (typeof report.categories)[number]).categoryId)
        : null,
  }))

  const kpis = [
    {
      label: 'Total spent',
      value: formatCurrency(report.expenses, currency, locale),
      valueClass: 'text-red-600 dark:text-red-400',
      sub: null as string | null,
      icon: <ArrowDownRight />,
      accent: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
    },
    {
      label: 'Income',
      value: formatCurrency(report.income, currency, locale),
      valueClass: 'text-emerald-600 dark:text-emerald-400',
      sub: null,
      icon: <ArrowUpRight />,
      accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    },
    {
      label: 'Net flow',
      value: `${report.net >= 0 ? '+' : '−'}${formatCurrency(Math.abs(report.net), currency, locale)}`,
      valueClass: report.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      sub:
        report.income > 0
          ? `${formatPercent(report.net / report.income, locale)} savings rate`
          : null,
      icon: <Waves />,
      accent: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
    },
    {
      label: 'Transactions',
      value: String(report.txCount),
      valueClass: undefined,
      sub: `across ${report.categoryCount} categories`,
      icon: <ScrollText />,
      accent: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
    },
  ]

  return (
    <LocalizedClientBoundary>
    <main className="mx-auto flex w-full max-w-[1340px] flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        eyebrow="Analysis"
        title="Reports"
        description={`Spending and income breakdowns for ${rangeLabel(dateFrom, dateTo, locale)}.`}
        actions={
          <Link
            href="/dashboard/export"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Download aria-hidden="true" />
            Export
          </Link>
        }
      />

      {/* Filters */}
      <div className="rounded-xl border bg-card p-3 shadow-sm shadow-black/[0.03]">
        <ReportFilters
          view={view}
          selectedType={selectedType}
          selectedAccountIds={accountIds}
          selectedCategoryIds={categoryIds}
          selectedTagIds={tagIds}
          resolvedDateFrom={dateFrom}
          resolvedDateTo={dateTo}
          hasActiveFilters={hasActiveFilters}
          accountOptions={accountOptions}
          categoryOptions={categoryOptions}
          tagOptions={tagOptions}
          presetLinks={presetLinks}
        />
      </div>

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
              <p className="mt-1 text-[11.5px] font-medium text-muted-foreground">{kpi.sub}</p>
            ) : null}
          </div>
        ))}
      </div>

      {!hasActivity ? (
        <Callout variant="info" className="border-dashed text-muted-foreground">
          No posted income or expense activity for {rangeLabel(dateFrom, dateTo, locale)} with these filters.
        </Callout>
      ) : null}

      {/* 6-month trend (respects the active filters) */}
      <div className={cn(CARD, 'p-4 sm:p-5')}>
        <h2 className="mb-1 text-sm font-bold">Trend · last 6 months</h2>
        <p className="mb-3 text-xs text-muted-foreground">Posted income vs. expenses in {currency}.</p>
        <LineTrendChart
          labels={report.trend.map((m) => m.label)}
          formatValue={(v) => formatCurrencyCompact(v, currency, locale)}
          series={[
            { key: 'expenses', label: 'Expenses', color: NEGATIVE_COLOR, values: report.trend.map((m) => m.expenses), area: true },
            { key: 'income', label: 'Income', color: POSITIVE_COLOR, values: report.trend.map((m) => m.income), dashed: true },
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
              href={reportHref({ view: tab.key })}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors sm:flex-none',
                active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
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
            <CategoryDonut data={donutData} currency={currency} total={donutTotal} totalLabel="Total" month={dateTo.slice(0, 7)} />
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No {view === 'merchant' ? 'merchant' : 'category'} {flowNoun} for {rangeLabel(dateFrom, dateTo, locale)}.
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
            emptyLabel={`No ${view === 'merchant' ? 'merchant' : 'category'} ${flowNoun} for ${rangeLabel(dateFrom, dateTo, locale)}.`}
            locale={locale}
          />
        </div>
      </div>

      {/* Cross-links */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={`/dashboard/cash-flow?month=${dateTo.slice(0, 7)}`} className={cn(CARD, 'flex items-center gap-3 p-4 transition-colors hover:bg-muted/40')}>
          <span className="flex size-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400" aria-hidden="true">
            <Waves className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Cash flow</p>
            <p className="text-xs text-muted-foreground">See how money moves in and out month by month.</p>
          </div>
        </Link>
        <Link href={`/dashboard/trends?month=${dateTo.slice(0, 7)}`} className={cn(CARD, 'flex items-center gap-3 p-4 transition-colors hover:bg-muted/40')}>
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
    </LocalizedClientBoundary>
  )
}
