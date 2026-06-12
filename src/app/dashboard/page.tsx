import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowUpRight,
  PiggyBank,
  Percent,
  Scale,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
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
import { DashboardSummary } from '@/components/dashboard-summary'
import { GettingStartedChecklist } from '@/components/getting-started-checklist'
import { PageHeader } from '@/components/page-header'
import { SectionHeading } from '@/components/section-heading'
import { Callout } from '@/components/callout'
import { AccountAvatar } from '@/components/account-avatar'
import { AccountCardDetails } from './accounts/account-card-details'
import { AccountGroup } from '@/components/account-group'
import { AccountsViewToggle } from '@/components/accounts-view-toggle'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'
import { MonthNav } from '@/components/month-nav'
import { getAccountsView } from '@/lib/accounts-view/server'
import { groupAccountsByType } from '@/lib/accounts-view/group'
import { getLocale } from '@/lib/i18n/server'
import { translate, type TranslationKey } from '@/lib/i18n/translate'
import type { Locale } from '@/lib/i18n/dictionaries'

const ACCENT = {
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
  primary: 'bg-primary/10 text-primary',
} as const

type AccountBalance = {
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

type DashboardPageProps = {
  searchParams: Promise<{
    month?: string
  }>
}

type MonthlyDashboardSummary = {
  household_id: string
  month_start: string
  month_end: string
  base_currency: string
  monthly_income: number | string
  monthly_expenses: number | string
  monthly_savings: number | string
  savings_rate: number | string | null
  income_transaction_count: number | string
  expense_transaction_count: number | string
}

type MonthlyExpenseCategory = {
  category_id: string
  category_name: string
  parent_category_id: string | null
  amount_base_currency: number | string
  transaction_count: number | string
}

type CategoryLookup = {
  id: string
  name: string
  parent_category_id: string | null
  is_archived: boolean
}

type BudgetDetailRow = {
  budget_id: string
  household_id: string
  budget_month: string
  budget_status: string
  currency_code: string
  line_id: string | null
  category_id: string | null
  category_name: string | null
  parent_category_id: string | null
  category_is_archived: boolean | null
  category_exclude_from_budget: boolean | null
  category_exclude_from_reports: boolean | null
  planned_amount: number | string | null
  actual_amount: number | string | null
  transaction_count: number | string | null
}

type AccountMeta = {
  id: string
  institution_name: string | null
  last_four: string | null
  icon: string | null
  color: string | null
}

function getPreviousMonthDate(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(year, mon - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function renderDelta(diff: number | null, currency: string, locale: Locale, higherIsBad = false) {
  if (diff === null) return null
  if (Math.abs(diff) < 0.01) return <span className="text-xs text-muted-foreground">{translate(locale, 'common.noChangeVsLastMonth')}</span>
  const isUp = diff > 0
  const isGood = higherIsBad ? !isUp : isUp
  const arrow = isUp ? '↑' : '↓'
  const formatted = formatCurrency(Math.abs(diff), currency)
  return (
    <span className={`text-xs font-medium ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {arrow} {formatted} {translate(locale, 'common.vsLastMonth')}
    </span>
  )
}

function renderRateDelta(diff: number | null, locale: Locale) {
  if (diff === null) return null
  if (Math.abs(diff) < 0.0001) return <span className="text-xs text-muted-foreground">{translate(locale, 'common.noChangeVsLastMonth')}</span>
  const isUp = diff > 0
  const isGood = isUp
  const arrow = isUp ? '↑' : '↓'
  const formatted = new Intl.NumberFormat('en-CA', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(diff * 100))
  return (
    <span className={`text-xs font-medium ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {arrow} {formatted} {translate(locale, 'common.ppVsLastMonth')}
    </span>
  )
}

function currentMonthParam() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}

function parseDashboardMonth(month: string | undefined) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return currentMonthParam()
  }

  const parsedDate = new Date(`${month}-01T00:00:00.000Z`)

  if (Number.isNaN(parsedDate.getTime())) {
    return currentMonthParam()
  }

  return month
}

function formatCurrency(value: number, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(value)
}

function formatTransactionCount(count: number, descriptor = 'transaction') {
  return `${count} ${descriptor}${count === 1 ? '' : 's'}`
}

function getDisplayedLiabilityBalance(value: number | string) {
  const numericValue = Number(value)

  return Math.max(0, -numericValue)
}

function liabilityDisplay(value: number | string) {
  return Math.max(0, -Number(value))
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

function formatPercent(value: number | string | null, locale: Locale) {
  if (value === null) {
    return translate(locale, 'common.notAvailable')
  }

  return new Intl.NumberFormat('en-CA', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value))
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const monthDate = new Date(year, monthNumber - 1, 1)

  return new Intl.DateTimeFormat('en-CA', {
    month: 'long',
    year: 'numeric',
  }).format(monthDate)
}

function getMonthEndDate(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)

  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
}

function getCategoryPath(
  category: {
    category_id: string
    category_name: string
    parent_category_id: string | null
  },
  categoriesById: Map<string, CategoryLookup>
) {
  const categoryRow = categoriesById.get(category.category_id)
  const parentId = categoryRow?.parent_category_id ?? category.parent_category_id
  const parentName = parentId ? categoriesById.get(parentId)?.name : null
  const categoryName = categoryRow?.name ?? category.category_name

  return {
    name: parentName ? `${parentName} / ${categoryName}` : categoryName,
    isArchived: categoryRow?.is_archived ?? false,
  }
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = await searchParams
  const selectedMonth = parseDashboardMonth(params.month)
  const selectedMonthDate = `${selectedMonth}-01`
  const selectedMonthEndDate = getMonthEndDate(selectedMonth)
  const supabase = await createClient()
  const locale = await getLocale()
  const accountsView = await getAccountsView()
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.default_household_id) {
    redirect('/onboarding')
  }

  const { data: household, error } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()

  if (error || !household) {
    redirect('/onboarding')
  }

  const { data: accountBalances, error: accountBalancesError } =
    await supabase.rpc('get_account_balances', {
      p_household_id: household.id,
      p_as_of_date: selectedMonthEndDate,
    })

  const { data: monthlySummaryRows, error: monthlySummaryError } =
    await supabase.rpc('get_monthly_dashboard_summary', {
      p_household_id: household.id,
      p_month: selectedMonthDate,
    })

  const { data: expenseCategoryRows, error: expenseCategoriesError } =
    await supabase.rpc('get_monthly_expenses_by_category', {
      p_household_id: household.id,
      p_month: selectedMonthDate,
    })

  const { data: categoryLookupRows, error: categoryLookupError } =
    await supabase
      .from('categories')
      .select('id, name, parent_category_id, is_archived')
      .eq('household_id', household.id)
      .is('deleted_at', null)

  const { data: accountMetaRows } = await supabase
    .from('accounts')
    .select('id, institution_name, last_four, icon, color')
    .eq('household_id', household.id)
    .is('deleted_at', null)

  const prevMonthDate = getPreviousMonthDate(selectedMonth)
  const { data: prevSummaryRows } = await supabase.rpc('get_monthly_dashboard_summary', {
    p_household_id: household.id,
    p_month: prevMonthDate,
  })
  const { data: budgetRows, error: budgetError } = await supabase.rpc('get_monthly_budget_details', {
    p_household_id: household.id,
    p_budget_month: selectedMonthDate,
  })

  const { count: nonOpeningTransactionCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', household.id)
    .neq('transaction_type', 'opening_balance')
    .is('deleted_at', null)

  const balances = (accountBalances ?? []) as AccountBalance[]
  const monthlySummary =
    ((monthlySummaryRows ?? [])[0] as MonthlyDashboardSummary | undefined) ??
    null
  const expenseCategories = (expenseCategoryRows ??
    []) as MonthlyExpenseCategory[]
  const categoriesById = new Map(
    ((categoryLookupRows ?? []) as CategoryLookup[]).map((category) => [
      category.id,
      category,
    ])
  )
  const accountMetaById = new Map(
    ((accountMetaRows ?? []) as AccountMeta[]).map((a) => [a.id, a])
  )
  const prevSummary = ((prevSummaryRows ?? [])[0] as MonthlyDashboardSummary | undefined) ?? null
  const budgetDetails = (budgetRows ?? []) as BudgetDetailRow[]
  const budgetLines = budgetDetails.filter((row) => row.line_id !== null)
  const totalBudgetPlanned = budgetLines.reduce((sum, l) => sum + Number(l.planned_amount ?? 0), 0)
  const totalBudgetSpent = budgetLines.reduce((sum, l) => sum + Number(l.actual_amount ?? 0), 0)
  const totalBudgetPercent = totalBudgetPlanned > 0 ? totalBudgetSpent / totalBudgetPlanned : 0
  const budgetCurrency = budgetDetails[0]?.currency_code ?? household.base_currency

  const dashboardCurrency =
    monthlySummary?.base_currency ?? household.base_currency
  const incomeDelta = prevSummary !== null
    ? Number(monthlySummary?.monthly_income ?? 0) - Number(prevSummary.monthly_income)
    : null
  const expensesDelta = prevSummary !== null
    ? Number(monthlySummary?.monthly_expenses ?? 0) - Number(prevSummary.monthly_expenses)
    : null
  const savingsDelta = prevSummary !== null
    ? Number(monthlySummary?.monthly_savings ?? 0) - Number(prevSummary.monthly_savings)
    : null
  const savingsRateDelta = (prevSummary !== null && monthlySummary?.savings_rate != null && prevSummary.savings_rate != null)
    ? Number(monthlySummary.savings_rate) - Number(prevSummary.savings_rate)
    : null
  const monthlyExpenses = Number(monthlySummary?.monthly_expenses ?? 0)
  const hasMonthlyActivity =
    Number(monthlySummary?.income_transaction_count ?? 0) > 0 ||
    Number(monthlySummary?.expense_transaction_count ?? 0) > 0
  const includedBalances = balances.filter(
    (account) => account.include_in_net_worth
  )
  const totalAssets = includedBalances
    .filter((account) => account.account_class === 'asset')
    .reduce(
      (total, account) =>
        total + Number(account.posted_balance_base_currency),
      0
    )
  const totalLiabilities = includedBalances
    .filter((account) => account.account_class === 'liability')
    .reduce(
      (total, account) =>
        total +
        getDisplayedLiabilityBalance(account.posted_balance_base_currency),
      0
    )
  const signedLiabilities = includedBalances
    .filter((account) => account.account_class === 'liability')
    .reduce(
      (total, account) =>
        total + Number(account.posted_balance_base_currency),
      0
    )
  const projectedAssets = includedBalances
    .filter((account) => account.account_class === 'asset')
    .reduce(
      (total, account) =>
        total + Number(account.projected_balance_base_currency),
      0
    )
  const signedProjectedLiabilities = includedBalances
    .filter((account) => account.account_class === 'liability')
    .reduce(
      (total, account) =>
        total + Number(account.projected_balance_base_currency),
      0
    )
  const netWorth = totalAssets + signedLiabilities
  const projectedNetWorth = projectedAssets + signedProjectedLiabilities
  const incomeTransactionCount = Number(
    monthlySummary?.income_transaction_count ?? 0
  )
  const expenseTransactionCount = Number(
    monthlySummary?.expense_transaction_count ?? 0
  )

  const summaryCards = [
    {
      label: t('dashboard.totalAssets'),
      value: totalAssets,
      description: t('dashboard.totalAssetsDescription'),
      trendMetric: 'total-assets' as const,
      icon: <Wallet />,
      accent: ACCENT.emerald,
      valueClassName: undefined as string | undefined,
    },
    {
      label: t('dashboard.totalLiabilities'),
      value: totalLiabilities,
      description: t('dashboard.totalLiabilitiesDescription'),
      trendMetric: 'total-liabilities' as const,
      icon: <Scale />,
      accent: ACCENT.rose,
      valueClassName: undefined as string | undefined,
      tooltip: <InfoTooltip term="liabilities" label={t('dashboard.totalLiabilities')} />,
    },
    {
      label: t('dashboard.netWorth'),
      value: netWorth,
      description: t('dashboard.netWorthDescription'),
      trendMetric: 'net-worth' as const,
      icon: <TrendingUp />,
      accent: ACCENT.primary,
      valueClassName: netWorth < 0 ? 'text-red-600 dark:text-red-400' : undefined,
      tooltip: <InfoTooltip term="netWorth" label={t('dashboard.netWorth')} />,
    },
    {
      label: t('dashboard.projectedNetWorth'),
      value: projectedNetWorth,
      description: t('dashboard.projectedNetWorthDescription'),
      trendMetric: 'projected-net-worth' as const,
      icon: <Sparkles />,
      accent: ACCENT.violet,
      valueClassName: projectedNetWorth < 0 ? 'text-red-600 dark:text-red-400' : undefined,
      tooltip: <InfoTooltip term="projectedNetWorth" label={t('dashboard.projectedNetWorth')} />,
    },
  ]
  const monthlySavings = Number(monthlySummary?.monthly_savings ?? 0)
  const monthlyCards = [
    {
      label: t('dashboard.monthlyIncome'),
      value: monthlySummary
        ? formatCurrency(Number(monthlySummary.monthly_income), dashboardCurrency)
        : formatCurrency(0, dashboardCurrency),
      description: formatTransactionCount(
        incomeTransactionCount,
        'posted income transaction'
      ),
      delta: renderDelta(incomeDelta, dashboardCurrency, locale, false),
      trendMetric: 'monthly-income' as const,
      icon: <ArrowUpRight />,
      accent: ACCENT.emerald,
      valueClassName: undefined as string | undefined,
    },
    {
      label: t('dashboard.monthlyExpenses'),
      value: monthlySummary
        ? formatCurrency(
            Number(monthlySummary.monthly_expenses),
            dashboardCurrency
          )
        : formatCurrency(0, dashboardCurrency),
      description: formatTransactionCount(
        expenseTransactionCount,
        'posted expense transaction'
      ),
      delta: renderDelta(expensesDelta, dashboardCurrency, locale, true),
      trendMetric: 'monthly-expenses' as const,
      icon: <ArrowDownRight />,
      accent: ACCENT.rose,
      valueClassName: undefined as string | undefined,
    },
    {
      label: t('dashboard.monthlySavings'),
      value: monthlySummary
        ? formatCurrency(
            Number(monthlySummary.monthly_savings),
            dashboardCurrency
          )
        : formatCurrency(0, dashboardCurrency),
      description: t('dashboard.monthlySavingsDescription'),
      delta: renderDelta(savingsDelta, dashboardCurrency, locale, false),
      trendMetric: 'monthly-savings' as const,
      icon: <PiggyBank />,
      accent: ACCENT.sky,
      valueClassName: monthlySavings < 0 ? 'text-red-600 dark:text-red-400' : undefined,
    },
    {
      label: t('dashboard.savingsRate'),
      value: formatPercent(monthlySummary?.savings_rate ?? null, locale),
      description: t('dashboard.savingsRateDescription'),
      delta: renderRateDelta(savingsRateDelta, locale),
      trendMetric: 'savings-rate' as const,
      icon: <Percent />,
      accent: ACCENT.violet,
      valueClassName: undefined as string | undefined,
      tooltip: <InfoTooltip term="savingsRate" label={t('dashboard.savingsRate')} />,
    },
  ]
  const largestExpenseCategory = expenseCategories.reduce(
    (largest, category) =>
      Number(category.amount_base_currency) >
      Number(largest?.amount_base_currency ?? 0)
        ? category
        : largest,
    null as MonthlyExpenseCategory | null
  )
  const largestExpenseAmount = Number(
    largestExpenseCategory?.amount_base_currency ?? 0
  )

  const activeBalances = balances.filter((a) => !a.is_archived)

  function renderDashboardAccountRow(account: AccountBalance, showTypeBadge: boolean) {
    const meta = accountMetaById.get(account.account_id)
    const isLiability = account.account_class === 'liability'
    // Raw signed value: liabilities owed are stored negative → −US$10.00 (rose).
    const signedPosted = Number(account.posted_balance_account_currency)
    return (
      <div key={account.account_id} className="p-3">
        <AccountCardDetails
          accountId={account.account_id}
          summaryLeft={
            <>
              <AccountAvatar
                accountType={account.account_type}
                emoji={meta?.icon}
                color={meta?.color}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{account.account_name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {showTypeBadge ? (
                    <Badge variant="secondary" className="text-[11px]">
                      {formatLabel(account.account_type)}
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="text-[11px]">
                    {account.currency_code}
                  </Badge>
                  {isLiability ? (
                    <Badge variant="outline" className="border-rose-200 text-[11px] text-rose-600 dark:border-rose-900 dark:text-rose-400">
                      {t('common.liability')}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </>
          }
          balanceLabel={formatCurrency(signedPosted, account.currency_code)}
          balanceNegative={signedPosted < 0}
          postedLabel={formatCurrency(
            isLiability
              ? liabilityDisplay(account.posted_balance_account_currency)
              : Number(account.posted_balance_account_currency),
            account.currency_code
          )}
          pendingLabel={formatCurrency(
            isLiability
              ? liabilityDisplay(account.pending_balance_account_currency)
              : Number(account.pending_balance_account_currency),
            account.currency_code
          )}
          projectedLabel={formatCurrency(
            isLiability
              ? liabilityDisplay(account.projected_balance_account_currency)
              : Number(account.projected_balance_account_currency),
            account.currency_code
          )}
          balanceType={isLiability ? 'owed' : 'posted'}
          institutionName={meta?.institution_name ?? null}
          lastFour={meta?.last_four ?? null}
          includeInNetWorth={account.include_in_net_worth}
        >
          <GlobalAddTransactionButton
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
            defaultAccountId={account.account_id}
          >
            {t('common.addTransaction')}
          </GlobalAddTransactionButton>
        </AccountCardDetails>
      </div>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow={household.name}
        title={t('dashboard.title')}
        description={t('dashboard.yourMoneyIn', { month: formatMonthLabel(selectedMonth) })}
        actions={
          <MonthNav
            month={selectedMonth}
            basePath="/dashboard"
            previousLabel={t('common.previousMonth')}
            nextLabel={t('common.nextMonth')}
          />
        }
      />

      {/* ── Getting started ────────────────────────────────────────────── */}
      <GettingStartedChecklist
        hasAccounts={balances.length > 0}
        hasTransactions={(nonOpeningTransactionCount ?? 0) > 0}
        hasBudget={budgetLines.length > 0}
      />

      {/* ── Plain-language summary ─────────────────────────────────────── */}
      {!monthlySummaryError && monthlySummary ? (
        <DashboardSummary
          monthlyExpenses={monthlyExpenses}
          expensesDelta={expensesDelta}
          hasBudget={budgetLines.length > 0 && totalBudgetPlanned > 0}
          totalBudgetPercent={totalBudgetPercent}
          currency={dashboardCurrency}
          locale={locale}
        />
      ) : null}

      {/* ── Errors ─────────────────────────────────────────────────────── */}
      {(accountBalancesError || monthlySummaryError || expenseCategoriesError || categoryLookupError) ? (
        <Callout variant="error">
          {t('dashboard.loadError')}
        </Callout>
      ) : null}

      {/* ── Financial position ─────────────────────────────────────────── */}
      {!accountBalancesError && balances.length ? (
        <section className="space-y-3">
          <SectionHeading
            title={t('dashboard.financialPositionTitle')}
            description={t('dashboard.financialPositionDescription')}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((summary) => (
              <MetricCard
                key={summary.label}
                label={summary.label}
                value={formatCurrency(summary.value, household.base_currency)}
                description={summary.description}
                icon={summary.icon}
                accent={summary.accent}
                valueClassName={summary.valueClassName}
                trendMetric={summary.trendMetric}
                currentMonth={selectedMonth}
                currency={household.base_currency}
                tooltip={'tooltip' in summary ? summary.tooltip : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!accountBalancesError && !balances.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.summaryTitle')}</CardTitle>
            <CardDescription>
              {t('dashboard.summaryDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/accounts" className={buttonVariants({ variant: 'default' })}>
              {t('dashboard.goToAccounts')}
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Monthly activity ───────────────────────────────────────────── */}
      {!monthlySummaryError && !expenseCategoriesError ? (
        <>
          <section className="space-y-3">
            <SectionHeading
              title={t('dashboard.thisMonthTitle')}
              description={t('dashboard.thisMonthDescription')}
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {monthlyCards.map((summary) => (
                <MetricCard
                  key={summary.label}
                  label={summary.label}
                  value={summary.value}
                  description={summary.description}
                  delta={summary.delta}
                  icon={summary.icon}
                  accent={summary.accent}
                  valueClassName={summary.valueClassName}
                  trendMetric={summary.trendMetric}
                  currentMonth={selectedMonth}
                  currency={dashboardCurrency}
                  tooltip={'tooltip' in summary ? summary.tooltip : undefined}
                />
              ))}
            </div>
          </section>

          {!hasMonthlyActivity ? (
            <Callout variant="info" className="border-dashed text-muted-foreground">
              {t('dashboard.noActivity', { month: formatMonthLabel(selectedMonth) })}
            </Callout>
          ) : null}

          {/* ── Budget vs Actual ─────────────────────────────────────── */}
          {!budgetError ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{t('dashboard.budgetTitle')}</CardTitle>
                    <CardDescription>
                      {t('dashboard.budgetDescription', { month: formatMonthLabel(selectedMonth) })}
                    </CardDescription>
                  </div>
                  <Link
                    href={`/dashboard/budgets?month=${selectedMonth}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    {t('dashboard.viewBudget')}
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {budgetLines.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    {t('dashboard.noBudget', { month: formatMonthLabel(selectedMonth) })}{' '}
                    <Link
                      href={`/dashboard/budgets?month=${selectedMonth}`}
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      {t('dashboard.createBudget')}
                    </Link>
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{t('dashboard.budgetTotal')}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatCurrency(totalBudgetSpent, budgetCurrency)} of {formatCurrency(totalBudgetPlanned, budgetCurrency)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${
                            totalBudgetPercent >= 1
                              ? 'bg-destructive'
                              : totalBudgetPercent >= 0.8
                              ? 'bg-amber-500'
                              : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min(100, Math.round(totalBudgetPercent * 100))}%` }}
                        />
                      </div>
                    </div>
                    <div className="divide-y rounded-lg border">
                      {budgetLines.map((line) => {
                        const planned = Number(line.planned_amount ?? 0)
                        const actual = Number(line.actual_amount ?? 0)
                        const pct = planned > 0 ? actual / planned : 0
                        const isOver = actual > planned && planned > 0
                        const isNear = !isOver && planned > 0 && pct >= 0.8
                        const barColor = isOver
                          ? 'bg-destructive'
                          : isNear
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                        return (
                          <Link
                            key={line.line_id}
                            href={`/dashboard/transactions?category_id=${line.category_id}&month=${selectedMonth}&type=expense`}
                            className="block p-3 space-y-1.5 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium truncate">{line.category_name ?? '—'}</span>
                              <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                                {formatCurrency(actual, budgetCurrency)} / {formatCurrency(planned, budgetCurrency)}
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full ${barColor}`}
                                style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }}
                              />
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {/* ── Expenses by category ─────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.expensesByCategoryTitle')}</CardTitle>
              <CardDescription>
                {t('dashboard.expensesByCategoryDescription', { month: formatMonthLabel(selectedMonth) })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {expenseCategories.length ? (
                <div className="divide-y rounded-lg border">
                  {expenseCategories.map((category) => {
                    const amount = Number(category.amount_base_currency)
                    const percentOfExpenses =
                      monthlyExpenses > 0 ? amount / monthlyExpenses : null
                    const barPercent =
                      largestExpenseAmount > 0
                        ? Math.round((amount / largestExpenseAmount) * 100)
                        : 0
                    const categoryPath = getCategoryPath(category, categoriesById)
                    const txUrl = `/dashboard/transactions?category_id=${category.category_id}&month=${selectedMonth}&type=expense`

                    return (
                      <Link
                        key={category.category_id}
                        href={txUrl}
                        className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] transition-colors hover:bg-muted/50"
                      >
                        <div className="min-w-0 space-y-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{categoryPath.name}</p>
                              {categoryPath.isArchived ? (
                                <Badge variant="outline">{t('common.archived')}</Badge>
                              ) : null}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {formatTransactionCount(Number(category.transaction_count))}
                            </p>
                          </div>
                          <div className="h-2 overflow-hidden rounded-lg bg-muted">
                            <div
                              className="h-full rounded-lg bg-primary"
                              style={{ width: `${barPercent}%` }}
                            />
                          </div>
                        </div>
                        <div className="space-y-1 sm:text-right">
                          <p className="font-medium">
                            {formatCurrency(amount, dashboardCurrency)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {percentOfExpenses === null ? t('common.notAvailable') : formatPercent(percentOfExpenses, locale)}
                          </p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  {t('dashboard.expensesByCategoryEmpty', { month: formatMonthLabel(selectedMonth) })}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* ── Accounts ───────────────────────────────────────────────────── */}
      {!accountBalancesError && activeBalances.length ? (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{t('dashboard.accountsTitle')}</CardTitle>
                <CardDescription>
                  {t('dashboard.accountsDescription')}
                </CardDescription>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Link
                  href="/dashboard/accounts"
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  {t('dashboard.manageAccounts')}
                </Link>
                <AccountsViewToggle view={accountsView} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {accountsView === 'group' ? (
              <div className="divide-y rounded-lg border">
                {groupAccountsByType(activeBalances, {
                  getType: (account) => account.account_type,
                  getBaseAmount: (account) =>
                    account.account_class === 'liability'
                      ? getDisplayedLiabilityBalance(account.posted_balance_base_currency)
                      : Number(account.posted_balance_base_currency),
                }).map((group) => (
                  <AccountGroup
                    key={group.type}
                    label={group.label}
                    count={group.count}
                    subtotalLabel={formatCurrency(group.subtotalBase, household.base_currency)}
                  >
                    {group.rows.map((account) => renderDashboardAccountRow(account, false))}
                  </AccountGroup>
                ))}
              </div>
            ) : (
              <div className="divide-y rounded-lg border">
                {activeBalances.map((account) => renderDashboardAccountRow(account, true))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

    </main>
  )
}
