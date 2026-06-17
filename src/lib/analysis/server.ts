import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Shared server-side data helpers for the analysis & planning screens
 * (Reports, Trends, Cash flow, Month review, Debt planner).
 *
 * Everything here reads from the existing ledger via the same RPCs the
 * dashboard uses — no new tables, no migrations. Reporting figures come from
 * `transaction_allocations`/monthly summaries and balances are derived from
 * `transaction_entries`, per the project's ledger rules.
 */

export type HouseholdContext = {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  household: { id: string; name: string; base_currency: string }
  displayName: string | null
}

/** Resolves the signed-in user's default household or redirects to login/onboarding. */
export async function getHousehold(): Promise<HouseholdContext> {
  const supabase = await createClient()
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

  const { data: household } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()
  if (!household) redirect('/onboarding')

  return {
    supabase,
    userId: user.id,
    household: household as HouseholdContext['household'],
    displayName: (profile.display_name as string | null) ?? null,
  }
}

// ── Month utilities ─────────────────────────────────────────────────────────

/** Current month as `YYYY-MM`. */
export function currentMonthParam(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

/** Validates a `?month=YYYY-MM` param, falling back to the current month. */
export function parseMonthParam(month: string | undefined): string {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return currentMonthParam()
  const parsed = new Date(`${month}-01T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return currentMonthParam()
  return month
}

/** Shifts a `YYYY-MM` by `delta` months (negative = past). */
export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(year, mon - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** The last `n` months ending at (and including) `month`, oldest first. */
export function lastNMonths(month: string, n: number): string[] {
  const months: string[] = []
  for (let i = n - 1; i >= 0; i--) months.push(shiftMonth(month, -i))
  return months
}

/** First-of-month date string for an RPC param, e.g. `2026-06` -> `2026-06-01`. */
export function monthStartDate(month: string): string {
  return `${month}-01`
}

/** Last calendar day of a month as an ISO date, e.g. `2026-06` -> `2026-06-30`. */
export function monthEndDate(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  return new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10)
}

const SHORT_FMT = new Intl.DateTimeFormat('en-CA', { month: 'short' })
const LONG_FMT = new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric' })

/** `2026-06` -> `Jun`. */
export function shortMonthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  return SHORT_FMT.format(new Date(year, mon - 1, 1))
}

/** `2026-06` -> `June 2026`. */
export function longMonthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  return LONG_FMT.format(new Date(year, mon - 1, 1))
}

// ── Monthly summary series ───────────────────────────────────────────────────

export type MonthlyPoint = {
  month: string
  label: string
  income: number
  expenses: number
  savings: number
  savingsRate: number | null
}

type MonthlyDashboardSummaryRow = {
  base_currency: string
  monthly_income: number | string
  monthly_expenses: number | string
  monthly_savings: number | string
  savings_rate: number | string | null
  income_transaction_count: number | string
  expense_transaction_count: number | string
}

/**
 * Income / expenses / savings / savings-rate for each of `months`, in base
 * currency. One `get_monthly_dashboard_summary` call per month, run together.
 */
export async function getMonthlySeries(
  ctx: HouseholdContext,
  months: string[]
): Promise<MonthlyPoint[]> {
  const results = await Promise.all(
    months.map((m) =>
      ctx.supabase.rpc('get_monthly_dashboard_summary', {
        p_household_id: ctx.household.id,
        p_month: monthStartDate(m),
      })
    )
  )

  return results.map((res, i) => {
    const row = ((res.data ?? [])[0] as MonthlyDashboardSummaryRow | undefined) ?? null
    return {
      month: months[i],
      label: shortMonthLabel(months[i]),
      income: Number(row?.monthly_income ?? 0),
      expenses: Number(row?.monthly_expenses ?? 0),
      savings: Number(row?.monthly_savings ?? 0),
      savingsRate: row?.savings_rate == null ? null : Number(row.savings_rate),
    }
  })
}

// ── Category breakdown ───────────────────────────────────────────────────────

type CategoryLookup = {
  id: string
  name: string
  parent_category_id: string | null
  is_archived: boolean
}

export type CategorySlice = {
  categoryId: string
  name: string
  value: number
  count: number
}

type MonthlyExpenseCategoryRow = {
  category_id: string
  category_name: string
  parent_category_id: string | null
  amount_base_currency: number | string
  transaction_count: number | string
}

/** Builds an `id -> category` map for resolving "Parent / Child" display names. */
export async function getCategoryLookup(
  ctx: HouseholdContext
): Promise<Map<string, CategoryLookup>> {
  const { data } = await ctx.supabase
    .from('categories')
    .select('id, name, parent_category_id, is_archived')
    .eq('household_id', ctx.household.id)
    .is('deleted_at', null)
  return new Map(((data ?? []) as CategoryLookup[]).map((c) => [c.id, c]))
}

function categoryPath(
  row: { category_id: string; category_name: string; parent_category_id: string | null },
  byId: Map<string, CategoryLookup>
): string {
  const self = byId.get(row.category_id)
  const parentId = self?.parent_category_id ?? row.parent_category_id
  const parentName = parentId ? byId.get(parentId)?.name : null
  const name = self?.name ?? row.category_name
  return parentName ? `${parentName} / ${name}` : name
}

/** Posted expense allocations for a month, by category, sorted high → low. */
export async function getExpenseCategories(
  ctx: HouseholdContext,
  month: string,
  byId: Map<string, CategoryLookup>
): Promise<CategorySlice[]> {
  const { data } = await ctx.supabase.rpc('get_monthly_expenses_by_category', {
    p_household_id: ctx.household.id,
    p_month: monthStartDate(month),
  })
  return ((data ?? []) as MonthlyExpenseCategoryRow[])
    .map((row) => ({
      categoryId: row.category_id,
      name: categoryPath(row, byId),
      value: Number(row.amount_base_currency),
      count: Number(row.transaction_count),
    }))
    .sort((a, b) => b.value - a.value)
}

// ── Merchant breakdown ───────────────────────────────────────────────────────

export type MerchantSlice = {
  name: string
  value: number
  count: number
}

type TxRow = { id: string; merchant_name: string | null }
type EntryRow = { transaction_id: string; amount_base_currency: number | string }

/**
 * Top merchants by posted expense spend for a month, in base currency.
 * Expense outflows are stored as negative entry amounts, so we sum the
 * absolute value of negative `amount_base_currency` per merchant.
 */
export async function getTopMerchants(
  ctx: HouseholdContext,
  month: string,
  limit = 8
): Promise<MerchantSlice[]> {
  const start = monthStartDate(month)
  const end = monthEndDate(month)
  const { data: txRows } = await ctx.supabase
    .from('transactions')
    .select('id, merchant_name')
    .eq('household_id', ctx.household.id)
    .eq('transaction_type', 'expense')
    .neq('status', 'voided')
    .is('deleted_at', null)
    .gte('transaction_date', start)
    .lte('transaction_date', end)

  const txs = (txRows ?? []) as TxRow[]
  if (txs.length === 0) return []
  const merchantByTx = new Map(txs.map((t) => [t.id, t.merchant_name?.trim() || 'Uncategorized']))

  const { data: entryRows } = await ctx.supabase
    .from('transaction_entries')
    .select('transaction_id, amount_base_currency')
    .eq('household_id', ctx.household.id)
    .in(
      'transaction_id',
      txs.map((t) => t.id)
    )

  const totals = new Map<string, { value: number; count: number }>()
  for (const entry of (entryRows ?? []) as EntryRow[]) {
    const amount = Number(entry.amount_base_currency)
    if (amount >= 0) continue
    const merchant = merchantByTx.get(entry.transaction_id)
    if (!merchant) continue
    const current = totals.get(merchant) ?? { value: 0, count: 0 }
    current.value += Math.abs(amount)
    current.count += 1
    totals.set(merchant, current)
  }

  return [...totals.entries()]
    .map(([name, agg]) => ({ name, value: agg.value, count: agg.count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

// ── Budget details ───────────────────────────────────────────────────────────

export type BudgetLine = {
  lineId: string
  categoryId: string | null
  name: string
  planned: number
  actual: number
}

type BudgetDetailRow = {
  currency_code: string
  line_id: string | null
  category_id: string | null
  category_name: string | null
  planned_amount: number | string | null
  actual_amount: number | string | null
}

/** Budget lines (planned vs actual) for a month, plus the budget's currency. */
export async function getBudgetLines(
  ctx: HouseholdContext,
  month: string
): Promise<{ lines: BudgetLine[]; currency: string }> {
  const { data } = await ctx.supabase.rpc('get_monthly_budget_details', {
    p_household_id: ctx.household.id,
    p_budget_month: monthStartDate(month),
  })
  const rows = (data ?? []) as BudgetDetailRow[]
  const lines = rows
    .filter((r) => r.line_id !== null)
    .map((r) => ({
      lineId: r.line_id as string,
      categoryId: r.category_id,
      name: r.category_name ?? '—',
      planned: Number(r.planned_amount ?? 0),
      actual: Number(r.actual_amount ?? 0),
    }))
  return { lines, currency: rows[0]?.currency_code ?? ctx.household.base_currency }
}

// ── Shared chart palette ─────────────────────────────────────────────────────

/** Calm fintech palette aligned with the dashboard donut/budget colors. */
export const SERIES_PALETTE = [
  'oklch(0.62 0.19 255)', // blue
  'oklch(0.70 0.15 165)', // teal
  'oklch(0.72 0.17 70)', // amber
  'oklch(0.65 0.20 25)', // rose
  'oklch(0.62 0.18 300)', // violet
  'oklch(0.68 0.14 145)', // green
  'oklch(0.60 0.02 260)', // slate (Other)
] as const

export const POSITIVE_COLOR = 'oklch(0.70 0.15 165)'
export const NEGATIVE_COLOR = 'oklch(0.65 0.20 25)'
export const ACCENT_COLOR = 'oklch(0.62 0.19 255)'
