import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  CalendarClock,
  ChevronRight,
  PiggyBank,
  Scale,
  Target,
} from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { SectionHeading } from '@/components/section-heading'
import { Callout } from '@/components/callout'
import { EmptyState } from '@/components/empty-state'
import { createClient } from '@/lib/supabase/server'
import { getLocale } from '@/lib/i18n/server'
import { translate } from '@/lib/i18n/translate'
import { cn } from '@/lib/utils'

type BudgetDetailRow = {
  budget_id: string | null
  line_id: string | null
  planned_amount: number | string | null
  actual_amount: number | string | null
}

type Debt = {
  account_id: string
  name: string
  payment_due_day: number | string | null
  status: string
}

type AccountBalance = {
  account_id: string
  posted_balance_base_currency: number | string
}

type Recurring = {
  id: string
  name: string
  amount: number | string
  currency_code: string
  next_run_date: string | null
  is_active: boolean
}

type Goal = {
  id: string
  target_amount: number | string
  current_amount: number | string
  currency_code: string
  status: string
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function currentMonthDate() {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  return `${today.getFullYear()}-${month}-01`
}

function formatCurrency(value: number, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(value)
}

export default async function PlanPage() {
  const locale = await getLocale()
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key)
  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-CA' : locale, {
    month: 'short',
    day: 'numeric',
  })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.default_household_id) redirect('/onboarding')

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()
  if (householdError || !household) redirect('/onboarding')

  const baseCurrency = household.base_currency as string
  const today = todayIsoDate()

  const [
    { data: budgetRows, error: budgetError },
    { data: debts, error: debtsError },
    { data: balances },
    { data: recurring, error: recurringError },
    { data: goals, error: goalsError },
  ] = await Promise.all([
    supabase.rpc('get_monthly_budget_details', {
      p_household_id: household.id,
      p_budget_month: currentMonthDate(),
    }),
    supabase
      .from('debts')
      .select('account_id, name, payment_due_day, status')
      .eq('household_id', household.id)
      .is('deleted_at', null),
    supabase.rpc('get_account_balances', {
      p_household_id: household.id,
      p_as_of_date: today,
    }),
    supabase
      .from('recurring_transactions')
      .select('id, name, amount, currency_code, next_run_date, is_active')
      .eq('household_id', household.id)
      .eq('is_active', true)
      .not('next_run_date', 'is', null)
      .order('next_run_date', { ascending: true })
      .limit(5),
    supabase
      .from('goals')
      .select('id, target_amount, current_amount, currency_code, status')
      .eq('household_id', household.id),
  ])

  // Budgets summary (current month).
  const budgetDetails = (budgetRows ?? []) as BudgetDetailRow[]
  const hasBudget = Boolean(budgetDetails[0]?.budget_id)
  const budgetLines = budgetDetails.filter((row) => row.line_id)
  const totalBudgeted = budgetLines.reduce((sum, l) => sum + Number(l.planned_amount ?? 0), 0)
  const totalSpent = budgetLines.reduce((sum, l) => sum + Number(l.actual_amount ?? 0), 0)
  const remaining = totalBudgeted - totalSpent

  // Debts summary.
  const debtRows = (debts ?? []) as Debt[]
  const accountBalances = (balances ?? []) as AccountBalance[]
  const balancesByAccountId = new Map(accountBalances.map((b) => [b.account_id, b]))
  const activeDebts = debtRows.filter((d) => d.status === 'active')
  const totalDebt = activeDebts.reduce((sum, d) => {
    const bal = balancesByAccountId.get(d.account_id)
    return sum + Math.max(0, -Number(bal?.posted_balance_base_currency ?? 0))
  }, 0)

  // Upcoming payments (recurring).
  const upcoming = (recurring ?? []) as Recurring[]

  // Goals summary (base-currency goals only, to keep the total meaningful).
  const goalRows = (goals ?? []) as Goal[]
  const activeGoals = goalRows.filter((g) => g.status === 'active')
  // Saved total includes active/paused/completed goals (still-held savings),
  // matching the Goals page summary — only archived goals are excluded.
  const totalSaved = goalRows
    .filter((g) => g.status !== 'archived' && g.currency_code === baseCurrency)
    .reduce((sum, g) => sum + Number(g.current_amount), 0)

  const hasLoadError = budgetError || debtsError || recurringError || goalsError

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow={household.name}
        title={t('nav.plan')}
        description={t('mobile.planSubtitle')}
      />

      {hasLoadError ? (
        <Callout variant="error">Could not load all plan data. Try refreshing.</Callout>
      ) : null}

      {/* Module cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Budgets */}
        <Link
          href="/dashboard/budgets"
          className="group flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm shadow-black/[0.03] transition-colors hover:bg-muted/40"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Target className="size-4" aria-hidden="true" />
            </span>
            <span className="font-medium">{t('nav.budgets')}</span>
            <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </div>
          {hasBudget ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label={t('mobile.budgeted')} value={formatCurrency(totalBudgeted, baseCurrency)} />
              <Stat label={t('mobile.spent')} value={formatCurrency(totalSpent, baseCurrency)} />
              <Stat
                label={t('mobile.remaining')}
                value={formatCurrency(remaining, baseCurrency)}
                valueClassName={remaining < 0 ? 'text-rose-600 dark:text-rose-400' : undefined}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('mobile.noBudget')}</p>
          )}
        </Link>

        {/* Debts */}
        <Link
          href="/dashboard/debts"
          className="group flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm shadow-black/[0.03] transition-colors hover:bg-muted/40"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
              <Scale className="size-4" aria-hidden="true" />
            </span>
            <span className="font-medium">{t('nav.debts')}</span>
            <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <Stat label={t('mobile.activeDebts')} value={String(activeDebts.length)} />
            <Stat label={t('mobile.outstanding')} value={formatCurrency(totalDebt, baseCurrency)} />
          </div>
        </Link>

        {/* Goals */}
        <Link
          href="/dashboard/goals"
          className="group flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm shadow-black/[0.03] transition-colors hover:bg-muted/40 sm:col-span-2"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PiggyBank className="size-4" aria-hidden="true" />
            </span>
            <span className="font-medium">{t('nav.goals')}</span>
            <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <Stat label={t('mobile.activeGoals')} value={String(activeGoals.length)} />
            <Stat label={t('mobile.saved')} value={formatCurrency(totalSaved, baseCurrency)} />
          </div>
        </Link>
      </div>

      {/* Upcoming payments */}
      <section className="space-y-3">
        <SectionHeading
          title={t('mobile.upcoming')}
          description={t('mobile.upcomingDesc')}
          action={
            <Link
              href="/dashboard/recurring"
              className="text-sm font-medium text-primary hover:underline"
            >
              {t('common.viewAll')}
            </Link>
          }
        />
        {upcoming.length === 0 ? (
          <EmptyState
            title={t('mobile.upcomingEmpty')}
            description={t('mobile.upcomingDesc')}
            actionHref="/dashboard/recurring"
            actionLabel={t('nav.recurring')}
          />
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
            {upcoming.map((row) => {
              const isDue = Boolean(row.next_run_date && row.next_run_date <= today)
              return (
                <div key={row.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                    <CalendarClock className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    {row.next_run_date ? (
                      <p className={cn('text-xs', isDue ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                        {isDue ? `${t('mobile.due')} · ` : ''}
                        {dateFmt.format(new Date(`${row.next_run_date}T00:00:00`))}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(Number(row.amount), row.currency_code)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

function Stat({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="space-y-0.5">
      <p className={cn('text-sm font-semibold tabular-nums', valueClassName)}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
