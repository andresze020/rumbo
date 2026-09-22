import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowUpRight,
  Percent,
  PiggyBank,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { groupByAsOfDate } from '@/lib/balances/multi-date'
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
import { MetricCard } from '@/components/metric-card'
import { InfoTooltip } from '@/components/info-tooltip'
import { HomeChecklist } from '@/components/home-checklist'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { Callout } from '@/components/callout'
import { FinancialHeroCard } from '@/components/financial-hero-card'
import { MonthNav } from '@/components/month-nav'
import { getDashboardTrend } from './trend-actions'
import { DashboardSecondaryWidgets } from './secondary-widgets'
import { SecondaryWidgetsSkeleton } from './secondary-widgets-skeleton'
import { getLocale } from '@/lib/i18n/server'
import { translate, type TranslationKey } from '@/lib/i18n/translate'
import type { Locale } from '@/lib/i18n/dictionaries'
import { formatCurrency, formatMonthLabel, formatPercent, formatTransactionCount, localeToBcp47 } from '@/lib/format'
import { computeHealthScore, healthGrade as computeHealthGrade } from '@/lib/health/score'
import { getHomeChecklist } from '@/lib/home-checklist/server'
import { cn } from '@/lib/utils'

const ACCENT = {
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
  primary: 'bg-primary/10 text-primary',
} as const

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

function renderPctDelta(
  current: number,
  previous: number | null,
  locale: Locale,
  higherIsBad = false
) {
  if (previous === null || previous === 0) return null
  const diff = (current - previous) / Math.abs(previous)
  if (Math.abs(diff) < 0.0005) {
    return <span className="text-xs text-muted-foreground">{translate(locale, 'common.noChangeVsLastMonth')}</span>
  }
  const isUp = diff > 0
  const isGood = higherIsBad ? !isUp : isUp
  const arrow = isUp ? '↑' : '↓'
  const formatted = new Intl.NumberFormat(localeToBcp47(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(diff) * 100)
  return (
    <span className={`text-xs font-medium ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {arrow} {formatted}% {translate(locale, 'common.vsLastMonth')}
    </span>
  )
}

function renderRateDelta(diff: number | null, locale: Locale) {
  if (diff === null) return null
  if (Math.abs(diff) < 0.0001) return <span className="text-xs text-muted-foreground">{translate(locale, 'common.noChangeVsLastMonth')}</span>
  const isUp = diff > 0
  const arrow = isUp ? '↑' : '↓'
  const formatted = new Intl.NumberFormat(localeToBcp47(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(diff * 100))
  return (
    <span className={`text-xs font-medium ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {arrow} {formatted} {translate(locale, 'common.ppVsLastMonth')}
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
  const dateFmt = new Intl.DateTimeFormat(localeToBcp47(locale), { month: 'short', day: 'numeric' })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id, display_name')
    .eq('id', user.id)
    .maybeSingle()
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

  // RUM-005: these 6 reads only depend on household.id and the date variables
  // computed above — none of them reads another's result. Everything that's
  // ONLY needed below the fold (categories, expense-by-category, recurring,
  // debts, goals, recent transactions, review count) now lives in
  // DashboardSecondaryWidgets (./secondary-widgets.tsx), fetched inside its
  // own <Suspense> boundary instead of blocking this render. budgetRows stays
  // here (not deferred) because computeHealthScore below needs it and its
  // output renders in the top-of-fold hero card — see the ticket doc for why.
  const [
    { data: multiDateBalances, error: accountBalancesError },
    { data: monthlySummaryRows, error: monthlySummaryError },
    { data: prevSummaryRows },
    { data: budgetRows, error: budgetError },
    { count: nonOpeningTransactionCount },
    netWorthTrend,
  ] = await Promise.all([
    // RUM-006: this month + the previous month used to be 2 separate calls to
    // get_account_balances, each re-aggregating the whole ledger from scratch
    // (it has no lower date bound — RUM-001 measured its cost as flat
    // regardless of as_of_date). One call to get_account_balances_as_of_many
    // answers both dates from a single pass. See docs/performance-baseline.md.
    supabase.rpc('get_account_balances_as_of_many', {
      p_household_id: household.id,
      p_as_of_dates: [selectedSnapshotDate, prevMonthEndDate],
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
    // Only depends on selectedMonth, known from the top of this function —
    // previously awaited last, after everything else in this function had
    // already resolved, for no reason.
    getDashboardTrend('net-worth', selectedMonth, 6),
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
  const savingsRateDelta =
    prevSummary !== null && monthlySummary?.savings_rate != null && prevSummary.savings_rate != null
      ? Number(monthlySummary.savings_rate) - Number(prevSummary.savings_rate)
      : null
  const hasMonthlyActivity =
    Number(monthlySummary?.income_transaction_count ?? 0) > 0 ||
    Number(monthlySummary?.expense_transaction_count ?? 0) > 0

  const valuation = computeValuation(selectNetWorthAccounts(balances))
  const { totalAssets, totalLiabilities, netWorth, projectedNetWorth } = valuation

  // Previous month-end position → net-worth delta + debt-down insight.
  const prevValuation = computeValuation(selectNetWorthAccounts(prevBalanceRows))
  const { netWorth: prevNetWorth, totalLiabilities: prevLiabilities } = prevValuation
  const netWorthDeltaPct = prevNetWorth !== 0 ? (netWorth - prevNetWorth) / Math.abs(prevNetWorth) : null

  const incomeTransactionCount = Number(monthlySummary?.income_transaction_count ?? 0)
  const expenseTransactionCount = Number(monthlySummary?.expense_transaction_count ?? 0)

  const monthlyCards = [
    {
      label: t('dashboard.monthlyIncome'),
      value: formatCurrency(monthlyIncome, dashboardCurrency),
      description: formatTransactionCount(incomeTransactionCount, 'posted income transaction'),
      delta: renderPctDelta(monthlyIncome, prevIncome, locale, false),
      icon: <ArrowUpRight />,
      accent: ACCENT.emerald,
      valueClassName: undefined as string | undefined,
    },
    {
      label: t('dashboard.monthlyExpenses'),
      value: formatCurrency(monthlyExpenses, dashboardCurrency),
      description: formatTransactionCount(expenseTransactionCount, 'posted expense transaction'),
      delta: renderPctDelta(monthlyExpenses, prevExpenses, locale, true),
      icon: <ArrowDownRight />,
      accent: ACCENT.rose,
      valueClassName: undefined as string | undefined,
    },
    {
      label: t('dashboard.monthlySavings'),
      value: formatCurrency(monthlySavings, dashboardCurrency),
      description: t('dashboard.monthlySavingsDescription'),
      delta: renderPctDelta(monthlySavings, prevSavings, locale, false),
      icon: <PiggyBank />,
      accent: ACCENT.sky,
      valueClassName: monthlySavings < 0 ? 'text-red-600 dark:text-red-400' : undefined,
    },
    {
      label: t('dashboard.savingsRate'),
      value: formatPercent(monthlySummary?.savings_rate ?? null, locale),
      description: t('dashboard.savingsRateDescription'),
      delta: renderRateDelta(savingsRateDelta, locale),
      icon: <Percent />,
      accent: ACCENT.violet,
      valueClassName: undefined as string | undefined,
      tooltip: <InfoTooltip term="savingsRate" label={t('dashboard.savingsRate')} />,
    },
  ]

  // ── Health score (BR-021): shared real formula (see lib/health/score). ─────
  const healthScore = computeHealthScore({
    savingsRate: monthlySummary?.savings_rate != null ? Number(monthlySummary.savings_rate) : null,
    hasBudget,
    budgetPercent: totalBudgetPercent,
  })

  const spark = netWorthTrend.ok ? netWorthTrend.data.map((d) => d.value) : []

  const firstName = profile.display_name?.trim().split(/\s+/)[0] || household.name
  const eyebrow = `${t('dashboard.greeting')}, ${firstName}`

  // expenseCategoriesError / categoryLookupError moved to DashboardSecondaryWidgets
  // with the fetches they gate — this only covers the two Tier-1 reads.
  const hasLoadError = accountBalancesError || monthlySummaryError
  const cardClass = 'rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'
  const score = healthScore
  const healthGrade = computeHealthGrade(score)

  return (
    <main className="mx-auto flex w-full max-w-[1340px] flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        eyebrow={eyebrow}
        title={t('dashboard.controlCenter')}
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
            deltaPct={netWorthDeltaPct}
            currency={baseCurrency}
            spark={spark}
            healthScore={healthScore}
            labels={{
              netWorth: t('dashboard.heroEyebrow'),
              assets: t('dashboard.heroAssets'),
              liabilities: t('dashboard.heroLiabilities'),
              projected: t('dashboard.heroProjected'),
              monthHealth: t('dashboard.monthHealth'),
              vsPrev: t('common.vsLastMonth'),
              healthTooltip: t('dashboard.healthScoreTooltip'),
            }}
          />

          {/* Monthly metrics */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">{t('dashboard.thisMonthTitle')}</h2>
              <Link
                href={`/dashboard/trends?month=${selectedMonth}`}
                className="shrink-0 text-xs font-semibold text-primary hover:underline"
              >
                {t('dashboard.viewTrends')} →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
              {monthlyCards.map((c) => (
                <MetricCard
                  key={c.label}
                  label={c.label}
                  value={c.value}
                  description={c.description}
                  delta={c.delta}
                  icon={c.icon}
                  accent={c.accent}
                  valueClassName={c.valueClassName}
                  tooltip={'tooltip' in c ? c.tooltip : undefined}
                />
              ))}
            </div>
          </section>

          {/* Mobile-only month health card */}
          <div className={cn(cardClass, 'flex items-center gap-4 p-4 lg:hidden')}>
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full border-[3px] border-primary bg-primary/10">
              <span className="text-base font-bold text-primary">{healthGrade}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-sm font-semibold">
                {t('dashboard.monthHealth')}
                <InfoTooltip text={t('dashboard.healthScoreTooltip')} label={t('dashboard.monthHealth')} />
              </div>
              <p className="text-xs text-muted-foreground">{score}/100</p>
            </div>
          </div>

          {!hasMonthlyActivity ? (
            <Callout variant="info" className="border-dashed text-muted-foreground">
              {t('dashboard.noActivity', { month: formatMonthLabel(selectedMonth, locale) })}
            </Callout>
          ) : null}

          {/* Budget, category breakdown, upcoming bills, insights, debts,
              goals, recent activity — RUM-005: streams in behind its own
              Suspense boundary instead of blocking everything above. */}
          <Suspense fallback={<SecondaryWidgetsSkeleton />}>
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
              dateFmt={dateFmt}
            />
          </Suspense>
        </>
      ) : null}
    </main>
  )
}
