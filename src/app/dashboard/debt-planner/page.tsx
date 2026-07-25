import Link from 'next/link'
import {
  Banknote,
  CalendarClock,
  Percent,
  TrendingDown,
  Sparkles,
  Layers,
} from 'lucide-react'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { LocalizedClientBoundary } from '@/components/localized-client-boundary'
import { Callout } from '@/components/callout'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { AmountInput } from '@/components/amount-input'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getHousehold } from '@/lib/analysis/server'

const CARD = 'rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'

type DebtRow = {
  id: string
  account_id: string
  name: string
  lender_name: string | null
  original_principal: number | string | null
  interest_rate: number | string | null
  interest_rate_period: string | null
  minimum_payment: number | string | null
  payment_due_day: number | string | null
  status: string
}

type AccountBalance = {
  account_id: string
  posted_balance_base_currency: number | string
}

type Strategy = 'avalanche' | 'snowball'

/** A single debt prepared for simulation. */
type PlanDebt = {
  id: string
  name: string
  balance: number
  monthlyRate: number
  minPayment: number
}

const STRATEGIES: Array<{ key: Strategy; label: string; icon: typeof Layers }> = [
  { key: 'avalanche', label: 'Avalanche', icon: TrendingDown },
  { key: 'snowball', label: 'Snowball', icon: Layers },
]

const STRATEGY_DESCRIPTION: Record<Strategy, string> = {
  avalanche: 'Avalanche pays the highest-interest debt first — least interest paid.',
  snowball: 'Snowball pays the smallest balance first — fastest first win.',
}

const MONTH_CAP = 1200

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function parseStrategy(value: string | undefined): Strategy {
  return value === 'snowball' ? 'snowball' : 'avalanche'
}

function parseExtra(value: string | undefined): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/**
 * Orders debts according to the strategy. Avalanche targets the highest
 * monthly rate first; snowball targets the smallest balance first. Returns a
 * new array of indexes into the input array.
 */
function strategyOrder(debts: PlanDebt[], strategy: Strategy): number[] {
  const indexes = debts.map((_, i) => i)
  indexes.sort((a, b) => {
    if (strategy === 'avalanche') {
      if (debts[b].monthlyRate !== debts[a].monthlyRate) {
        return debts[b].monthlyRate - debts[a].monthlyRate
      }
      return debts[a].balance - debts[b].balance
    }
    if (debts[a].balance !== debts[b].balance) {
      return debts[a].balance - debts[b].balance
    }
    return debts[b].monthlyRate - debts[a].monthlyRate
  })
  return indexes
}

type SimulationResult = {
  /** Total whole months to clear every debt, or null if it never converges. */
  months: number | null
  /** Total interest accrued across all debts over the plan, or null. */
  totalInterest: number | null
  /** Payoff month (1-based) per debt id, or null if that debt never clears. */
  perDebtPayoffMonthIndex: Record<string, number | null>
}

/**
 * Pure month-by-month amortization simulation.
 *
 * Each month every debt accrues interest, then pays its minimum (capped at the
 * remaining balance). The strategy's rollover budget — the user's `extra` plus
 * every freed-up minimum from already-paid debts — is then applied to the
 * single target debt (the first unpaid debt in strategy order). Stops when all
 * balances are ~0, or after MONTH_CAP months (no convergence).
 *
 * Presentation/projection only — never writes to the DB.
 */
function simulate(debts: PlanDebt[], strategy: Strategy, extra: number): SimulationResult {
  const order = strategyOrder(debts, strategy)
  const balances = debts.map((d) => d.balance)
  const payoffMonth: Array<number | null> = debts.map((d) => (d.balance <= 0 ? 0 : null))
  let totalInterest = 0
  let month = 0

  const EPS = 0.005

  const remaining = () => balances.some((b) => b > EPS)

  while (remaining() && month < MONTH_CAP) {
    month += 1

    // 1. Accrue interest on every unpaid debt.
    for (let i = 0; i < debts.length; i++) {
      if (balances[i] <= EPS) continue
      const interest = balances[i] * debts[i].monthlyRate
      totalInterest += interest
      balances[i] += interest
    }

    // 2. Pay each debt's minimum (capped at its balance).
    for (let i = 0; i < debts.length; i++) {
      if (balances[i] <= EPS) continue
      const pay = Math.min(debts[i].minPayment, balances[i])
      balances[i] -= pay
    }

    // 3. Build the rollover budget: user's extra + freed-up minimums.
    let budget = extra
    for (let i = 0; i < debts.length; i++) {
      if (balances[i] <= EPS) budget += debts[i].minPayment
    }

    // 4. Apply budget to the unpaid debts in strategy order.
    for (const idx of order) {
      if (budget <= EPS) break
      if (balances[idx] <= EPS) continue
      const pay = Math.min(budget, balances[idx])
      balances[idx] -= pay
      budget -= pay
    }

    // 5. Mark newly-cleared debts.
    for (let i = 0; i < debts.length; i++) {
      if (payoffMonth[i] === null && balances[i] <= EPS) {
        payoffMonth[i] = month
      }
    }
  }

  const converged = !remaining()
  const perDebtPayoffMonthIndex: Record<string, number | null> = {}
  for (let i = 0; i < debts.length; i++) {
    perDebtPayoffMonthIndex[debts[i].id] = converged ? payoffMonth[i] : null
  }

  return {
    months: converged ? month : null,
    totalInterest: converged ? totalInterest : null,
    perDebtPayoffMonthIndex,
  }
}

/** Formats a whole-month count as "X yr Y mo" (or "—" for null). */
function formatDuration(months: number | null): string {
  if (months === null) return '—'
  if (months <= 0) return '0 mo'
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) return `${rest} mo`
  if (rest === 0) return `${years} yr`
  return `${years} yr ${rest} mo`
}

function rateColorClass(ratePercent: number): string {
  if (ratePercent >= 25) return 'text-rose-600 dark:text-rose-400'
  if (ratePercent >= 12) return 'text-amber-600 dark:text-amber-400'
  return 'text-muted-foreground'
}

type DebtPlannerPageProps = {
  searchParams: Promise<{ strategy?: string; extra?: string }>
}

export default async function DebtPlannerPage({ searchParams }: DebtPlannerPageProps) {
  const params = await searchParams
  const strategy = parseStrategy(params.strategy)
  const extra = parseExtra(params.extra)

  const ctx = await getHousehold()
  const currency = ctx.household.base_currency

  // Fetch active debts and current balances, exactly like the debts page.
  const [{ data: debtsData }, { data: balancesData }] = await Promise.all([
    ctx.supabase
      .from('debts')
      .select(
        'id, account_id, name, lender_name, original_principal, interest_rate, interest_rate_period, minimum_payment, payment_due_day, status'
      )
      .eq('household_id', ctx.household.id)
      .is('deleted_at', null),
    ctx.supabase.rpc('get_account_balances', {
      p_household_id: ctx.household.id,
      p_as_of_date: todayIsoDate(),
    }),
  ])

  const debtRows = ((debtsData ?? []) as DebtRow[]).filter((d) => d.status === 'active')
  const balancesByAccountId = new Map(
    ((balancesData ?? []) as AccountBalance[]).map((b) => [b.account_id, b])
  )

  // Build per-debt simulation inputs. Outstanding balance is derived from
  // transaction_entries via get_account_balances (base currency).
  const planDebts: PlanDebt[] = debtRows
    .map((d) => {
      const balance = Math.max(
        0,
        -Number(
          balancesByAccountId.get(d.account_id)?.posted_balance_base_currency ?? 0
        )
      )
      const rate = d.interest_rate === null ? 0 : Number(d.interest_rate)
      const monthlyRate =
        d.interest_rate_period === 'monthly' ? rate / 100 : rate / 100 / 12
      return {
        id: d.id,
        name: d.lender_name?.trim() || d.name,
        balance,
        monthlyRate: Number.isFinite(monthlyRate) && monthlyRate > 0 ? monthlyRate : 0,
        minPayment: Math.max(0, Number(d.minimum_payment ?? 0)),
      }
    })
    .filter((d) => d.balance > 0)

  if (planDebts.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-[1340px] flex-col gap-4 p-4 sm:p-6">
        <PageHeader
          eyebrow="Planning"
          title="Debt planner"
          description="Compare payoff strategies and see how much interest an extra payment saves."
          actions={
            <Link
              href="/dashboard/debts"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Manage debts
            </Link>
          }
        />
        <EmptyState
          title="No active debts to plan"
          description="Add a debt with a balance, interest rate and minimum payment to build a payoff plan."
          actionHref="/dashboard/debts"
          actionLabel="Go to debts"
        />
      </main>
    )
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalDebt = planDebts.reduce((s, d) => s + d.balance, 0)
  const totalMinimum = planDebts.reduce((s, d) => s + d.minPayment, 0)

  // Balance-weighted average annual rate (mirrors the debts page averageRate).
  const ratedDebts = debtRows
    .map((d) => {
      const balance = Math.max(
        0,
        -Number(
          balancesByAccountId.get(d.account_id)?.posted_balance_base_currency ?? 0
        )
      )
      return { rate: d.interest_rate === null ? 0 : Number(d.interest_rate), balance }
    })
    .filter((d) => d.rate > 0 && d.balance > 0)
  const ratedBalanceTotal = ratedDebts.reduce((s, d) => s + d.balance, 0)
  const averageRate =
    ratedBalanceTotal > 0
      ? ratedDebts.reduce((s, d) => s + d.rate * d.balance, 0) / ratedBalanceTotal
      : null

  // ── Simulations ─────────────────────────────────────────────────────────────
  const baseline = simulate(planDebts, strategy, 0)
  const withExtra = simulate(planDebts, strategy, extra)

  const interestSaved =
    baseline.totalInterest !== null && withExtra.totalInterest !== null
      ? Math.max(0, baseline.totalInterest - withExtra.totalInterest)
      : null
  const monthsSaved =
    baseline.months !== null && withExtra.months !== null
      ? Math.max(0, baseline.months - withExtra.months)
      : null

  // Order debts by the active strategy for display.
  const orderedDebts = strategyOrder(planDebts, strategy).map((i) => planDebts[i])

  const kpis = [
    {
      label: 'Total debt',
      value: formatCurrency(totalDebt, currency),
      valueClass: 'text-rose-600 dark:text-rose-400',
      icon: <Banknote />,
      accent: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
    },
    {
      label: 'Avg. interest rate',
      value:
        averageRate !== null
          ? `${new Intl.NumberFormat('en-CA', { maximumFractionDigits: 1 }).format(averageRate)}%`
          : 'N/A',
      valueClass: 'text-amber-600 dark:text-amber-400',
      icon: <Percent />,
      accent: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
    },
    {
      label: 'Total minimum / mo',
      value: formatCurrency(totalMinimum, currency),
      valueClass: 'text-sky-600 dark:text-sky-400',
      icon: <CalendarClock />,
      accent: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
    },
    {
      label: 'Debt-free in',
      value: formatDuration(withExtra.months),
      valueClass: 'text-emerald-600 dark:text-emerald-400',
      icon: <Sparkles />,
      accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    },
  ]

  return (
    <LocalizedClientBoundary>
    <main className="mx-auto flex w-full max-w-[1340px] flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        eyebrow="Planning"
        title="Debt planner"
        description="Compare payoff strategies and see how much interest an extra payment saves."
        actions={
          <Link
            href="/dashboard/debts"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Manage debts
          </Link>
        }
      />

      <p className="max-w-2xl text-sm text-muted-foreground">
        Plan how to clear your debts faster. Pick a payoff strategy, then enter any extra
        amount you could put toward debt each month — the plan shows which debt to attack
        first, your debt-free date, and how much interest you&apos;d save.
      </p>

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
              <span className="truncate text-sm font-medium text-muted-foreground">
                {kpi.label}
              </span>
            </div>
            <p
              className={cn(
                'mt-2.5 text-xl font-semibold tabular-nums sm:text-2xl',
                kpi.valueClass
              )}
            >
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Strategy control + extra payment */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex w-full gap-1 overflow-x-auto rounded-xl border bg-muted/40 p-1 sm:w-fit">
            {STRATEGIES.map((s) => {
              const active = strategy === s.key
              const Icon = s.icon
              const qs = new URLSearchParams({ strategy: s.key })
              if (extra > 0) qs.set('extra', String(extra))
              return (
                <Link
                  key={s.key}
                  href={`/dashboard/debt-planner?${qs.toString()}`}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors sm:flex-none',
                    active
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {s.label}
                </Link>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">{STRATEGY_DESCRIPTION[strategy]}</p>
        </div>

        {/* Extra-payment GET form */}
        <form
          action="/dashboard/debt-planner"
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="strategy" value={strategy} />
          <div className="w-44 space-y-1.5">
            <Label htmlFor="extra" className="text-xs text-muted-foreground">
              Extra payment / month
            </Label>
            <AmountInput
              id="extra"
              name="extra"
              currencyCode={currency}
              defaultValue={extra > 0 ? String(extra) : ''}
              placeholder="0.00"
            />
          </div>
          <button type="submit" className={buttonVariants({ size: 'sm' })}>
            Recalculate
          </button>
        </form>
      </div>

      {/* Debt table */}
      <div className={cn(CARD, 'overflow-hidden')}>
        <div className="border-b px-4 py-3 sm:px-5">
          <h2 className="text-sm font-bold">Payoff order · {strategy === 'avalanche' ? 'Avalanche' : 'Snowball'}</h2>
          <p className="text-xs text-muted-foreground">
            Debts in the order this strategy pays them down.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium sm:px-5">Creditor</th>
                <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                <th className="px-4 py-2.5 text-right font-medium">Rate</th>
                <th className="px-4 py-2.5 text-right font-medium">Min. payment</th>
                <th className="px-4 py-2.5 text-right font-medium sm:px-5">Payoff</th>
              </tr>
            </thead>
            <tbody>
              {orderedDebts.map((d, i) => {
                const annualRate =
                  d.monthlyRate > 0
                    ? d.monthlyRate * 12 * 100
                    : 0
                return (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="px-4 py-3 sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 truncate font-medium">{d.name}</span>
                        {i === 0 ? (
                          <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                            Pay first
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400">
                      {formatCurrency(d.balance, currency)}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right font-mono tabular-nums',
                        rateColorClass(annualRate)
                      )}
                    >
                      {annualRate > 0
                        ? `${new Intl.NumberFormat('en-CA', { maximumFractionDigits: 1 }).format(annualRate)}%`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">
                      {formatCurrency(d.minPayment, currency)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums sm:px-5">
                      {formatDuration(withExtra.perDebtPayoffMonthIndex[d.id] ?? null)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comparison grid */}
      <div className="grid items-stretch gap-4 sm:grid-cols-2">
        {/* Baseline */}
        <div className={cn(CARD, 'flex flex-col p-4 sm:p-5')}>
          <h2 className="text-sm font-bold">Minimum payments only</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Paying just the minimums on every debt.
          </p>
          {baseline.months === null ? (
            <>
              <p className="mt-4 text-2xl font-semibold tabular-nums">—</p>
              <p className="mt-1 text-sm font-medium text-rose-600 dark:text-rose-400">
                Never (minimums too low)
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                At least one debt&apos;s minimum payment doesn&apos;t cover its monthly
                interest, so the balance never falls.
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 text-2xl font-semibold tabular-nums">
                {formatDuration(baseline.months)}
              </p>
              <p className="mt-1 text-sm font-medium text-rose-600 dark:text-rose-400 tabular-nums">
                {formatCurrency(baseline.totalInterest ?? 0, currency)} total interest
              </p>
            </>
          )}
        </div>

        {/* With extra */}
        <div
          className={cn(
            'flex flex-col rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm shadow-black/[0.03] dark:border-emerald-900 dark:bg-emerald-950/30 sm:p-5'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold">
              {extra > 0 ? `With ${formatCurrency(extra, currency)}/mo extra` : 'With an extra payment'}
            </h2>
            {extra > 0 ? (
              <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Recommended
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300/80">
            Rolling the same extra into your payoff order each month.
          </p>
          <p className="mt-4 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatDuration(withExtra.months)}
          </p>
          {extra <= 0 ? (
            <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300/90">
              Add an extra monthly payment above to see your savings.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-300 tabular-nums">
                {interestSaved !== null
                  ? `${formatCurrency(interestSaved, currency)} saved`
                  : '— saved'}
              </p>
              {monthsSaved !== null && monthsSaved > 0 ? (
                <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300/80 tabular-nums">
                  {monthsSaved} {monthsSaved === 1 ? 'month' : 'months'} sooner
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Footnotes */}
      <Callout variant="info" className="border-dashed text-muted-foreground">
        Projections assume fixed balances and rates with equal monthly payments. Rates are
        read as an annual percentage (APR) and converted to a monthly rate; debts marked
        with a monthly rate period are used as-is. This is a planning estimate, not
        financial advice.
      </Callout>
    </main>
    </LocalizedClientBoundary>
  )
}
