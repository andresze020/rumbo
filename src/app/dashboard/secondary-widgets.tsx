import Link from 'next/link'
import {
  AlertTriangle,
  CalendarClock,
  Layers,
  ListChecks,
  PiggyBank,
  Scale,
  Sparkles,
  TrendingDown,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Callout } from '@/components/callout'
import { InsightCard } from '@/components/insight-card'
import { CategoryDonut, type DonutSlice } from '@/components/category-donut'
import { RecentActivity, type RecentActivityRow } from '@/components/recent-activity'
import type { TranslationKey } from '@/lib/i18n/translate'
import type { Locale } from '@/lib/i18n/dictionaries'
import { formatCurrency, formatMonthLabel, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getDisplayedLiabilityBalance } from '@/lib/net-worth/valuation'
import { monthEndDate } from '@/lib/periods/month'
import {
  buildDashboardInsights,
  scheduledDirection,
  summarizeDebts,
  type DashboardInsight,
} from '@/lib/insights/dashboard'
import type { AccountBalance, BudgetDetailRow } from './page'

// Only the accent colors this file's own JSX uses (scheduled-activity icon
// background, keyed by scheduledDirection). The full ACCENT map stays in page.tsx, where the rest of it is
// actually used — not worth a shared-constants module for two colors.
const ACCENT = {
  in: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
  out: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
  neutral: 'bg-muted text-muted-foreground',
} as const
const SCHEDULED_AMOUNT_CLASS = {
  in: 'text-emerald-600 dark:text-emerald-400',
  out: 'text-rose-600 dark:text-rose-400',
  neutral: 'text-foreground',
} as const
const SCHEDULED_SIGN = { in: '+', out: '−', neutral: '' } as const

// Category identity colors for budget dots/bars + donut alignment + goals mini.
const SERIES = [
  'oklch(0.62 0.19 255)', // blue
  'oklch(0.68 0.14 145)', // green
  'oklch(0.72 0.17 70)', // amber
  'oklch(0.62 0.18 300)', // violet
  'oklch(0.65 0.20 25)', // rose
  'oklch(0.70 0.15 165)', // teal
] as const
const ROSE = 'oklch(0.65 0.20 25)'

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

type DashboardSecondaryWidgetsProps = {
  householdId: string
  baseCurrency: string
  selectedMonth: string
  dashboardCurrency: string
  monthlyExpenses: number
  hasMonthlyActivity: boolean
  monthlySavings: number
  balances: AccountBalance[]
  budgetLines: BudgetDetailRow[]
  hasBudget: boolean
  budgetCurrency: string
  totalBudgetPercent: number
  budgetError: boolean
  totalLiabilities: number
  prevLiabilities: number
  locale: Locale
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
  dateFmt: Intl.DateTimeFormat
}

// RUM-005: everything below the top-of-fold (Budget, category breakdown,
// Upcoming bills, Insights, Debts, Goals, Recent activity) streams in behind
// its own <Suspense> boundary instead of blocking the whole Dashboard.
// RUM-001 measured every one of these queries as ~0 cost — the point isn't
// shaving milliseconds, it's that the top-of-fold (net worth, this month's
// numbers) renders without waiting on any of it, and a failure here doesn't
// blank the rest of the page. Budget data itself is NOT re-fetched here: it's
// already resolved in page.tsx (needed there for the health score shown in
// the hero card), so it arrives as a prop instead of a duplicate round trip.
export async function DashboardSecondaryWidgets({
  householdId,
  baseCurrency,
  selectedMonth,
  dashboardCurrency,
  monthlyExpenses,
  hasMonthlyActivity,
  monthlySavings,
  balances,
  budgetLines,
  hasBudget,
  budgetCurrency,
  totalBudgetPercent,
  budgetError,
  totalLiabilities,
  prevLiabilities,
  locale,
  t,
  dateFmt,
}: DashboardSecondaryWidgetsProps) {
  const supabase = await createClient()
  const selectedMonthDate = `${selectedMonth}-01`
  const today = new Date().toISOString().slice(0, 10)

  const [
    { data: expenseCategoryRows, error: expenseCategoriesError },
    { data: categoryLookupRows, error: categoryLookupError },
    { data: recurringRows },
    { data: debtRows },
    { data: recentTxRows },
    { data: goalRows },
    { count: needsReviewCount },
  ] = await Promise.all([
    supabase.rpc('get_monthly_expenses_by_category', {
      p_household_id: householdId,
      p_month: selectedMonthDate,
    }),
    supabase
      .from('categories')
      .select('id, name, parent_category_id, is_archived')
      .eq('household_id', householdId)
      .is('deleted_at', null),
    supabase
      .from('recurring_transactions')
      .select('id, name, transaction_type, amount, currency_code, next_run_date, auto_post')
      .eq('household_id', householdId)
      .eq('is_active', true)
      .not('next_run_date', 'is', null)
      .order('next_run_date', { ascending: true })
      .limit(4),
    supabase
      .from('debts')
      .select('account_id, name, status, original_principal, minimum_payment')
      .eq('household_id', householdId)
      .is('deleted_at', null),
    supabase
      .from('transactions')
      .select('id, transaction_date, transaction_type, description, merchant_name')
      .eq('household_id', householdId)
      .neq('transaction_type', 'opening_balance')
      .neq('status', 'voided')
      .is('deleted_at', null)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('goals')
      .select('id, name, target_amount, current_amount, status')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .eq('review_status', 'unreviewed')
      .neq('transaction_type', 'opening_balance')
      .neq('status', 'voided')
      .is('deleted_at', null)
      // RUM-009: Home shows the month on screen's review backlog, not the
      // all-time one — the data is untouched, only what Home surfaces.
      .gte('transaction_date', selectedMonthDate)
      .lte('transaction_date', monthEndDate(selectedMonth)),
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
        .eq('household_id', householdId)
        .in('transaction_id', recentTxIds),
      supabase
        .from('transaction_allocations')
        .select('transaction_id, category_id')
        .eq('household_id', householdId)
        .in('transaction_id', recentTxIds),
    ])
    recentEntries = (entryRows ?? []) as RecentEntry[]
    recentAllocations = (allocationRows ?? []) as RecentAllocation[]
  }

  const expenseCategories = (expenseCategoryRows ?? []) as MonthlyExpenseCategory[]
  const categoriesById = new Map(
    ((categoryLookupRows ?? []) as CategoryLookup[]).map((c) => [c.id, c])
  )
  const accountNameById = new Map(balances.map((b) => [b.account_id, b.account_name]))

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

  // ── Insights (RUM-009): deterministic, traceable, actionable — see
  // lib/insights/dashboard for the rules. This file only maps kinds to
  // icons and copy.
  const upcomingRows = (recurringRows ?? []) as Recurring[]
  const visibleInsights = buildDashboardInsights({
    month: selectedMonth,
    budgetLines,
    hasMonthlyActivity,
    monthlySavings,
    totalLiabilities,
    prevLiabilities,
    topCategory: largestExpenseCategory
      ? {
          category_id: largestExpenseCategory.category_id,
          name: getCategoryPath(largestExpenseCategory, categoriesById).name,
          amount: largestExpenseAmount,
        }
      : null,
  })
  function renderInsight(ins: DashboardInsight): { icon: ReactNode; text: string; actionLabel: string } {
    switch (ins.kind) {
      case 'over-budget':
        return {
          icon: <AlertTriangle />,
          text: t('dashboard.insightOverBudget', { category: ins.category, percent: formatPercent(ins.percent, locale) }),
          actionLabel: t('dashboard.insightActionViewTransactions'),
        }
      case 'cash-flow-positive':
        return {
          icon: <PiggyBank />,
          text: t('dashboard.insightPositiveCashFlow', { amount: formatCurrency(ins.amount, dashboardCurrency) }),
          actionLabel: t('dashboard.insightActionReviewMonth'),
        }
      case 'cash-flow-negative':
        return {
          icon: <TrendingDown />,
          text: t('dashboard.insightNegativeCashFlow', { amount: formatCurrency(ins.amount, dashboardCurrency) }),
          actionLabel: t('dashboard.insightActionViewTransactions'),
        }
      case 'liabilities-down':
        return {
          icon: <TrendingDown />,
          text: t('dashboard.insightLiabilitiesDown', { amount: formatCurrency(ins.amount, baseCurrency) }),
          actionLabel: t('dashboard.insightActionViewAccounts'),
        }
      case 'top-category':
        return {
          icon: <Layers />,
          text: t('dashboard.insightTopCategory', { category: ins.category, amount: formatCurrency(ins.amount, dashboardCurrency) }),
          actionLabel: t('dashboard.insightActionViewTransactions'),
        }
    }
  }

  // ── Upcoming bills (recurring). ──────────────────────────────────────────
  function daysUntil(dateStr: string) {
    const a = new Date(`${dateStr}T00:00:00`)
    const b = new Date(`${today}T00:00:00`)
    return Math.round((a.getTime() - b.getTime()) / 86_400_000)
  }
  const upcoming = upcomingRows.map((row) => {
    const direction = scheduledDirection(row.transaction_type)
    const days = row.next_run_date ? daysUntil(row.next_run_date) : null
    const dueSoon = days !== null && days <= 0
    const dueText =
      days === null
        ? ''
        : days < 0
        ? t('dashboard.overdueDays', { days: Math.abs(days) })
        : days === 0
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
      currency: row.currency_code,
      direction,
      sign: SCHEDULED_SIGN[direction],
      amountClass: SCHEDULED_AMOUNT_CLASS[direction],
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
  // RUM-009: the card reads Debt Planner records; account liabilities can
  // exist without one (a credit card), so never say "no debt" over them.
  const debtsSummary = summarizeDebts({
    activeDebtCount: activeDebtRows.length,
    plannerTotal: totalDebt,
    totalLiabilities,
  })
  const debtsOwed = debtsSummary.state !== 'none'

  // ── Goals mini. ───────────────────────────────────────────────────────────
  // `anyGoalsConfigured` reads the unfiltered rows so a household with only
  // paused/completed goals (RUM-008 review, Codex P2) doesn't land in
  // "Finish setting up" — it has configured goals, just none active right
  // now. `goalsMini` itself still only lists active ones, same as before.
  const allGoalRows = (goalRows ?? []) as Goal[]
  const anyGoalsConfigured = allGoalRows.length > 0
  const goalsMini = allGoalRows.filter((g) => g.status === 'active').map((g, i) => {
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

  const cardClass = 'rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'

  // Before the split, these two fed the page-wide hasLoadError Callout. Now
  // that this section streams in on its own, the same visible error needs
  // its own copy here — a failed categories fetch silently degrades every
  // widget that reads categoriesById (donut, insights, recent activity) to
  // fallback labels otherwise, with nothing telling the user data is missing.
  const hasLoadError = Boolean(expenseCategoriesError || categoryLookupError)

  // RUM-008: Budget and Goals both use "not set up yet" copy when empty —
  // real setup gaps, not a state worth celebrating — so their empty cases
  // move into one compact setup card instead of two more full-size cards.
  // Debts is deliberately excluded: its empty copy ("No active debts. Nicely
  // done.") treats zero debts as a positive outcome, not an incomplete setup,
  // so it keeps its own card exactly as before.
  const budgetNeedsSetup = !budgetError && !hasBudget
  const goalsNeedSetup = !anyGoalsConfigured

  return (
    <>
      {hasLoadError ? <Callout variant="error">{t('dashboard.loadError')}</Callout> : null}
      {/* Main + right rail */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_304px] [&>*]:min-w-0">
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
          ) : null}

          {/* Donut + upcoming */}
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            {/* Donut */}
            {!expenseCategoriesError ? (
              <div className={cn(cardClass, 'p-4')}>
                <h2 className="mb-3 text-sm font-bold">{t('dashboard.byCategory')}</h2>
                {donutData.length ? (
                  <CategoryDonut data={donutData} currency={dashboardCurrency} total={monthlyExpenses} totalLabel={t('dashboard.budgetTotal')} month={selectedMonth} />
                ) : (
                  <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    {t('dashboard.expensesByCategoryEmpty', { month: formatMonthLabel(selectedMonth, locale) })}
                  </p>
                )}
              </div>
            ) : null}

            {/* Upcoming bills */}
            <div className={cn(cardClass, 'overflow-hidden')}>
              <div className="flex items-center justify-between border-b px-4 py-3">
                {/* RUM-009: income and expenses both appear here, so it is
                    "Scheduled activity", not "Upcoming payments". The list is
                    the next few runs by date, not a month total, so there is
                    no "N this month" count. */}
                <h2 className="text-sm font-bold">{t('dashboard.scheduledTitle')}</h2>
                <Link href="/dashboard/recurring" className="text-xs font-semibold text-primary hover:underline">
                  {t('common.viewAll')} →
                </Link>
              </div>
              {upcoming.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{t('dashboard.scheduledEmpty')}</p>
              ) : (
                <div className="divide-y">
                  {upcoming.map((bl) => (
                    <div key={bl.id} className="flex items-center gap-2.5 px-4 py-2.5">
                      <span
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[13px]',
                          ACCENT[bl.direction]
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
                        <p className={cn('text-xs font-semibold tabular-nums', bl.amountClass)}>
                          {bl.sign}
                          {formatCurrency(bl.amount, bl.currency)}
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
            </div>
            {visibleInsights.length ? (
              <div className="flex flex-col gap-2.5 p-3">
                {visibleInsights.map((ins) => {
                  const view = renderInsight(ins)
                  return (
                    <InsightCard
                      key={ins.kind}
                      tone={ins.tone}
                      icon={view.icon}
                      action={{ href: ins.href, label: view.actionLabel }}
                    >
                      {view.text}
                    </InsightCard>
                  )
                })}
                <p className="px-0.5 text-[10.5px] text-muted-foreground">
                  {t('dashboard.insightsBasis', { month: formatMonthLabel(selectedMonth, locale) })}
                </p>
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
            {!debtsOwed ? (
              <p className="text-xs text-muted-foreground">{t('dashboard.debtsMiniEmpty')}</p>
            ) : debtsSummary.state === 'untracked-liabilities' ? (
              <p className="text-xs text-muted-foreground">
                {t('dashboard.debtsMiniUntracked', { amount: formatCurrency(debtsSummary.accountLiabilities, baseCurrency) })}
              </p>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">{t('dashboard.debtsMiniPlannerTotal')}</p>
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
                {debtsSummary.untrackedLiabilities > 0 ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {t('dashboard.debtsMiniOtherLiabilities', { amount: formatCurrency(debtsSummary.untrackedLiabilities, baseCurrency) })}
                  </p>
                ) : null}
              </>
            )}
          </div>

          {/* Goals mini */}
          {!goalsNeedSetup ? (
            <div className={cn(cardClass, 'p-4')}>
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold">
                <PiggyBank className="size-[14px] text-primary" aria-hidden="true" />
                {t('dashboard.goalsMiniTitle')}
              </h2>
              {goalsMini.length > 0 ? (
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
              ) : (
                // Configured (anyGoalsConfigured) but none are currently
                // active — a real household state (paused/completed goals),
                // not the "never set up" case "Finish setting up" covers.
                <p className="text-xs text-muted-foreground">{t('dashboard.goalsMiniEmpty')}</p>
              )}
              <Link href="/dashboard/goals" className="mt-3 inline-block text-[11.5px] font-semibold text-primary hover:underline">
                {t('dashboard.viewGoals')} →
              </Link>
            </div>
          ) : null}
        </aside>
      </div>

      {/* Recent activity */}
      <div className={cn(cardClass, 'overflow-hidden')}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold">{t('dashboard.recentActivityTitle')}</h2>
            {needsReviewCount ? (
              <Link
                href={`/dashboard/transactions?review=unreviewed&month=${selectedMonth}`}
                className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
              >
                {t('dashboard.needsReviewMonth', {
                  count: needsReviewCount,
                  month: formatMonthLabel(selectedMonth, locale),
                })}
              </Link>
            ) : null}
          </div>
          <Link href="/dashboard/transactions" className="text-xs font-semibold text-primary hover:underline">{t('common.viewAll')} →</Link>
        </div>
        <RecentActivity rows={recentActivityRows} emptyLabel={t('dashboard.recentActivityEmpty')} />
      </div>

      {/* RUM-008: unconfigured Budget/Goals, consolidated into one compact
          card instead of two more full-size empty ones. Last on the page —
          least urgent of what Home shows. */}
      {budgetNeedsSetup || goalsNeedSetup ? (
        <div className={cn(cardClass, 'p-4')}>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold">
            <ListChecks className="size-[14px] text-muted-foreground" aria-hidden="true" />
            {t('dashboard.setupTitle')}
          </h2>
          <div className="divide-y">
            {budgetNeedsSetup ? (
              <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <p className="text-xs text-muted-foreground">
                  {t('dashboard.noBudget', { month: formatMonthLabel(selectedMonth, locale) })}
                </p>
                <Link
                  href={`/dashboard/budgets?month=${selectedMonth}`}
                  className="shrink-0 text-xs font-semibold text-primary hover:underline"
                >
                  {t('dashboard.createBudget')} →
                </Link>
              </div>
            ) : null}
            {goalsNeedSetup ? (
              <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <p className="text-xs text-muted-foreground">{t('dashboard.goalsMiniEmpty')}</p>
                <Link href="/dashboard/goals" className="shrink-0 text-xs font-semibold text-primary hover:underline">
                  {t('dashboard.viewGoals')} →
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
