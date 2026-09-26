import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getRequestProfile, getRequestUser } from '@/lib/supabase/request'
import { groupByAsOfDate } from '@/lib/balances/multi-date'
import { balanceTrendDates, balanceTrendFromRows, type BalanceTrendRow } from '@/lib/net-worth/trend'
import { computeValuation, selectNetWorthAccounts } from '@/lib/net-worth/valuation'
import { monthEndDate, snapshotDateForMonth } from '@/lib/periods/month'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CashFlowCard } from '@/components/cash-flow-card'
import { InfoTooltip } from '@/components/info-tooltip'
import { HomeChecklist } from '@/components/home-checklist'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { Callout } from '@/components/callout'
import { FinancialHeroCard } from '@/components/financial-hero-card'
import { MonthNav } from '@/components/month-nav'
import { DashboardSecondaryWidgets } from './secondary-widgets'
import { SecondaryWidgetsSkeleton } from './secondary-widgets-skeleton'
import { getLocale } from '@/lib/i18n/server'
import { translate, type TranslationKey } from '@/lib/i18n/translate'
import type { Locale } from '@/lib/i18n/dictionaries'
import { formatCurrency, formatMonthLabel, formatPercent, localeToBcp47 } from '@/lib/format'
import { healthBreakdown } from '@/lib/health/score'
import { MonthHealthSummary } from '@/components/month-health-breakdown'
import { SpendingPaceCard } from '@/components/dashboard/spending-pace-card'
import { getDailyExpenses } from '@/lib/dashboard/daily-expenses'
import { buildSpendingPace } from '@/lib/dashboard/spending-pace'
import { getHomeChecklist } from '@/lib/home-checklist/server'
import { MAX_MONTHLY_TIMEFRAME_MONTHS, MONTHLY_TIMEFRAME_OPTIONS } from '@/lib/charts/timeframe-options'

export type AccountBalance = {
  account_id: string
  account_name: string
  account_type: string
  account_class: string
  currency_code: string
  include_in_net_worth: boolean
  is_archived: boolean
  posted_balance_account_currency: number | string
  pending_balance_account_currency: number | string
  projected_balance_account_currency: number | string
  posted_balance_base_currency: number | string
  pending_balance_base_currency: number | string
  projected_balance_base_currency: number | string
}

// RUM-006: one row per (as_of_date, account) from get_account_balances_as_of_many.
type MultiDateAccountBalance = AccountBalance & { as_of_date: string }

type DashboardPageProps = {
  searchParams: Promise<{ month?: string }>
}

type MonthlyDashboardSummary = {
  base_currency: string
  monthly_income: number | string
  monthly_expenses: number | string
  monthly_savings: number | string
  savings_rate: number | string | null
  income_transaction_count: number | string
  expense_transaction_count: number | string
}

export type BudgetDetailRow = {
  budget_id: string
  currency_code: string
  line_id: string | null
  category_id: string | null
  category_name: string | null
  planned_amount: number | string | null
  actual_amount: number | string | null
}

function getPreviousMonthDate(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(year, mon - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * "↓ 71% vs Aug": compact enough for three columns on a phone. Green or red by
 * whether the move is good for this line (spending going up is bad).
 */
function renderPctDelta(
  current: number,
  previous: number | null,
  locale: Locale,
  vsLabel: string,
  higherIsBad = false
) {
  if (previous === null || previous === 0) return null
  const diff = (current - previous) / Math.abs(previous)
  if (Math.abs(diff) < 0.0005) {
    return <span className="text-muted-foreground">{translate(locale, 'common.noChangeVsLastMonth')}</span>
  }
  const isUp = diff > 0
  const isGood = higherIsBad ? !isUp : isUp
  const formatted = new Intl.NumberFormat(localeToBcp47(locale), {
    maximumFractionDigits: Math.abs(diff) < 0.1 ? 1 : 0,
  }).format(Math.abs(diff) * 100)
  return (
    <span className={`font-medium ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {isUp ? '↑' : '↓'} {formatted}% <span className="font-normal text-muted-foreground">{vsLabel}</span>
    </span>
  )
}

function currentMonthParam() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

function parseDashboardMonth(month: string | undefined) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return currentMonthParam()
  const parsedDate = new Date(`${month}-01T00:00:00.000Z`)
  if (Number.isNaN(parsedDate.getTime())) return currentMonthParam()
  return month
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams
  const selectedMonth = parseDashboardMonth(params.month)
  const selectedMonthDate = `${selectedMonth}-01`
  const todayIso = new Date().toISOString().slice(0, 10)
  // RUM-003: the current, still-open month snapshots at today, not at its
  // (unrealized) month end — see snapshotDateForMonth's own doc comment.
  const selectedSnapshotDate = snapshotDateForMonth(selectedMonth, todayIso)
  const supabase = await createClient()
  const locale = await getLocale()
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars)

  // Shared with the layout's reads in this request (lib/supabase/request).
  const user = await getRequestUser()
  if (!user) redirect('/login')

  const profile = await getRequestProfile()
  if (!profile?.default_household_id) redirect('/onboarding')

  const { data: household, error } = await supabase
    .from('households')
    .select('id, name, base_currency, created_at')
    .eq('id', profile.default_household_id)
    .single()
  if (error || !household) redirect('/onboarding')

  const baseCurrency = household.base_currency as string
  const prevMonthDate = getPreviousMonthDate(selectedMonth)
  const prevMonthEndDate = monthEndDate(prevMonthDate.slice(0, 7))

  // RUM-005: these reads only depend on household.id and the date variables
  // computed above — none of them reads another's result. Everything that's
  // ONLY needed below the fold (categories, expense-by-category, recurring,
  // debts, goals, recent transactions, review count) now lives in
  // DashboardSecondaryWidgets (./secondary-widgets.tsx), fetched inside its
  // own <Suspense> boundary instead of blocking this render. budgetRows stays
  // here (not deferred) because computeHealthScore below needs it and its
  // output renders in the top-of-fold hero card — see the ticket doc for why.
  // One balance pass for everything the page values: this month, last month's
  // end (the delta) and the net-worth sparkline's longest selectable range
  // (2026-09-26: sent once, sliced client-side per timeframe pill — still
  // one get_account_balances_as_of_many call, just with more dates in it).
  // The trend used to make its own get_account_balances_as_of_many call
  // through getDashboardTrend, with its own auth + profile lookups (2026-09-25).
  const trendDates = balanceTrendDates(selectedMonth, MAX_MONTHLY_TIMEFRAME_MONTHS, todayIso)
  const balanceDates = [...new Set([...trendDates.snapshotDates, selectedSnapshotDate, prevMonthEndDate])]

  const [
    { data: multiDateBalances, error: accountBalancesError },
    { data: monthlySummaryRows, error: monthlySummaryError },
    { data: prevSummaryRows },
    { data: budgetRows, error: budgetError },
    { count: nonOpeningTransactionCount },
    { count: needsReviewCount },
    dailyExpenses,
  ] = await Promise.all([
    // RUM-006: get_account_balances has no lower date bound, so one call per
    // date re-aggregated the whole ledger each time; get_account_balances_as_of_many
    // answers every date from a single pass. See docs/performance-baseline.md.
    supabase.rpc('get_account_balances_as_of_many', {
      p_household_id: household.id,
      p_as_of_dates: balanceDates,
    }),
    supabase.rpc('get_monthly_dashboard_summary', {
      p_household_id: household.id,
      p_month: selectedMonthDate,
    }),
    supabase.rpc('get_monthly_dashboard_summary', {
      p_household_id: household.id,
      p_month: prevMonthDate,
    }),
    supabase.rpc('get_monthly_budget_details', {
      p_household_id: household.id,
      p_budget_month: selectedMonthDate,
    }),
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', household.id)
      .neq('transaction_type', 'opening_balance')
      .is('deleted_at', null),
    // RUM-009: the month on screen's review backlog (not all time). Moved up
    // from the removed Recent activity card to the cash-flow card's header.
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', household.id)
      .eq('review_status', 'unreviewed')
      .neq('transaction_type', 'opening_balance')
      .neq('status', 'voided')
      .is('deleted_at', null)
      .gte('transaction_date', selectedMonthDate)
      .lte('transaction_date', monthEndDate(selectedMonth)),
    // Spending pace (2026-09-26): expense per day for last month and this
    // one, the same allocations get_monthly_dashboard_summary adds up.
    getDailyExpenses(supabase, household.id, prevMonthDate, monthEndDate(selectedMonth)),
  ])
  const balancesByDate = groupByAsOfDate((multiDateBalances ?? []) as MultiDateAccountBalance[])
  const accountBalances = balancesByDate.get(selectedSnapshotDate) ?? []
  const prevBalanceRows = balancesByDate.get(prevMonthEndDate) ?? []

  const balances = accountBalances
  const monthlySummary = ((monthlySummaryRows ?? [])[0] as MonthlyDashboardSummary | undefined) ?? null
  const prevSummary = ((prevSummaryRows ?? [])[0] as MonthlyDashboardSummary | undefined) ?? null
  const budgetDetails = (budgetRows ?? []) as BudgetDetailRow[]
  const budgetLines = budgetDetails.filter((row) => row.line_id !== null)
  const totalBudgetPlanned = budgetLines.reduce((s, l) => s + Number(l.planned_amount ?? 0), 0)
  const totalBudgetSpent = budgetLines.reduce((s, l) => s + Number(l.actual_amount ?? 0), 0)
  const totalBudgetPercent = totalBudgetPlanned > 0 ? totalBudgetSpent / totalBudgetPlanned : 0
  const budgetCurrency = budgetDetails[0]?.currency_code ?? baseCurrency
  const hasBudget = budgetLines.length > 0 && totalBudgetPlanned > 0

  // The Control center nudge: "Getting started" for a household's first two
  // months, then a month-by-month checklist that is useful for as long as the
  // account lives. `null` means there is nothing left to nudge about.
  const homeChecklist = await getHomeChecklist({
    supabase,
    householdId: household.id,
    householdCreatedAt: (household.created_at as string | null) ?? null,
    month: selectedMonth,
    hasAccounts: balances.length > 0,
    hasTransactions: (nonOpeningTransactionCount ?? 0) > 0,
    hasBudget,
    previousMonthHasActivity:
      Number(prevSummary?.monthly_income ?? 0) !== 0 ||
      Number(prevSummary?.monthly_expenses ?? 0) !== 0,
  })

  const dashboardCurrency = monthlySummary?.base_currency ?? baseCurrency
  const monthlyIncome = Number(monthlySummary?.monthly_income ?? 0)
  const monthlyExpenses = Number(monthlySummary?.monthly_expenses ?? 0)
  const monthlySavings = Number(monthlySummary?.monthly_savings ?? 0)
  const prevIncome = prevSummary ? Number(prevSummary.monthly_income) : null
  const prevExpenses = prevSummary ? Number(prevSummary.monthly_expenses) : null
  const prevSavings = prevSummary ? Number(prevSummary.monthly_savings) : null
  const hasMonthlyActivity =
    Number(monthlySummary?.income_transaction_count ?? 0) > 0 ||
    Number(monthlySummary?.expense_transaction_count ?? 0) > 0

  const valuation = computeValuation(selectNetWorthAccounts(balances))
  const { totalAssets, totalLiabilities, netWorth, projectedNetWorth } = valuation

  // Previous month-end position → net-worth delta + debt-down insight.
  const prevValuation = computeValuation(selectNetWorthAccounts(prevBalanceRows))
  const { netWorth: prevNetWorth, totalLiabilities: prevLiabilities } = prevValuation
  const netWorthDeltaPct = prevNetWorth !== 0 ? (netWorth - prevNetWorth) / Math.abs(prevNetWorth) : null

  // ── Health score (BR-021): shared real formula (see lib/health/score). ─────
  const health = healthBreakdown({
    savingsRate: monthlySummary?.savings_rate != null ? Number(monthlySummary.savings_rate) : null,
    hasBudget,
    budgetPercent: totalBudgetPercent,
  })

  const bcp47 = localeToBcp47(locale)
  const monthName = (isoDate: string, month: 'short' | 'long', withYear = false) =>
    new Intl.DateTimeFormat(bcp47, { month, ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(
      new Date(`${isoDate.slice(0, 7)}-01T00:00:00Z`)
    )

  const trendPoints = balanceTrendFromRows(
    (multiDateBalances ?? []) as BalanceTrendRow[],
    trendDates,
    'net-worth'
  )
  const heroTrend = {
    values: trendPoints.map((d) => d.value),
    labels: trendDates.monthDates.map((d) => monthName(d, 'long', true)),
    ticks: trendDates.monthDates.map((d) => monthName(d, 'short')),
  }
  // One pre-translated aria-label per pill (3M/6M/1Y): the count in each
  // is just that option's months, so there's no need for client-side i18n.
  const trendAriaByMonths: Record<number, string> = Object.fromEntries(
    MONTHLY_TIMEFRAME_OPTIONS.map((option) => [
      option.months,
      t('dashboard.netWorthTrendAria', { count: option.months }),
    ])
  )
  // Last month's end only compares when there were accounts then; a first
  // month would otherwise show its whole net worth as "growth".
  const netWorthDelta = prevBalanceRows.length
    ? { amount: netWorth - prevNetWorth, pct: netWorthDeltaPct }
    : null

  // "vs Aug": the comparison month, short, in the reader's language.
  const vsLabel = t('dashboard.vsMonth', { month: monthName(prevMonthDate, 'short') })

  // ── Spending pace (2026-09-26). Shown only when its running total lands on
  // exactly the "Spent" figure from get_monthly_dashboard_summary: two
  // different numbers for the same thing on one screen is worse than no chart.
  const pace = dailyExpenses.error ? null : buildSpendingPace(selectedMonth, todayIso, dailyExpenses.amounts)
  const paceSpent = pace ? pace.current[pace.current.length - 1] ?? 0 : 0
  const paceAgrees = pace !== null && Math.abs(paceSpent - monthlyExpenses) < 0.01
  if (pace && !paceAgrees) {
    console.warn('[dashboard] spending pace total differs from the monthly summary', {
      month: selectedMonth,
      pace: paceSpent,
      summary: monthlyExpenses,
    })
  }
  const isOpenMonth = selectedMonth === todayIso.slice(0, 7)
  const prevMonthLong = monthName(prevMonthDate, 'long')
  const paceComparison = (() => {
    if (!pace || !paceAgrees || pace.previous[pace.previous.length - 1] === 0) return null
    const diff = pace.diffAtSameDay
    if (Math.abs(diff) < 0.005) return { text: t('dashboard.paceSame', { month: prevMonthLong }), tone: 'neutral' as const }
    const vars = { amount: formatCurrency(Math.abs(diff), dashboardCurrency), month: prevMonthLong }
    const key: TranslationKey = isOpenMonth
      ? diff < 0 ? 'dashboard.paceLessSameDay' : 'dashboard.paceMoreSameDay'
      : diff < 0 ? 'dashboard.paceLessMonth' : 'dashboard.paceMoreMonth'
    return { text: t(key, vars), tone: diff < 0 ? ('good' as const) : ('bad' as const) }
  })()
  const savingsRate = monthlySummary?.savings_rate != null ? Number(monthlySummary.savings_rate) : null
  const spentShare = monthlyIncome > 0 ? monthlyExpenses / monthlyIncome : null
  const barCaption =
    spentShare === null
      ? t('dashboard.cashFlowNoIncome')
      : t('dashboard.cashFlowSpentShare', {
          spent: formatPercent(spentShare, locale, { minimumFractionDigits: 0 }),
          saved: formatPercent(savingsRate, locale),
        })

  // expenseCategoriesError / categoryLookupError moved to DashboardSecondaryWidgets
  // with the fetches they gate — this only covers the two Tier-1 reads.
  const hasLoadError = accountBalancesError || monthlySummaryError

  return (
    <main className="mx-auto flex w-full max-w-[1340px] flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        title={t('dashboard.title')}
        actions={
          <MonthNav month={selectedMonth} basePath="/dashboard" previousLabel={t('common.previousMonth')} nextLabel={t('common.nextMonth')} />
        }
      />

      {homeChecklist ? <HomeChecklist checklist={homeChecklist} /> : null}

      {hasLoadError ? <Callout variant="error">{t('dashboard.loadError')}</Callout> : null}

      {!accountBalancesError && !balances.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.summaryTitle')}</CardTitle>
            <CardDescription>{t('dashboard.summaryDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/accounts" className={buttonVariants({ variant: 'default' })}>{t('dashboard.goToAccounts')}</Link>
          </CardContent>
        </Card>
      ) : null}

      {balances.length ? (
        <>
          {/* Hero */}
          <FinancialHeroCard
            netWorth={netWorth}
            assets={totalAssets}
            liabilities={totalLiabilities}
            projected={projectedNetWorth}
            delta={netWorthDelta}
            currency={baseCurrency}
            trend={heroTrend}
            defaultTrendMonths={6}
            trendAriaByMonths={trendAriaByMonths}
            labels={{
              netWorth: t('dashboard.heroEyebrow'),
              assets: t('dashboard.heroAssets'),
              liabilities: t('dashboard.heroLiabilities'),
              projected: t('dashboard.heroProjected'),
              vsPrev: vsLabel,
              trendSeries: t('dashboard.heroEyebrow'),
              trendRangeAria: t('dashboard.trendRangeAria'),
            }}
          />

          {/* The month (2026-09-26): spending pace (this month's running
              total against last month's) beside the cash-flow statement,
              with Month health (BR-021 / RUM-009) as its footer — the full
              breakdown stays one click away under "Details". Without a pace
              chart the cash-flow card takes the whole row. */}
          <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] [&>*]:min-w-0">
            {pace && paceAgrees ? (
              <SpendingPaceCard
                pace={pace}
                currency={dashboardCurrency}
                labels={{
                  title: t('dashboard.paceTitle'),
                  comparison: paceComparison?.text ?? null,
                  comparisonTone: paceComparison?.tone ?? 'neutral',
                  currentSeries: monthName(selectedMonthDate, 'long'),
                  previousSeries: prevMonthLong,
                  dayLabels: Array.from({ length: pace.daysInMonth }, (_, i) =>
                    t('dashboard.paceDay', { day: i + 1 })
                  ),
                  ariaLabel: t('dashboard.paceAria', { month: monthName(selectedMonthDate, 'long'), previous: prevMonthLong }),
                }}
              />
            ) : null}
            <CashFlowCard
              className={pace && paceAgrees ? undefined : 'lg:col-span-2'}
              title={t('nav.cashFlow')}
              currency={dashboardCurrency}
              income={{
                label: t('dashboard.cashFlowIncome'),
                amount: monthlyIncome,
                delta: renderPctDelta(monthlyIncome, prevIncome, locale, vsLabel),
              }}
              spent={{
                label: t('dashboard.cashFlowSpent'),
                amount: monthlyExpenses,
                delta: renderPctDelta(monthlyExpenses, prevExpenses, locale, vsLabel, true),
              }}
              saved={{
                label: t('dashboard.cashFlowSaved'),
                amount: monthlySavings,
                delta: renderPctDelta(monthlySavings, prevSavings, locale, vsLabel),
                tone: monthlySavings < 0 ? 'negative' : 'default',
              }}
              spentShare={spentShare}
              barCaption={barCaption}
              review={
                needsReviewCount
                  ? {
                      href: `/dashboard/transactions?review=unreviewed&status=posted&status=pending&month=${selectedMonth}`,
                      label: t('dashboard.needsReviewShort', { count: needsReviewCount }),
                    }
                  : null
              }
              trends={{ href: `/dashboard/trends?month=${selectedMonth}`, label: t('dashboard.viewTrends') }}
              footer={
                <MonthHealthSummary
                  breakdown={health}
                  month={selectedMonth}
                  locale={locale}
                  tooltip={<InfoTooltip text={t('dashboard.healthScoreTooltip')} label={t('dashboard.monthHealth')} />}
                />
              }
            />
          </div>

          {!hasMonthlyActivity ? (
            <Callout variant="info" className="border-dashed text-muted-foreground">
              {t('dashboard.noActivity', { month: formatMonthLabel(selectedMonth, locale) })}
            </Callout>
          ) : null}

          {/* Budget, category breakdown, upcoming bills, insights, debts,
              goals, recent activity — RUM-005: streams in behind its own
              Suspense boundary instead of blocking everything above.
              `key={selectedMonth}` (B-7): without it, a month change is a
              transition that keeps this already-revealed boundary on screen
              until its new content streams in — and with this much streamed
              content that transition intermittently never committed, so the
              ‹ / › click was silently lost (5/7 in perf:nav). Keying by month
              makes each month a fresh boundary: the click commits at once and
              this section shows its skeleton while the new month streams. */}
          <Suspense
            key={selectedMonth}
            fallback={
              <div role="status" aria-live="polite">
                <span className="sr-only">Loading more of your dashboard…</span>
                <SecondaryWidgetsSkeleton />
              </div>
            }
          >
            <DashboardSecondaryWidgets
              householdId={household.id}
              baseCurrency={baseCurrency}
              selectedMonth={selectedMonth}
              dashboardCurrency={dashboardCurrency}
              monthlyExpenses={monthlyExpenses}
              hasMonthlyActivity={hasMonthlyActivity}
              monthlySavings={monthlySavings}
              balances={balances}
              budgetLines={budgetLines}
              hasBudget={hasBudget}
              budgetCurrency={budgetCurrency}
              totalBudgetPercent={totalBudgetPercent}
              budgetError={Boolean(budgetError)}
              totalLiabilities={totalLiabilities}
              prevLiabilities={prevLiabilities}
              locale={locale}
              t={t}
            />
          </Suspense>
        </>
      ) : null}
    </main>
  )
}
