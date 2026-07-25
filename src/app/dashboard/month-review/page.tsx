import Link from 'next/link'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Layers,
  ListChecks,
  Lock,
  Percent,
  PiggyBank,
  RotateCcw,
  Tags,
  TrendingDown,
} from 'lucide-react'
import { closeMonthAction, reopenMonthAction } from './actions'
import { PageHeader } from '@/components/page-header'
import { MonthNav } from '@/components/month-nav'
import { Callout } from '@/components/callout'
import { InfoTooltip } from '@/components/info-tooltip'
import { SubmitButton } from '@/components/submit-button'
import { formatCurrency, formatIsoDate, formatPercent } from '@/lib/format'
import { getLocale } from '@/lib/i18n/server'
import { computeHealthScore, healthGrade } from '@/lib/health/score'
import { cn } from '@/lib/utils'
import {
  getHousehold,
  getMonthlySeries,
  getCategoryLookup,
  getExpenseCategories,
  getBudgetLines,
  longMonthLabel,
  parseMonthParam,
  shiftMonth,
  SERIES_PALETTE,
} from '@/lib/analysis/server'

type MonthReviewPageProps = {
  searchParams: Promise<{
    month?: string
    closed?: string
    reopened?: string
    error?: string
  }>
}

const CARD = 'rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'

// ── Small colored-span delta helpers (reimplemented locally, no i18n). ──────
// Mirror the dashboard's renderPctDelta / renderRateDelta logic.
function PctDelta({
  current,
  previous,
  higherIsBad = false,
}: {
  current: number
  previous: number | null
  higherIsBad?: boolean
}) {
  if (previous === null || previous === 0) return null
  const diff = (current - previous) / Math.abs(previous)
  if (Math.abs(diff) < 0.0005) {
    return <span className="text-[11.5px] font-medium text-muted-foreground">No change vs prev. month</span>
  }
  const isUp = diff > 0
  const isGood = higherIsBad ? !isUp : isUp
  const formatted = new Intl.NumberFormat('en-CA', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(diff) * 100)
  return (
    <span
      className={cn(
        'text-[11.5px] font-medium',
        isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
      )}
    >
      {isUp ? '↑' : '↓'} {formatted}% vs prev. month
    </span>
  )
}

function RateDelta({ diff }: { diff: number | null }) {
  if (diff === null) return null
  if (Math.abs(diff) < 0.0001) {
    return <span className="text-[11.5px] font-medium text-muted-foreground">No change vs prev. month</span>
  }
  const isUp = diff > 0
  const formatted = new Intl.NumberFormat('en-CA', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(diff * 100))
  return (
    <span
      className={cn(
        'text-[11.5px] font-medium',
        isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
      )}
    >
      {isUp ? '↑' : '↓'} {formatted} pp vs prev. month
    </span>
  )
}

export default async function MonthReviewPage({ searchParams }: MonthReviewPageProps) {
  const locale = await getLocale()
  const params = await searchParams
  const month = parseMonthParam(params.month)
  const prevMonth = shiftMonth(month, -1)
  const ctx = await getHousehold()
  const currency = ctx.household.base_currency

  const [series, categoryLookup, budget] = await Promise.all([
    getMonthlySeries(ctx, [prevMonth, month]),
    getCategoryLookup(ctx),
    getBudgetLines(ctx, month),
  ])
  const [thisCats, prevCats] = await Promise.all([
    getExpenseCategories(ctx, month, categoryLookup),
    getExpenseCategories(ctx, prevMonth, categoryLookup),
  ])

  const prev = series[0] ?? { income: 0, expenses: 0, savings: 0, savingsRate: null }
  const curr = series[1] ?? { income: 0, expenses: 0, savings: 0, savingsRate: null }

  const hasActivity = curr.income !== 0 || curr.expenses !== 0
  const savingsRateDelta =
    curr.savingsRate != null && prev.savingsRate != null ? curr.savingsRate - prev.savingsRate : null

  // ── Budget performance. ────────────────────────────────────────────────────
  const budgetLines = budget.lines.filter((l) => l.planned > 0)
  const budgetCurrency = budget.currency
  const totalPlanned = budgetLines.reduce((s, l) => s + l.planned, 0)
  const totalActual = budgetLines.reduce((s, l) => s + l.actual, 0)
  const totalBudgetPercent = totalPlanned > 0 ? totalActual / totalPlanned : 0
  const hasBudget = budgetLines.length > 0
  const budgetChips = [...budgetLines]
    .sort((a, b) => b.actual / (b.planned || 1) - a.actual / (a.planned || 1))
    .map((line, i) => {
      const pct = line.planned > 0 ? line.actual / line.planned : 0
      return {
        id: line.lineId,
        categoryId: line.categoryId,
        name: line.name,
        actual: line.actual,
        planned: line.planned,
        pct,
        over: pct > 1,
        color: SERIES_PALETTE[i % SERIES_PALETTE.length],
        pctLabel: `${Math.round(pct * 100)}% used`,
      }
    })
  const overBudget = budgetChips.find((c) => c.over) ?? null

  // ── Biggest changes vs. previous month (expense categories). ───────────────
  const prevByCat = new Map(prevCats.map((c) => [c.categoryId, c.value]))
  const seenCat = new Set<string>()
  const changes: Array<{
    id: string
    name: string
    diff: number
    pct: number | null
    increased: boolean
  }> = []
  for (const c of thisCats) {
    seenCat.add(c.categoryId)
    const prevVal = prevByCat.get(c.categoryId) ?? 0
    const diff = c.value - prevVal
    if (Math.abs(diff) < 0.01) continue
    changes.push({
      id: c.categoryId,
      name: c.name,
      diff,
      pct: prevVal > 0 ? diff / prevVal : null,
      increased: diff > 0,
    })
  }
  // Categories that dropped out entirely (spent last month, nothing this month).
  for (const c of prevCats) {
    if (seenCat.has(c.categoryId) || c.value < 0.01) continue
    changes.push({ id: c.categoryId, name: c.name, diff: -c.value, pct: -1, increased: false })
  }
  const topChanges = changes.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 6)

  // ── Top expense category (real). ───────────────────────────────────────────
  const topExpense = thisCats[0] ?? null

  // ── Pending-review count — graceful if the column doesn't exist yet. ───────
  let pendingReview: number | null = null
  {
    const { count, error } = await ctx.supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', ctx.household.id)
      .eq('review_status', 'unreviewed')
      .neq('transaction_type', 'opening_balance')
      .is('deleted_at', null)
    if (!error) pendingReview = count ?? 0
  }

  // ── Health score (BR-021): a real, documented formula (see lib/health/score).
  //    Weighted savings rate (65%) + budget adherence (35%). ─────────────────
  const score = computeHealthScore({
    savingsRate: curr.savingsRate,
    hasBudget,
    budgetPercent: totalBudgetPercent,
  })
  const scoreGrade = healthGrade(score)

  // ── BR-021: light "close month" state (marker + snapshot, no ledger lock). ──
  const monthClosed = params.closed === '1'
  const monthReopened = params.reopened === '1'
  const closeError = typeof params.error === 'string' ? params.error : null
  const { data: closureRow } = await ctx.supabase
    .from('month_closures')
    .select('closed_at, note')
    .eq('household_id', ctx.household.id)
    .eq('closure_month', `${month}-01`)
    .maybeSingle()
  const isClosed = Boolean(closureRow)
  const closedAtLabel = closureRow?.closed_at
    ? formatIsoDate(closureRow.closed_at.slice(0, 10), locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  // ── Suggested actions (real data only, max 4). ─────────────────────────────
  type Action = {
    key: string
    icon: React.ReactNode
    accent: string
    title: string
    description: string
    href?: string
  }
  const actions: Action[] = []
  if (overBudget) {
    actions.push({
      key: 'over-budget',
      icon: <AlertTriangle />,
      accent: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
      title: `Review ${overBudget.name} spending`,
      description: `It's at ${Math.round(overBudget.pct * 100)}% of plan this month.`,
      href: `/dashboard/transactions?month=${month}&type=expense`,
    })
  }
  if (pendingReview !== null && pendingReview > 0) {
    actions.push({
      key: 'pending-review',
      icon: <ListChecks />,
      accent: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
      title: `Categorize ${pendingReview} transaction${pendingReview === 1 ? '' : 's'} to review`,
      description: 'Clear your review queue before closing the books.',
      href: '/dashboard/transactions',
    })
  }
  if (hasActivity && curr.savings > 0.01) {
    actions.push({
      key: 'cash-flow-positive',
      icon: <PiggyBank />,
      accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
      title: `You saved ${formatCurrency(curr.savings, currency)}`,
      description: 'Consider moving it to savings or paying down debt.',
      href: `/dashboard/accounts`,
    })
  } else if (hasActivity && curr.savings < -0.01) {
    actions.push({
      key: 'cash-flow-negative',
      icon: <TrendingDown />,
      accent: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
      title: `You spent ${formatCurrency(Math.abs(curr.savings), currency)} more than you earned`,
      description: 'Look for categories that ran over and adjust next month.',
      href: `/dashboard/budgets?month=${month}`,
    })
  }
  if (topExpense && actions.length < 4) {
    actions.push({
      key: 'top-expense',
      icon: <Layers />,
      accent: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
      title: `${topExpense.name} was your top expense`,
      description: `${formatCurrency(topExpense.value, currency)} across ${topExpense.count} transaction${topExpense.count === 1 ? '' : 's'}.`,
      href: `/dashboard/transactions?category_id=${topExpense.categoryId}&month=${month}&type=expense`,
    })
  }
  const visibleActions = actions.slice(0, 4)

  const kpis = [
    {
      label: 'Income',
      value: formatCurrency(curr.income, currency),
      valueClass: 'text-emerald-600 dark:text-emerald-400',
      delta: <PctDelta current={curr.income} previous={prev.income} />,
      icon: <ArrowUpRight />,
      accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    },
    {
      label: 'Expenses',
      value: formatCurrency(curr.expenses, currency),
      valueClass: 'text-red-600 dark:text-red-400',
      delta: <PctDelta current={curr.expenses} previous={prev.expenses} higherIsBad />,
      icon: <ArrowDownRight />,
      accent: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
    },
    {
      label: 'Savings',
      value: `${curr.savings >= 0 ? '+' : '−'}${formatCurrency(Math.abs(curr.savings), currency)}`,
      valueClass: curr.savings >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      delta: <PctDelta current={curr.savings} previous={prev.savings} />,
      icon: <PiggyBank />,
      accent: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
    },
    {
      label: 'Savings rate',
      value: formatPercent(curr.savingsRate),
      valueClass: undefined as string | undefined,
      delta: <RateDelta diff={savingsRateDelta} />,
      icon: <Percent />,
      accent: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
    },
  ]

  return (
    <main className="mx-auto flex w-full max-w-[1340px] flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        eyebrow="Overview"
        title="Month in review"
        description={`A guided summary of ${longMonthLabel(month)} before you close the books.`}
        actions={
          <MonthNav
            month={month}
            basePath="/dashboard/month-review"
            previousLabel="Previous month"
            nextLabel="Next month"
          />
        }
      />

      {monthClosed ? (
        <Callout variant="success">
          Month closed. It&apos;s recorded with a snapshot — you can still edit transactions or reopen it anytime.
        </Callout>
      ) : null}
      {monthReopened ? <Callout variant="info">Month reopened.</Callout> : null}
      {closeError ? <Callout variant="error">{closeError}</Callout> : null}

      {/* Month status + health */}
      <div className={cn(CARD, 'flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5')}>
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full border-[3px] border-primary bg-primary/10">
            <span className="text-xl font-bold text-primary">{scoreGrade}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-bold">
              Month health
              <InfoTooltip
                text="Score out of 100 from your savings rate (65%) and, when you have a budget, budget adherence (35%). 100 ≈ saving 20%+ of income while staying within budget. Guidance, not financial advice."
                label="Month health"
              />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{score}/100</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {longMonthLabel(month)} · {hasActivity ? 'Activity recorded' : 'No activity yet'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isClosed ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Closed{closedAtLabel ? ` · ${closedAtLabel}` : ''}
              </span>
              <form action={reopenMonthAction}>
                <input type="hidden" name="month" value={month} />
                <SubmitButton type="submit" variant="outline" size="sm" pendingText="Reopening…">
                  <RotateCcw aria-hidden="true" />
                  Reopen
                </SubmitButton>
              </form>
            </>
          ) : (
            <form action={closeMonthAction}>
              <input type="hidden" name="month" value={month} />
              <input type="hidden" name="income" value={curr.income} />
              <input type="hidden" name="expenses" value={curr.expenses} />
              <input type="hidden" name="savings" value={curr.savings} />
              <input type="hidden" name="savings_rate" value={curr.savingsRate ?? ''} />
              <input type="hidden" name="score" value={score} />
              <input type="hidden" name="grade" value={scoreGrade} />
              <input type="hidden" name="currency" value={currency} />
              <SubmitButton type="submit" size="sm" className="gap-2" pendingText="Closing…">
                <Lock aria-hidden="true" />
                Close month
              </SubmitButton>
            </form>
          )}
        </div>
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
            <p className="mt-1">{kpi.delta}</p>
          </div>
        ))}
      </div>

      {!hasActivity ? (
        <Callout variant="info" className="border-dashed text-muted-foreground">
          No posted income or expense activity for {longMonthLabel(month)}.
        </Callout>
      ) : null}

      {/* Budget performance + Suggested actions */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Budget performance */}
        <div className={cn(CARD, 'p-4 sm:p-5')}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold">Budget performance</h2>
            {hasBudget ? (
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                  totalBudgetPercent > 1
                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                )}
              >
                {Math.round(totalBudgetPercent * 100)}% used
              </span>
            ) : null}
          </div>
          {hasBudget ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {budgetChips.map((chip) => (
                <Link
                  key={chip.id}
                  href={
                    chip.categoryId
                      ? `/dashboard/transactions?category_id=${chip.categoryId}&month=${month}&type=expense`
                      : `/dashboard/budgets?month=${month}`
                  }
                  className={cn(
                    'block rounded-lg border px-3 py-2 text-xs transition-opacity hover:opacity-80',
                    chip.over
                      ? 'border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30'
                      : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: chip.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-medium">{chip.name}</span>
                    <span
                      className={cn(
                        'shrink-0 font-semibold tabular-nums',
                        chip.over ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                      )}
                    >
                      {chip.pctLabel}
                    </span>
                  </div>
                  <p className="mt-1 pl-4 tabular-nums text-muted-foreground">
                    {formatCurrency(chip.actual, budgetCurrency)} / {formatCurrency(chip.planned, budgetCurrency)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <Link
              href={`/dashboard/budgets?month=${month}`}
              className="block rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/40"
            >
              No budget set for {longMonthLabel(month)}. Create one to track performance →
            </Link>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">Amounts in {budgetCurrency}.</p>
        </div>

        {/* Suggested actions */}
        <div className={cn(CARD, 'p-4 sm:p-5')}>
          <h2 className="mb-3 text-sm font-bold">Suggested actions</h2>
          {visibleActions.length ? (
            <ul className="flex flex-col gap-2.5">
              {visibleActions.map((action) => {
                const inner = (
                  <div className="flex gap-3 rounded-lg border bg-muted/40 p-3">
                    <span
                      className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[18px]', action.accent)}
                      aria-hidden="true"
                    >
                      {action.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight">{action.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{action.description}</p>
                    </div>
                  </div>
                )
                return (
                  <li key={action.key}>
                    {action.href ? (
                      <Link href={action.href} className="block transition-opacity hover:opacity-80">
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
            <div className="flex items-center gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              Nothing needs your attention — this month looks clean.
            </div>
          )}
        </div>
      </div>

      {/* Biggest changes vs. previous month */}
      <div className={cn(CARD, 'p-4 sm:p-5')}>
        <div className="mb-3 flex items-center gap-2">
          <Tags className="size-[15px] text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-bold">Biggest changes vs. {longMonthLabel(prevMonth)}</h2>
        </div>
        {topChanges.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {topChanges.map((change) => (
              <div key={change.id} className="rounded-lg border bg-muted/40 p-3">
                <p className="truncate text-xs font-medium text-muted-foreground">{change.name}</p>
                <p
                  className={cn(
                    'mt-1 text-2xl font-bold tabular-nums',
                    change.increased ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  {change.pct === null
                    ? change.increased
                      ? 'New'
                      : 'Gone'
                    : `${change.increased ? '+' : '−'}${new Intl.NumberFormat('en-CA', {
                        maximumFractionDigits: 0,
                      }).format(Math.abs(change.pct) * 100)}%`}
                </p>
                <p
                  className={cn(
                    'mt-0.5 text-xs font-medium tabular-nums',
                    change.increased ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  {change.increased ? '+' : '−'}
                  {formatCurrency(Math.abs(change.diff), currency)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Not enough activity to compare with {longMonthLabel(prevMonth)}.
          </p>
        )}
      </div>
    </main>
  )
}
