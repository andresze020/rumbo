import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { DailyAmounts } from './spending-pace'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type Row = {
  allocation_type: 'income' | 'expense'
  amount_base_currency: number | string
  transactions: { transaction_date: string }
  categories: {
    parent: { exclude_from_reports: boolean; deleted_at: string | null } | null
  }
}

const PAGE = 1000

/**
 * Base-currency income and expense per day between `from` and `to`
 * (inclusive): the spending-pace chart reads the expenses, and the Cash flow
 * deltas compare month-to-date against the same day of the previous month
 * (MQ-005).
 *
 * Mirrors `get_monthly_dashboard_summary`'s income and expense totals row for
 * row, so a month's days add up to the "Income" and "Spent" figures:
 * - income and expense allocations (`transaction_allocations`, the reporting
 *   layer). A transfer's principal has none, so it never counts; a transfer
 *   with an FX cost carries an expense allocation for that cost only, which
 *   the RPC counts too;
 * - posted, not soft-deleted transactions, by `transaction_date`;
 * - the category is not deleted and not `exclude_from_reports`, and neither
 *   is its live parent (a deleted parent does not exclude, as in the RPC's
 *   left join).
 *
 * Read-only, under the user's session (RLS applies).
 */
export async function getDailyCashFlow(
  supabase: SupabaseServerClient,
  householdId: string,
  from: string,
  to: string
): Promise<{ income: DailyAmounts; expenses: DailyAmounts; error: boolean }> {
  const income: DailyAmounts = new Map()
  const expenses: DailyAmounts = new Map()
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('transaction_allocations')
      .select(
        'allocation_type, amount_base_currency, transactions!inner(transaction_date), categories!inner(parent:parent_category_id(exclude_from_reports, deleted_at))'
      )
      .eq('household_id', householdId)
      .in('allocation_type', ['income', 'expense'])
      .eq('transactions.household_id', householdId)
      .eq('transactions.status', 'posted')
      .is('transactions.deleted_at', null)
      .gte('transactions.transaction_date', from)
      .lte('transactions.transaction_date', to)
      .is('categories.deleted_at', null)
      .eq('categories.exclude_from_reports', false)
      .order('id')
      .range(offset, offset + PAGE - 1)
    if (error) return { income: new Map(), expenses: new Map(), error: true }

    const rows = (data ?? []) as unknown as Row[]
    for (const row of rows) {
      const parent = row.categories.parent
      if (parent && parent.deleted_at === null && parent.exclude_from_reports) continue
      const date = row.transactions.transaction_date
      const amounts = row.allocation_type === 'income' ? income : expenses
      amounts.set(date, (amounts.get(date) ?? 0) + Number(row.amount_base_currency))
    }
    if (rows.length < PAGE) break
  }
  return { income, expenses, error: false }
}
