import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Layers,
  Percent,
  PiggyBank,
  Scale,
  Sparkles,
  TrendingDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
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
import { GettingStartedChecklist } from '@/components/getting-started-checklist'
import { PageHeader } from '@/components/page-header'
import { Callout } from '@/components/callout'
import { FinancialHeroCard } from '@/components/financial-hero-card'
import { InsightCard, type InsightTone } from '@/components/insight-card'
import { CategoryDonut, type DonutSlice } from '@/components/category-donut'
import { RecentActivity, type RecentActivityRow } from '@/components/recent-activity'
import { MonthNav } from '@/components/month-nav'
import { getDashboardTrend } from './trend-actions'
import { getLocale } from '@/lib/i18n/server'
import { translate, type TranslationKey } from '@/lib/i18n/translate'
import type { Locale } from '@/lib/i18n/dictionaries'
import { formatCurrency, formatMonthLabel, formatTransactionCount } from '@/lib/format'
import { computeHealthScore, healthGrade as computeHealthGrade } from '@/lib/health/score'
import { cn } from '@/lib/utils'

const ACCENT = {
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
  primary: 'bg-primary/10 text-primary',
} as const

// Category identity colors for budget dots/bars + donut alignment.
const SERIES = [
  'oklch(0.62 0.19 255)', // blue
  'oklch(0.68 0.14 145)', // green
  'oklch(0.72 0.17 70)', // amber
  'oklch(0.62 0.18 300)', // violet
  'oklch(0.65 0.20 25)', // rose
  'oklch(0.70 0.15 165)', // teal
] as const
const ROSE = 'oklch(0.65 0.20 25)'

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
  currency_code: string
  line_id: string | null
  category_id: string | null
  category_name: string | null
  planned_amount: number | string | null
  actual_amount: number | string | null
}

type Recurring = {
  id: string
  name: string
  transaction_type: string
  amount: number | string
  currency_code: string
  next_run_date: string | null
  auto_post: boolean
}

type Debt = {
  account_id: string
  name: string
  status: string
  original_principal: number | string | null
  minimum_payment: number | string | null
}

type Goal = {
  id: string
  name: string
  target_amount: number | string
  current_amount: number | string
  status: string
}

type RecentTransaction = {
  id: string
  transaction_date: string
  transaction_type: string
  description: string | null
  merchant_name: string | null
}

type RecentEntry = {
  transaction_id: string
  account_id: string
  amount_account_currency: number | string
  currency_code: string
}

type RecentAllocation = { transaction_id: string; category_id: string }

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
  const formatted = new Intl.NumberFormat('en-CA', {
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
  const formatted = new Intl.NumberFormat('en-CA', {
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

function getDisplayedLiabilityBalance(value: number | string) {
  return Math.max(0, -Number(value))
}

function formatPercent(value: number | string | null, locale: Locale) {
  if (value === null) return translate(locale, 'common.notAvailable')
  return new Intl.NumberFormat('en-CA', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value))
}

function getMonthEndDate(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
}

function getCategoryPath(
  category: { category_id: string; category_name: string; parent_category_id: string | null },
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

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams
  const selectedMonth = parseDashboardMonth(params.month)
  const selectedMonthDate = `${selectedMonth}-01`
  const selectedMonthEndDate = getMonthEndDate(selectedMonth)
  const supabase = await createClient()
  const locale = await getLocale()
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars)
  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-CA' : locale, { month: 'short', day: 'numeric' })

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
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()
  if (error || !household) redirect('/onboarding')

  const baseCurrency = household.base_currency as string
  const prevMonthDate = getPreviousMonthDate(selectedMonth)
  const prevMonthEndDate = getMonthEndDate(prevMonthDate.slice(0, 7))
  const today = new Date().toISOString().slice(0, 10)

  const { data: accountBalances, error: accountBalancesError } = await supabase.rpc('get_account_balances', {
    p_household_id: household.id,
    p_as_of_date: selectedMonthEndDate,
  })
  const { data: monthlySummaryRows, error: monthlySummaryError } = await supabase.rpc('get_monthly_dashboard_summary', {
    p_household_id: household.id,
    p_month: selectedMonthDate,
  })
  const { data: expenseCategoryRows, error: expenseCategoriesError } = await supabase.rpc('get_monthly_expenses_by_category', {
    p_household_id: household.id,
    p_month: selectedMonthDate,
  })
  const { data: categoryLookupRows, error: categoryLookupError } = await supabase
    .from('categories')
    .select('id, name, parent_category_id, is_archived')
    .eq('household_id', household.id)
    .is('deleted_at', null)
  const { data: prevSummaryRows } = await supabase.rpc('get_monthly_dashboard_summary', {
    p_household_id: household.id,
    p_month: prevMonthDate,
  })
  const { data: prevBalanceRows } = await supabase.rpc('get_account_balances', {
    p_household_id: household.id,
    p_as_of_date: prevMonthEndDate,
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

  const [
    { data: recurringRows },
    { data: debtRows },
    { data: recentTxRows },
    { data: goalRows },
    { count: needsReviewCount },
  ] = await Promise.all([
    supabase
      .from('recurring_transactions')
      .select('id, name, transaction_type, amount, currency_code, next_run_date, auto_post')
      .eq('household_id', household.id)
      .eq('is_active', true)
      .not('next_run_date', 'is', null)
      .order('next_run_date', { ascending: true })
      .limit(4),
    supabase
      .from('debts')
      .select('account_id, name, status, original_principal, minimum_payment')
      .eq('household_id', household.id)
      .is('deleted_at', null),
    supabase
      .from('transactions')
      .select('id, transaction_date, transaction_type, description, merchant_name')
      .eq('household_id', household.id)
      .neq('transaction_type', 'opening_balance')
      .neq('status', 'voided')
      .is('deleted_at', null)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('goals')
      .select('id, name, target_amount, current_amount, status')
      .eq('household_id', household.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', household.id)
      .eq('review_status', 'unreviewed')
      .neq('transaction_type', 'opening_balance')
      .neq('status', 'voided')
      .is('deleted_at', null),
  ])

  const recentTransactions = (recentTxRows ?? []) as RecentTransaction[]
  const recentTxIds = recentTransactions.map((tx) => tx.id)
  let recentEntries: RecentEntry[] = []
  let recentAllocations: RecentAllocation[] = []
  if (recentTxIds.length) {
    const [{ data: entryRows }, { data: allocationRows }] = await Promise.all([
      supabase
        .from('transaction_entries')
        .select('transaction_id, account_id, amount_account_currency, currency_code')
        .eq('household_id', household.id)
        .in('transaction_id', recentTxIds),
      supabase
        .from('transaction_allocations')
        .select('transaction_id, category_id')
        .eq('household_id', household.id)
        .in('transaction_id', recentTxIds),
    ])
    recentEntries = (entryRows ?? []) as RecentEntry[]
    recentAllocations = (allocationRows ?? []) as RecentAllocation[]
  }

  const balances = (accountBalances ?? []) as AccountBalance[]
  const monthlySummary = ((monthlySummaryRows ?? [])[0] as MonthlyDashboardSummary | undefined) ?? null
  const expenseCategories = (expenseCategoryRows ?? []) as MonthlyExpenseCategory[]
  const categoriesById = new Map(
    ((categoryLookupRows ?? []) as CategoryLookup[]).map((c) => [c.id, c])
  )
  const accountNameById = new Map(balances.map((b) => [b.account_id, b.account_name]))
  const prevSummary = ((prevSummaryRows ?? [])[0] as MonthlyDashboardSummary | undefined) ?? null
  const budgetDetails = (budgetRows ?? []) as BudgetDetailRow[]
  const budgetLines = budgetDetails.filter((row) => row.line_id !== null)
  const totalBudgetPlanned = budgetLines.reduce((s, l) => s + Number(l.planned_amount ?? 0), 0)
  const totalBudgetSpent = budgetLines.reduce((s, l) => s + Number(l.actual_amount ?? 0), 0)
  const totalBudgetPercent = totalBudgetPlanned > 0 ? totalBudgetSpent / totalBudgetPlanned : 0
  const budgetCurrency = budgetDetails[0]?.currency_code ?? baseCurrency
  const hasBudget = budgetLines.length > 0 && totalBudgetPlanned > 0

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

  const includedBalances = balances.filter((a) => a.include_in_net_worth)
  const sumBase = (rows: AccountBalance[], field: keyof AccountBalance) =>
    rows.reduce((s, a) => s + Number(a[field]), 0)
  const assetRows = includedBalances.filter((a) => a.account_class === 'asset')
  const liabilityRows = includedBalances.filter((a) => a.account_class === 'liability')
  const totalAssets = sumBase(assetRows, 'posted_balance_base_currency')
  const signedLiabilities = sumBase(liabilityRows, 'posted_balance_base_currency')
  const totalLiabilities = liabilityRows.reduce(
    (s, a) => s + getDisplayedLiabilityBalance(a.posted_balance_base_currency),
    0
  )
  const projectedAssets = sumBase(assetRows, 'projected_balance_base_currency')
  const signedProjectedLiabilities = sumBase(liabilityRows, 'projected_balance_base_currency')
  const netWorth = totalAssets + signedLiabilities
  const projectedNetWorth = projectedAssets + signedProjectedLiabilities

  // Previous month-end position → net-worth delta + debt-down insight.
  const prevBalances = (prevBalanceRows ?? []) as AccountBalance[]
  const prevIncluded = prevBalances.filter((a) => a.include_in_net_worth)
  const prevNetWorth = prevIncluded.reduce((s, a) => s + Number(a.posted_balance_base_currency), 0)
  const netWorthDeltaPct = prevNetWorth !== 0 ? (netWorth - prevNetWorth) / Math.abs(prevNetWorth) : null
  const prevLiabilities = prevIncluded
    .filter((a) => a.account_class === 'liability')
    .reduce((s, a) => s + getDisplayedLiabilityBalance(a.posted_balance_base_currency), 0)

  const incomeTransactionCount = Number(monthlySummary?.income_transaction_count ?? 0)
  const expenseTransactionCount = Number(monthlySummary?.expense_transaction_count ?? 0)

  const monthlyCards = [
    {
      label: t('dashboard.monthlyIncome'),
      value: formatCurrency(monthlyIncome, dashboardCurrency),
      description: formatTransactionCount(incomeTransactionCount, 'posted income transaction'),
      delta: renderPctDelta(monthlyIncome, prevIncome, locale, false),
      trendMetric: 'monthly-income' as const,
      icon: <ArrowUpRight />,
      accent: ACCENT.emerald,
      valueClassName: undefined as string | undefined,
    },
    {
      label: t('dashboard.monthlyExpenses'),
      value: formatCurrency(monthlyExpenses, dashboardCurrency),
      description: formatTransactionCount(expenseTransactionCount, 'posted expense transaction'),
      delta: renderPctDelta(monthlyExpenses, prevExpenses, locale, true),
      trendMetric: 'monthly-expenses' as const,
      icon: <ArrowDownRight />,
      accent: ACCENT.rose,
      valueClassName: undefined as string | undefined,
    },
    {
      label: t('dashboard.monthlySavings'),
      value: formatCurrency(monthlySavings, dashboardCurrency),
      description: t('dashboard.monthlySavingsDescription'),
      delta: renderPctDelta(monthlySavings, prevSavings, locale, false),
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

  const sortedExpenseCategories = [...expenseCategories].sort(
    (a, b) => Number(b.amount_base_currency) - Number(a.amount_base_currency)
  )
  const largestExpenseCategory = sortedExpenseCategories[0] ?? null
  const largestExpenseAmount = Number(largestExpenseCategory?.amount_base_currency ?? 0)

  // ── Donut: top 6 + "Other". ──────────────────────────────────────────────
  const TOP_DONUT = 6
  const donutData: DonutSlice[] = sortedExpenseCategories.slice(0, TOP_DONUT).map((c) => ({
    name: getCategoryPath(c, categoriesById).name,
    value: Number(c.amount_base_currency),
    categoryId: c.category_id,
  }))
  const otherTotal = sortedExpenseCategories
    .slice(TOP_DONUT)
    .reduce((s, c) => s + Number(c.amount_base_currency), 0)
  if (otherTotal > 0) donutData.push({ name: t('common.other'), value: otherTotal, categoryId: null })

  // ── Health score (BR-021): shared real formula (see lib/health/score). ─────
  const healthScore = computeHealthScore({
    savingsRate: monthlySummary?.savings_rate != null ? Number(monthlySummary.savings_rate) : null,
    hasBudget,
    budgetPercent: totalBudgetPercent,
  })

  // ── Budget top rows. ─────────────────────────────────────────────────────
  const budgetTop = [...budgetLines]
    .sort((a, b) => Number(b.actual_amount ?? 0) - Number(a.actual_amount ?? 0))
    .slice(0, 5)
    .map((line, i) => {
      const planned = Number(line.planned_amount ?? 0)
      const actual = Number(line.actual_amount ?? 0)
      const pct = planned > 0 ? actual / planned : 0
      const isOver = actual > planned && planned > 0
      const color = SERIES[i % SERIES.length]
      return {
        id: line.line_id as string,
        categoryId: line.category_id,
        name: line.category_name ?? '—',
        actual,
        planned,
        pct,
        isOver,
        dotColor: color,
        barColor: isOver ? ROSE : color,
        barWidth: `${Math.min(100, Math.round(pct * 100))}%`,
        pctLabel: planned > 0 ? `${Math.round(pct * 100)}%` : '—',
      }
    })
  const overallPctTone =
    totalBudgetPercent >= 1 ? 'rose' : totalBudgetPercent >= 0.8 ? 'amber' : 'primary'

  // ── Insights (real data only). ───────────────────────────────────────────
  type Insight = { key: string; tone: InsightTone; icon: React.ReactNode; text: string }
  const insights: Insight[] = []
  const overBudgetLine = budgetLines
    .filter((l) => Number(l.actual_amount ?? 0) > Number(l.planned_amount ?? 0) && Number(l.planned_amount ?? 0) > 0)
    .sort(
      (a, b) =>
        Number(b.actual_amount ?? 0) / Number(b.planned_amount ?? 1) -
        Number(a.actual_amount ?? 0) / Number(a.planned_amount ?? 1)
    )[0]
  if (overBudgetLine) {
    const pct = Number(overBudgetLine.actual_amount ?? 0) / Number(overBudgetLine.planned_amount ?? 1)
    insights.push({
      key: 'over-budget',
      tone: 'warning',
      icon: <AlertTriangle />,
      text: t('dashboard.insightOverBudget', { category: overBudgetLine.category_name ?? '—', percent: formatPercent(pct, locale) }),
    })
  }
  if (hasMonthlyActivity && monthlySavings > 0.01) {
    insights.push({
      key: 'cash-flow-positive',
      tone: 'positive',
      icon: <PiggyBank />,
      text: t('dashboard.insightPositiveCashFlow', { amount: formatCurrency(monthlySavings, dashboardCurrency) }),
    })
  } else if (hasMonthlyActivity && monthlySavings < -0.01) {
    insights.push({
      key: 'cash-flow-negative',
      tone: 'warning',
      icon: <TrendingDown />,
      text: t('dashboard.insightNegativeCashFlow', { amount: formatCurrency(Math.abs(monthlySavings), dashboardCurrency) }),
    })
  }
  const debtDrop = prevLiabilities - totalLiabilities
  if (debtDrop > 0.01 && prevLiabilities > 0) {
    insights.push({
      key: 'debt-down',
      tone: 'positive',
      icon: <TrendingDown />,
      text: t('dashboard.insightDebtDown', { amount: formatCurrency(debtDrop, baseCurrency) }),
    })
  }
  const upcomingRows = (recurringRows ?? []) as Recurring[]
  if (upcomingRows.length > 0) {
    insights.push({
      key: 'upcoming',
      tone: 'info',
      icon: <CalendarClock />,
      text: t('dashboard.insightUpcoming', { count: upcomingRows.length }),
    })
  }
  if (largestExpenseCategory && insights.length < 4) {
    insights.push({
      key: 'top-category',
      tone: 'info',
      icon: <Layers />,
      text: t('dashboard.insightTopCategory', {
        category: getCategoryPath(largestExpenseCategory, categoriesById).name,
        amount: formatCurrency(largestExpenseAmount, dashboardCurrency),
      }),
    })
  }
  const visibleInsights = insights.slice(0, 4)

  // ── Upcoming bills (recurring). ──────────────────────────────────────────
  function daysUntil(dateStr: string) {
    const a = new Date(`${dateStr}T00:00:00`)
    const b = new Date(`${today}T00:00:00`)
    return Math.round((a.getTime() - b.getTime()) / 86_400_000)
  }
  const upcoming = upcomingRows.map((row) => {
    const isExpenseLike = row.transaction_type !== 'income'
    const days = row.next_run_date ? daysUntil(row.next_run_date) : null
    const dueSoon = days !== null && days <= 0
    const dueText =
      days === null
        ? ''
        : days <= 0
        ? t('dashboard.dueToday')
        : t('dashboard.inDays', { days })
    const tag = row.auto_post
      ? t('dashboard.statusAuto')
      : dueSoon
      ? t('dashboard.statusDue')
      : t('dashboard.statusScheduled')
    const tagTone = row.auto_post ? 'muted' : dueSoon ? 'warning' : 'info'
    return {
      id: row.id,
      name: row.name,
      dueText,
      amount: Number(row.amount),
      isExpenseLike,
      tag,
      tagTone,
    }
  })

  // ── Debts mini (aggregate). ──────────────────────────────────────────────
  const balancesByAccountId = new Map(balances.map((b) => [b.account_id, b]))
  const activeDebtRows = ((debtRows ?? []) as Debt[]).filter((d) => d.status === 'active')
  const totalDebt = activeDebtRows.reduce(
    (s, d) => s + getDisplayedLiabilityBalance(balancesByAccountId.get(d.account_id)?.posted_balance_base_currency ?? 0),
    0
  )
  const totalOriginal = activeDebtRows.reduce((s, d) => s + Number(d.original_principal ?? 0), 0)
  const debtPaidPct = totalOriginal > 0 ? Math.max(0, Math.min(100, Math.round(((totalOriginal - totalDebt) / totalOriginal) * 100))) : null
  const nextPayment = activeDebtRows.reduce((s, d) => s + Number(d.minimum_payment ?? 0), 0)

  // ── Goals mini. ───────────────────────────────────────────────────────────
  const goalsMini = ((goalRows ?? []) as Goal[]).map((g, i) => {
    const target = Number(g.target_amount)
    const pct = target > 0 ? Math.round(Math.min(1, Number(g.current_amount) / target) * 100) : 0
    return { id: g.id, name: g.name, pct, color: SERIES[i % SERIES.length] }
  })

  // ── Recent activity rows. ────────────────────────────────────────────────
  const entriesByTxId = new Map<string, RecentEntry[]>()
  for (const entry of recentEntries) {
    const list = entriesByTxId.get(entry.transaction_id)
    if (list) list.push(entry)
    else entriesByTxId.set(entry.transaction_id, [entry])
  }
  const allocationByTxId = new Map(recentAllocations.map((a) => [a.transaction_id, a]))

  function recentTypeOf(type: string): RecentActivityRow['type'] {
    if (type === 'income') return 'income'
    if (type === 'expense') return 'expense'
    if (type === 'transfer' || type === 'debt_payment') return 'transfer'
    return 'other'
  }

  const recentActivityRows: RecentActivityRow[] = recentTransactions.map((tx) => {
    const entries = entriesByTxId.get(tx.id) ?? []
    const type = recentTypeOf(tx.transaction_type)
    const allocation = allocationByTxId.get(tx.id)
    const outEntry = entries.find((e) => Number(e.amount_account_currency) < 0) ?? entries[0]
    const inEntry = entries.find((e) => Number(e.amount_account_currency) > 0) ?? entries[0]
    const isMovement = type === 'transfer'
    const primaryEntry = isMovement ? inEntry : entries[0]
    const rawAmount = Number(primaryEntry?.amount_account_currency ?? 0)
    const amount = isMovement ? Math.abs(rawAmount) : rawAmount
    const categoryName = isMovement
      ? t('transactionForm.typeTransfer')
      : allocation
      ? categoriesById.get(allocation.category_id)?.name ?? t('common.notAvailable')
      : t('common.notAvailable')
    const accountName = isMovement
      ? `${accountNameById.get(outEntry?.account_id ?? '') ?? '—'} → ${accountNameById.get(inEntry?.account_id ?? '') ?? '—'}`
      : accountNameById.get(primaryEntry?.account_id ?? '') ?? t('common.notAvailable')
    const merchantName = tx.merchant_name?.trim() || null
    const title =
      tx.description?.trim() ||
      merchantName ||
      (isMovement ? t('transactionForm.typeTransfer') : categoryName)
    const subtitle = merchantName && merchantName !== title ? `${categoryName} · ${merchantName}` : categoryName
    return {
      id: tx.id,
      title,
      subtitle,
      accountName,
      dateLabel: dateFmt.format(new Date(`${tx.transaction_date}T00:00:00`)),
      amount,
      currency: primaryEntry?.currency_code ?? baseCurrency,
      type,
    }
  })

  const netWorthTrend = await getDashboardTrend('net-worth', selectedMonth, 6)
  const spark = netWorthTrend.ok ? netWorthTrend.data.map((d) => d.value) : []

  const firstName = profile.display_name?.trim().split(/\s+/)[0] || household.name
  const eyebrow = `${t('dashboard.greeting')}, ${firstName}`

  const hasLoadError = accountBalancesError || monthlySummaryError || expenseCategoriesError || categoryLookupError
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

      <GettingStartedChecklist
        hasAccounts={balances.length > 0}
        hasTransactions={(nonOpeningTransactionCount ?? 0) > 0}
        hasBudget={budgetLines.length > 0}
      />

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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                trendMetric={c.trendMetric}
                currentMonth={selectedMonth}
                currency={dashboardCurrency}
                tooltip={'tooltip' in c ? c.tooltip : undefined}
              />
            ))}
          </div>

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
              {t('dashboard.noActivity', { month: formatMonthLabel(selectedMonth) })}
            </Callout>
          ) : null}

          {/* Main + right rail */}
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_304px]">
            {/* Main column */}
            <div className="flex min-w-0 flex-col gap-4">
              {/* Budget vs actual */}
              {!budgetError && hasBudget ? (
                <div className={cn(cardClass, 'p-4 sm:p-5')}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold">{t('dashboard.budgetTitle')}</h2>
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                          overallPctTone === 'rose' && 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
                          overallPctTone === 'amber' && 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
                          overallPctTone === 'primary' && 'bg-primary/10 text-primary'
                        )}
                      >
                        {Math.round(totalBudgetPercent * 100)}% {t('dashboard.budgetUsed')}
                      </span>
                      <Link href={`/dashboard/budgets?month=${selectedMonth}`} className="text-xs font-semibold text-primary hover:underline">
                        {t('common.viewAll')} →
                      </Link>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {budgetTop.map((b) => (
                      <Link
                        key={b.id}
                        href={`/dashboard/transactions?category_id=${b.categoryId}&month=${selectedMonth}&type=expense`}
                        className="block"
                      >
                        <div className="mb-1.5 flex items-center gap-2 text-xs">
                          <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: b.dotColor }} aria-hidden="true" />
                          <span className="flex-1 truncate text-muted-foreground">{b.name}</span>
                          <span className={cn('font-semibold tabular-nums', b.isOver ? 'text-rose-600 dark:text-rose-400' : 'text-foreground')}>
                            {formatCurrency(b.actual, budgetCurrency)}
                          </span>
                          <span className="text-[11px] tabular-nums text-muted-foreground">/ {formatCurrency(b.planned, budgetCurrency)}</span>
                          <span className={cn('min-w-8 text-right text-[11px] font-semibold', b.isOver ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                            {b.pctLabel}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: b.barWidth, backgroundColor: b.barColor }} />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : !budgetError ? (
                <div className={cn(cardClass, 'p-4 sm:p-5')}>
                  <h2 className="mb-3 text-sm font-bold">{t('dashboard.budgetTitle')}</h2>
                  <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    {t('dashboard.noBudget', { month: formatMonthLabel(selectedMonth) })}{' '}
                    <Link href={`/dashboard/budgets?month=${selectedMonth}`} className="underline underline-offset-2 hover:text-foreground">
                      {t('dashboard.createBudget')}
                    </Link>
                  </p>
                </div>
              ) : null}

              {/* Donut + upcoming */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Donut */}
                {!expenseCategoriesError ? (
                  <div className={cn(cardClass, 'p-4')}>
                    <h2 className="mb-3 text-sm font-bold">{t('dashboard.byCategory')}</h2>
                    {donutData.length ? (
                      <CategoryDonut data={donutData} currency={dashboardCurrency} total={monthlyExpenses} totalLabel={t('dashboard.budgetTotal')} month={selectedMonth} />
                    ) : (
                      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                        {t('dashboard.expensesByCategoryEmpty', { month: formatMonthLabel(selectedMonth) })}
                      </p>
                    )}
                  </div>
                ) : null}

                {/* Upcoming bills */}
                <div className={cn(cardClass, 'overflow-hidden')}>
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <h2 className="text-sm font-bold">{t('dashboard.upcomingTitle')}</h2>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                      {upcoming.length} {t('dashboard.upcomingThisMonth')}
                    </span>
                  </div>
                  {upcoming.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">{t('mobile.upcomingEmpty')}</p>
                  ) : (
                    <div className="divide-y">
                      {upcoming.map((bl) => (
                        <div key={bl.id} className="flex items-center gap-2.5 px-4 py-2.5">
                          <span
                            className={cn(
                              'flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[13px]',
                              bl.isExpenseLike ? ACCENT.rose : ACCENT.emerald
                            )}
                            aria-hidden="true"
                          >
                            <CalendarClock />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{bl.name}</p>
                            <p className="text-[10.5px] text-muted-foreground">{bl.dueText}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={cn('text-xs font-semibold tabular-nums', bl.isExpenseLike ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                              {bl.isExpenseLike ? '−' : '+'}
                              {formatCurrency(bl.amount, baseCurrency)}
                            </p>
                            <p
                              className={cn(
                                'text-[10px] font-bold uppercase tracking-wide',
                                bl.tagTone === 'warning' && 'text-amber-600 dark:text-amber-400',
                                bl.tagTone === 'info' && 'text-sky-600 dark:text-sky-400',
                                bl.tagTone === 'muted' && 'text-muted-foreground'
                              )}
                            >
                              {bl.tag}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right rail */}
            <aside className="flex flex-col gap-3">
              {/* Insights */}
              <div className={cn(cardClass, 'overflow-hidden')}>
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h2 className="flex items-center gap-2 text-sm font-bold">
                    <Sparkles className="size-[15px] text-primary" aria-hidden="true" />
                    {t('dashboard.insightsTitle')}
                  </h2>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-primary">
                    {t('dashboard.insightsLive')}
                  </span>
                </div>
                {visibleInsights.length ? (
                  <div className="flex flex-col gap-2.5 p-3">
                    {visibleInsights.map((ins) => (
                      <InsightCard key={ins.key} tone={ins.tone} icon={ins.icon}>{ins.text}</InsightCard>
                    ))}
                  </div>
                ) : (
                  <p className="p-4 text-xs text-muted-foreground">{t('dashboard.insightsEmpty')}</p>
                )}
              </div>

              {/* Debts mini */}
              <div className={cn(cardClass, 'p-4')}>
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-sm font-bold">
                    <Scale className="size-[14px] text-rose-600 dark:text-rose-400" aria-hidden="true" />
                    {t('dashboard.debtsMiniTitle')}
                  </h2>
                  <Link href="/dashboard/debts" className="text-xs font-semibold text-primary hover:underline">{t('dashboard.planDebt')} →</Link>
                </div>
                {activeDebtRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('dashboard.debtsMiniEmpty')}</p>
                ) : (
                  <>
                    <p className="mb-2 text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">{formatCurrency(totalDebt, baseCurrency)}</p>
                    {debtPaidPct !== null ? (
                      <>
                        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${debtPaidPct}%` }} />
                        </div>
                        <p className="text-[11.5px] text-muted-foreground">
                          {debtPaidPct}% {t('dashboard.debtPaidOff')}
                          {nextPayment > 0 ? ` · ${t('dashboard.nextPaymentLabel')}: ${formatCurrency(nextPayment, baseCurrency)}` : ''}
                        </p>
                      </>
                    ) : nextPayment > 0 ? (
                      <p className="text-[11.5px] text-muted-foreground">{t('dashboard.nextPaymentLabel')}: {formatCurrency(nextPayment, baseCurrency)}</p>
                    ) : null}
                  </>
                )}
              </div>

              {/* Goals mini */}
              <div className={cn(cardClass, 'p-4')}>
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold">
                  <PiggyBank className="size-[14px] text-primary" aria-hidden="true" />
                  {t('dashboard.goalsMiniTitle')}
                </h2>
                {goalsMini.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('dashboard.goalsMiniEmpty')}</p>
                ) : (
                  <div className="space-y-2.5">
                    {goalsMini.map((g) => (
                      <div key={g.id}>
                        <div className="mb-1 flex items-center justify-between text-[11.5px]">
                          <span className="text-muted-foreground">{g.name}</span>
                          <span className="font-semibold tabular-nums">{g.pct}%</span>
                        </div>
                        <div className="h-[5px] overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${g.pct}%`, backgroundColor: g.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Link href="/dashboard/goals" className="mt-3 inline-block text-[11.5px] font-semibold text-primary hover:underline">
                  {t('dashboard.viewGoals')} →
                </Link>
              </div>
            </aside>
          </div>

          {/* Recent activity */}
          <div className={cn(cardClass, 'overflow-hidden')}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold">{t('dashboard.recentActivityTitle')}</h2>
                {needsReviewCount ? (
                  <Link
                    href="/dashboard/transactions?review=unreviewed&date_from=2000-01-01&date_to=2099-12-31"
                    className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
                  >
                    {t('dashboard.needsReviewCount', { count: needsReviewCount })}
                  </Link>
                ) : null}
              </div>
              <Link href="/dashboard/transactions" className="text-xs font-semibold text-primary hover:underline">{t('common.viewAll')} →</Link>
            </div>
            <RecentActivity rows={recentActivityRows} emptyLabel={t('dashboard.recentActivityEmpty')} />
          </div>
        </>
      ) : null}
    </main>
  )
}
