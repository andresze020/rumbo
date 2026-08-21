import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Calendar months of household tenure after which "Getting started" retires and
 * the recurring monthly routine takes over.
 *
 * A household in its first two months is still learning the basics, so "record
 * a transaction" is a useful nudge. From the third month on that same nudge is
 * noise — by then the user either knows how, or looks it up in /dashboard/help.
 * What stays useful forever is the month-by-month rhythm (close last month →
 * budget this one → post what's due → review), the same way a budget is useful
 * every single month rather than once.
 */
const ROUTINE_TENURE_MONTHS = 2

export type ChecklistPhase = 'onboarding' | 'routine'

export type ChecklistTaskId =
  | 'addAccount'
  | 'addTransaction'
  | 'firstBudget'
  | 'closePreviousMonth'
  | 'budget'
  | 'recurring'
  | 'review'
  | 'closeMonth'

/**
 * Every row resolves to something that *performs* the task, never to a screen
 * where the task could be started. `link` deep-links with the relevant form
 * already open, `addTransaction` opens the global dialog in place, and
 * `copyPreviousBudget` posts a server action straight from the card.
 */
export type ChecklistAction =
  | { kind: 'link'; href: string }
  | { kind: 'addTransaction' }
  | { kind: 'copyPreviousBudget'; month: string }

export type ChecklistTask = {
  id: ChecklistTaskId
  done: boolean
  /** How many items are waiting, for the rows that count things. */
  count?: number
  action: ChecklistAction
}

export type HomeChecklist = {
  phase: ChecklistPhase
  /** The month the routine rows are about, `YYYY-MM`. */
  month: string
  /** Previous month, so the card can label the "close last month" row. */
  previousMonth: string
  tasks: ChecklistTask[]
  doneCount: number
  total: number
}

export type HomeChecklistInput = {
  supabase: SupabaseServerClient
  householdId: string
  /** `households.created_at` — drives the onboarding → routine handover. */
  householdCreatedAt: string | null
  /** Month currently shown by the Control center, `YYYY-MM`. */
  month: string
  hasAccounts: boolean
  hasTransactions: boolean
  hasBudget: boolean
  /** Whether the month before `month` has any income or expense worth closing. */
  previousMonthHasActivity: boolean
}

// ── Month helpers (local: this module must not drag in the analysis layer) ───

function currentMonth(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

function todayIso(): string {
  const today = new Date()
  return `${currentMonth()}-${String(today.getDate()).padStart(2, '0')}`
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthStartDate(month: string): string {
  return `${month}-01`
}

function monthEndDate(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
}

function monthsBetween(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split('-').map(Number)
  const [toYear, toMonth] = to.split('-').map(Number)
  return (toYear - fromYear) * 12 + (toMonth - fromMonth)
}

// ── Phase ────────────────────────────────────────────────────────────────────

function resolvePhase({
  householdCreatedAt,
  hasAccounts,
  hasTransactions,
}: Pick<HomeChecklistInput, 'householdCreatedAt' | 'hasAccounts' | 'hasTransactions'>): ChecklistPhase {
  // A household that never got off the ground stays in onboarding however old
  // the row is: a monthly routine is meaningless without an account or a single
  // movement to run it against.
  if (!hasAccounts || !hasTransactions) return 'onboarding'
  if (!householdCreatedAt) return 'routine'
  const tenure = monthsBetween(householdCreatedAt.slice(0, 7), currentMonth())
  return tenure >= ROUTINE_TENURE_MONTHS ? 'routine' : 'onboarding'
}

// ── Task builders ────────────────────────────────────────────────────────────

function onboardingTasks({
  month,
  hasAccounts,
  hasTransactions,
  hasBudget,
}: Pick<HomeChecklistInput, 'month' | 'hasAccounts' | 'hasTransactions' | 'hasBudget'>): ChecklistTask[] {
  return [
    {
      id: 'addAccount',
      done: hasAccounts,
      action: { kind: 'link', href: '/dashboard/accounts?mode=create' },
    },
    {
      id: 'addTransaction',
      done: hasTransactions,
      action: { kind: 'addTransaction' },
    },
    {
      id: 'firstBudget',
      done: hasBudget,
      action: { kind: 'link', href: `/dashboard/budgets?month=${month}&mode=addLine` },
    },
  ]
}

async function routineTasks({
  supabase,
  householdId,
  month,
  hasBudget,
  previousMonthHasActivity,
}: Omit<HomeChecklistInput, 'householdCreatedAt' | 'hasAccounts' | 'hasTransactions'>): Promise<ChecklistTask[]> {
  const thisMonth = currentMonth()
  const previousMonth = shiftMonth(month, -1)
  const isCurrentMonth = month === thisMonth
  const isFinishedMonth = month < thisMonth
  const today = todayIso()

  const [
    { data: closureRows },
    { count: dueRecurringCount },
    { count: unreviewedCount },
    { count: reviewedEverCount },
  ] = await Promise.all([
    supabase
      .from('month_closures')
      .select('closure_month')
      .eq('household_id', householdId)
      .in('closure_month', [monthStartDate(previousMonth), monthStartDate(month)]),
    // "Due" is relative to today, not to the browsed month: an overdue template
    // is overdue whichever month you happen to be looking at.
    supabase
      .from('recurring_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .eq('is_active', true)
      .not('next_run_date', 'is', null)
      .lte('next_run_date', today),
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .eq('review_status', 'unreviewed')
      .neq('transaction_type', 'opening_balance')
      .neq('status', 'voided')
      .is('deleted_at', null)
      .gte('transaction_date', monthStartDate(month))
      .lte('transaction_date', monthEndDate(month)),
    // Transactions land as `unreviewed` by default, so an untouched household
    // would show a permanent "N to review" nag. Only households that actually
    // work the review queue get the row.
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .neq('review_status', 'unreviewed')
      .is('deleted_at', null),
  ])

  const closedMonths = new Set(
    ((closureRows ?? []) as { closure_month: string }[]).map((row) => row.closure_month.slice(0, 7))
  )

  const tasks: ChecklistTask[] = []

  // Closing last month is the ritual people forget, so it leads — but only while
  // standing in the current month, where "last month" means what it says.
  if (isCurrentMonth && previousMonthHasActivity) {
    tasks.push({
      id: 'closePreviousMonth',
      done: closedMonths.has(previousMonth),
      action: {
        kind: 'link',
        href: `/dashboard/month-review?month=${previousMonth}#close-month`,
      },
    })
  }

  tasks.push({
    id: 'budget',
    done: hasBudget,
    action:
      !hasBudget && (await hasBudgetLines(supabase, householdId, previousMonth))
        ? { kind: 'copyPreviousBudget', month }
        : { kind: 'link', href: `/dashboard/budgets?month=${month}&mode=addLine` },
  })

  // Rows that only exist while there is something to do: showing "0 due" every
  // month would train the user to ignore the card.
  if (isCurrentMonth && (dueRecurringCount ?? 0) > 0) {
    tasks.push({
      id: 'recurring',
      done: false,
      count: dueRecurringCount ?? 0,
      action: { kind: 'link', href: '/dashboard/recurring' },
    })
  }

  if ((reviewedEverCount ?? 0) > 0 && (unreviewedCount ?? 0) > 0) {
    tasks.push({
      id: 'review',
      done: false,
      count: unreviewedCount ?? 0,
      action: {
        kind: 'link',
        href: `/dashboard/transactions?month=${month}&review=unreviewed`,
      },
    })
  }

  if (isFinishedMonth) {
    tasks.push({
      id: 'closeMonth',
      done: closedMonths.has(month),
      action: { kind: 'link', href: `/dashboard/month-review?month=${month}#close-month` },
    })
  }

  return tasks
}

/** Whether `month` has a budget with at least one planned line, for "copy last month". */
async function hasBudgetLines(
  supabase: SupabaseServerClient,
  householdId: string,
  month: string
): Promise<boolean> {
  const { data } = await supabase.rpc('get_monthly_budget_details', {
    p_household_id: householdId,
    p_budget_month: monthStartDate(month),
  })
  return ((data ?? []) as { line_id: string | null; planned_amount: number | string | null }[]).some(
    (row) => row.line_id !== null && Number(row.planned_amount ?? 0) > 0
  )
}

/**
 * Builds the Control center checklist for the signed-in household, or `null`
 * when there is nothing worth nudging about — an onboarding that is finished,
 * or a month whose routine is already done.
 */
export async function getHomeChecklist(input: HomeChecklistInput): Promise<HomeChecklist | null> {
  const phase = resolvePhase(input)

  const tasks =
    phase === 'onboarding' ? onboardingTasks(input) : await routineTasks(input)

  const doneCount = tasks.filter((task) => task.done).length
  if (!tasks.length || doneCount === tasks.length) return null

  return {
    phase,
    month: input.month,
    previousMonth: shiftMonth(input.month, -1),
    tasks,
    doneCount,
    total: tasks.length,
  }
}
