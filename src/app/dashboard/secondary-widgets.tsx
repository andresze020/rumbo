import Link from 'next/link'
import { AlertTriangle, ChevronRight, Layers, PiggyBank, Repeat, TrendingDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Callout } from '@/components/callout'
import { InsightCard } from '@/components/insight-card'
import { Money } from '@/components/dashboard/money'
import type { TranslationKey } from '@/lib/i18n/translate'
import type { Locale } from '@/lib/i18n/dictionaries'
import { formatCurrency, formatMonthLabel, formatPercent, localeToBcp47 } from '@/lib/format'
import { cn } from '@/lib/utils'
import { computeValuation, getDisplayedLiabilityBalance } from '@/lib/net-worth/valuation'
import {
  buildDashboardInsights,
  scheduledDirection,
  summarizeDebts,
  type DashboardInsight,
} from '@/lib/insights/dashboard'
import type { AccountBalance, BudgetDetailRow } from './page'

// 2026-09-26 redesign: money coming in is the only amount in color; money
// going out reads in normal ink with a minus sign, so a list of bills is not
// a wall of red.
const SCHEDULED_AMOUNT_CLASS = {
  in: 'text-emerald-600 dark:text-emerald-400',
  out: 'text-foreground',
  neutral: 'text-foreground',
} as const
const SCHEDULED_SIGN = { in: '+', out: '−', neutral: '' } as const

// Budget bars are colored by status, not by category: on track, close to the
// limit (90 %+), over. Status is also in the figures next to each bar.
function budgetBarClass(pct: number) {
  return pct > 1 ? 'bg-rose-500' : pct >= 0.9 ? 'bg-amber-500' : 'bg-primary'
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
}: DashboardSecondaryWidgetsProps) {
  const supabase = await createClient()
  const selectedMonthDate = `${selectedMonth}-01`
  const today = new Date().toISOString().slice(0, 10)

  const [
    { data: expenseCategoryRows, error: expenseCategoriesError },
    { data: categoryLookupRows, error: categoryLookupError },
    { data: recurringRows },
    { data: debtRows },
    { data: goalRows },
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
      .from('goals')
      .select('id, name, target_amount, current_amount, status')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const expenseCategories = (expenseCategoryRows ?? []) as MonthlyExpenseCategory[]
  const categoriesById = new Map(
    ((categoryLookupRows ?? []) as CategoryLookup[]).map((c) => [c.id, c])
  )

  const sortedExpenseCategories = [...expenseCategories].sort(
    (a, b) => Number(b.amount_base_currency) - Number(a.amount_base_currency)
  )
  const largestExpenseCategory = sortedExpenseCategories[0] ?? null
  const largestExpenseAmount = Number(largestExpenseCategory?.amount_base_currency ?? 0)

  // ── Where it went: top 5 + "Other", as ranked bars (2026-09-26: one hue
  // for magnitude replaces the rainbow donut; lengths compare, arcs don't).
  const TOP_CATEGORIES = 5
  const categoryRows: { name: string; value: number; categoryId: string | null }[] = sortedExpenseCategories
    .slice(0, TOP_CATEGORIES)
    .map((c) => ({
      name: getCategoryPath(c, categoriesById).name,
      value: Number(c.amount_base_currency),
      categoryId: c.category_id,
    }))
  const otherTotal = sortedExpenseCategories
    .slice(TOP_CATEGORIES)
    .reduce((s, c) => s + Number(c.amount_base_currency), 0)
  if (otherTotal > 0) categoryRows.push({ name: t('common.other'), value: otherTotal, categoryId: null })
  const categoryMax = Math.max(0, ...categoryRows.map((c) => c.value))
  const wholePercent = new Intl.NumberFormat(localeToBcp47(locale), { style: 'percent', maximumFractionDigits: 0 })

  // ── Budget top rows. ─────────────────────────────────────────────────────
  const budgetTop = [...budgetLines]
    .sort((a, b) => Number(b.actual_amount ?? 0) - Number(a.actual_amount ?? 0))
    .slice(0, 5)
    .map((line) => {
      const planned = Number(line.planned_amount ?? 0)
      const actual = Number(line.actual_amount ?? 0)
      const pct = planned > 0 ? actual / planned : 0
      const isOver = actual > planned && planned > 0
      return {
        id: line.line_id as string,
        categoryId: line.category_id,
        name: line.category_name ?? '—',
        actual,
        planned,
        pct,
        isOver,
        barClass: budgetBarClass(pct),
        barWidth: `${Math.min(100, Math.round(pct * 100))}%`,
        pctLabel: planned > 0 ? `${Math.round(pct * 100)}%` : '—',
      }
    })

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
    const runDate = row.next_run_date ? new Date(`${row.next_run_date}T00:00:00Z`) : null
    return {
      id: row.id,
      weekday: runDate ? new Intl.DateTimeFormat(localeToBcp47(locale), { weekday: 'short', timeZone: 'UTC' }).format(runDate) : '',
      day: runDate ? runDate.getUTCDate() : null,
      autoPost: row.auto_post,
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
  // Reconciled against ALL liability accounts, not the net-worth total:
  // `totalDebt` above reads unfiltered balances, so comparing it with a
  // figure that drops include_in_net_worth=false accounts would mix scopes.
  const allAccountLiabilities = computeValuation(balances).totalLiabilities
  const debtsSummary = summarizeDebts({
    activeDebtCount: activeDebtRows.length,
    plannerTotal: totalDebt,
    totalLiabilities: allAccountLiabilities,
  })
  const debtsOwed = debtsSummary.state !== 'none'

  // ── Goals mini. ───────────────────────────────────────────────────────────
  // `anyGoalsConfigured` reads the unfiltered rows so a household with only
  // paused/completed goals (RUM-008 review, Codex P2) doesn't land in
  // "Finish setting up" — it has configured goals, just none active right
  // now. `goalsMini` itself still only lists active ones, same as before.
  const allGoalRows = (goalRows ?? []) as Goal[]
  const anyGoalsConfigured = allGoalRows.length > 0
  const goalsMini = allGoalRows.filter((g) => g.status === 'active').map((g) => {
    const target = Number(g.target_amount)
    const pct = target > 0 ? Math.round(Math.min(1, Number(g.current_amount) / target) * 100) : 0
    return { id: g.id, name: g.name, pct }
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
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] [&>*]:min-w-0">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Budget vs actual */}
          {!budgetError && hasBudget ? (
            <section className={cn(cardClass, 'p-5')}>
              <WidgetHeader
                title={t('dashboard.budgetTitle')}
                meta={`${Math.round(totalBudgetPercent * 100)}% ${t('dashboard.budgetUsed')}`}
                action={{ href: `/dashboard/budgets?month=${selectedMonth}`, label: t('common.viewAll') }}
              />
              <div className="mt-4 space-y-4">
                {budgetTop.map((b) => (
                  <Link
                    key={b.id}
                    href={`/dashboard/transactions?category_id=${b.categoryId}&month=${selectedMonth}&type=expense`}
                    className="group block"
                  >
                    <div className="mb-1.5 flex items-baseline gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate group-hover:underline">{b.name}</span>
                      <span className={cn('font-semibold tabular-nums', b.isOver && 'text-rose-600 dark:text-rose-400')}>
                        {formatCurrency(b.actual, budgetCurrency)}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        / {formatCurrency(b.planned, budgetCurrency)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', b.barClass)} style={{ width: b.barWidth }} />
                      </div>
                      <span
                        className={cn(
                          'w-9 text-right text-xs tabular-nums',
                          b.isOver ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
                        )}
                      >
                        {b.pctLabel}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            {/* Where the money went */}
            {!expenseCategoriesError ? (
              <section className={cn(cardClass, 'p-5')}>
                <WidgetHeader
                  title={t('dashboard.byCategory')}
                  action={{ href: `/dashboard/reports?month=${selectedMonth}`, label: t('common.viewAll') }}
                />
                {categoryRows.length ? (
                  <ul className="mt-4 space-y-3.5">
                    {categoryRows.map((c) => {
                      const share = monthlyExpenses > 0 ? Math.max(0, c.value) / monthlyExpenses : 0
                      const width = categoryMax > 0 ? Math.max(2, (Math.max(0, c.value) / categoryMax) * 100) : 0
                      const row = (
                        <>
                          <span className="mb-1.5 flex items-baseline gap-2 text-sm">
                            <span className="min-w-0 flex-1 truncate group-hover:underline">{c.name}</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(c.value, dashboardCurrency)}</span>
                          </span>
                          <span className="flex items-center gap-3">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <span
                                className={cn('block h-full rounded-full', c.categoryId ? 'bg-primary' : 'bg-muted-foreground/40')}
                                style={{ width: `${width}%` }}
                              />
                            </span>
                            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                              {wholePercent.format(share)}
                            </span>
                          </span>
                        </>
                      )
                      return (
                        <li key={c.categoryId ?? 'other'}>
                          {c.categoryId ? (
                            <Link
                              href={`/dashboard/transactions?category_id=${c.categoryId}&month=${selectedMonth}&type=expense`}
                              className="group block"
                            >
                              {row}
                            </Link>
                          ) : (
                            <div className="block">{row}</div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="mt-4 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    {t('dashboard.expensesByCategoryEmpty', { month: formatMonthLabel(selectedMonth, locale) })}
                  </p>
                )}
              </section>
            ) : null}

            {/* Scheduled activity: RUM-009, income and expenses both appear
                here, so it is "Scheduled activity", not "Upcoming payments".
                The list is the next few runs by date, not a month total. */}
            <section className={cn(cardClass, 'p-5')}>
              <WidgetHeader title={t('dashboard.scheduledTitle')} action={{ href: '/dashboard/recurring', label: t('common.viewAll') }} />
              {upcoming.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">{t('dashboard.scheduledEmpty')}</p>
              ) : (
                <ul className="-mx-2 mt-3">
                  {upcoming.map((bl) => (
                    <li key={bl.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                      <span
                        className="flex w-11 shrink-0 flex-col items-center rounded-xl border bg-background py-1 leading-none"
                        aria-hidden="true"
                      >
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">{bl.weekday}</span>
                        <span className="mt-0.5 text-base font-semibold tabular-nums">{bl.day ?? '—'}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{bl.name}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span
                            className={cn(
                              bl.tagTone === 'warning' && 'font-medium text-amber-700 dark:text-amber-400'
                            )}
                          >
                            {bl.dueText}
                          </span>
                          {bl.autoPost ? (
                            <span className="inline-flex items-center gap-0.5" title={bl.tag}>
                              · <Repeat className="size-3" aria-hidden="true" />
                              {bl.tag}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <p className={cn('shrink-0 text-sm font-semibold tabular-nums', bl.amountClass)}>
                        {bl.sign}
                        {formatCurrency(bl.amount, bl.currency)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        {/* Right rail */}
        <aside className="flex flex-col gap-4">
          {/* Insights */}
          <section className={cn(cardClass, 'p-5')}>
            <WidgetHeader title={t('dashboard.insightsTitle')} />
            {visibleInsights.length ? (
              <>
                <ul className="mt-3 divide-y">
                  {visibleInsights.map((ins) => {
                    const view = renderInsight(ins)
                    return (
                      <li key={ins.kind} className="py-3 first:pt-1 last:pb-1">
                        <InsightCard tone={ins.tone} icon={view.icon} action={{ href: ins.href, label: view.actionLabel }}>
                          {view.text}
                        </InsightCard>
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  {t('dashboard.insightsBasis', { month: formatMonthLabel(selectedMonth, locale) })}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{t('dashboard.insightsEmpty')}</p>
            )}
          </section>

          {/* Debts mini */}
          <section className={cn(cardClass, 'p-5')}>
            <WidgetHeader title={t('dashboard.debtsMiniTitle')} action={{ href: '/dashboard/debts', label: t('dashboard.planDebt') }} />
            {!debtsOwed ? (
              <p className="mt-3 text-sm text-muted-foreground">{t('dashboard.debtsMiniEmpty')}</p>
            ) : debtsSummary.state === 'untracked-liabilities' ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t('dashboard.debtsMiniUntracked', { amount: formatCurrency(debtsSummary.accountLiabilities, baseCurrency) })}
              </p>
            ) : (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">{t('dashboard.debtsMiniPlannerTotal')}</p>
                <p className="mb-3 mt-0.5 text-2xl font-semibold tracking-tight">
                  <Money value={totalDebt} currency={baseCurrency} />
                </p>
                {debtPaidPct !== null ? (
                  <>
                    <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${debtPaidPct}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {debtPaidPct}% {t('dashboard.debtPaidOff')}
                      {nextPayment > 0 ? ` · ${t('dashboard.nextPaymentLabel')}: ${formatCurrency(nextPayment, baseCurrency)}` : ''}
                    </p>
                  </>
                ) : nextPayment > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t('dashboard.nextPaymentLabel')}: {formatCurrency(nextPayment, baseCurrency)}
                  </p>
                ) : null}
                {debtsSummary.untrackedLiabilities > 0 ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t('dashboard.debtsMiniOtherLiabilities', { amount: formatCurrency(debtsSummary.untrackedLiabilities, baseCurrency) })}
                  </p>
                ) : null}
              </div>
            )}
          </section>

          {/* Goals mini */}
          {!goalsNeedSetup ? (
            <section className={cn(cardClass, 'p-5')}>
              <WidgetHeader title={t('dashboard.goalsMiniTitle')} action={{ href: '/dashboard/goals', label: t('dashboard.viewGoals') }} />
              {goalsMini.length > 0 ? (
                <div className="mt-4 space-y-3.5">
                  {goalsMini.map((g) => (
                    <div key={g.id}>
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">{g.name}</span>
                        <span className="text-xs font-semibold tabular-nums">{g.pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${g.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Configured (anyGoalsConfigured) but none are currently
                // active — a real household state (paused/completed goals),
                // not the "never set up" case "Finish setting up" covers.
                <p className="mt-3 text-sm text-muted-foreground">{t('dashboard.goalsMiniEmpty')}</p>
              )}
            </section>
          ) : null}
        </aside>
      </div>

      {/* RUM-008: unconfigured Budget/Goals, consolidated into one compact
          card instead of two more full-size empty ones. Last on the page —
          least urgent of what Home shows. */}
      {budgetNeedsSetup || goalsNeedSetup ? (
        <section className={cn(cardClass, 'p-5')}>
          <WidgetHeader title={t('dashboard.setupTitle')} />
          <div className="mt-2 divide-y">
            {budgetNeedsSetup ? (
              <SetupRow
                text={t('dashboard.noBudget', { month: formatMonthLabel(selectedMonth, locale) })}
                href={`/dashboard/budgets?month=${selectedMonth}`}
                label={t('dashboard.createBudget')}
              />
            ) : null}
            {goalsNeedSetup ? (
              <SetupRow text={t('dashboard.goalsMiniEmpty')} href="/dashboard/goals" label={t('dashboard.viewGoals')} />
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  )
}

/** One header for every Dashboard widget: title, an optional quiet figure, an optional link. */
function WidgetHeader({
  title,
  meta,
  action,
}: {
  title: string
  meta?: string
  action?: { href: string; label: string }
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-baseline gap-2 text-sm font-semibold">
        <span className="truncate">{title}</span>
        {meta ? <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">{meta}</span> : null}
      </h2>
      {action ? <WidgetLink href={action.href}>{action.label}</WidgetLink> : null}
    </div>
  )
}

function WidgetLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-mr-2 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
      <ChevronRight className="size-3.5" aria-hidden="true" />
    </Link>
  )
}

function SetupRow({ text, href, label }: { text: string; href: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 last:pb-0">
      <p className="text-sm text-muted-foreground">{text}</p>
      <WidgetLink href={href}>{label}</WidgetLink>
    </div>
  )
}
