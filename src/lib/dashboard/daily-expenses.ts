import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { DailyAmounts } from './spending-pace'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type Row = {
  amount_base_currency: number | string
  transactions: { transaction_date: string }
  categories: {
    parent: { exclude_from_reports: boolean; deleted_at: string | null } | null
  }
}

const PAGE = 1000

/**
 * Base-currency expense per day between `from` and `to` (inclusive), for the
 * Dashboard's spending-pace chart.
 *
 * Mirrors `get_monthly_dashboard_summary`'s expense total row for row, so a
 * month's days add up to the "Spent" figure next to the chart:
 * - expense allocations (`transaction_allocations`, the reporting layer);
 * - posted, not soft-deleted transactions, by `transaction_date`;
 * - the category is not deleted and not `exclude_from_reports`, and neither
 *   is its live parent (a deleted parent does not exclude, as in the RPC's
 *   left join).
 *
 * Read-only, under the user's session (RLS applies).
 */
export async function getDailyExpenses(
  supabase: SupabaseServerClient,
  householdId: string,
  from: string,
  to: string
): Promise<{ amounts: DailyAmounts; error: boolean }> {
  const amounts: DailyAmounts = new Map()
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('transaction_allocations')
      .select(
        'amount_base_currency, transactions!inner(transaction_date), categories!inner(parent:parent_category_id(exclude_from_reports, deleted_at))'
      )
      .eq('household_id', householdId)
      .eq('allocation_type', 'expense')
      .eq('transactions.household_id', householdId)
      .eq('transactions.status', 'posted')
      .is('transactions.deleted_at', null)
      .gte('transactions.transaction_date', from)
      .lte('transactions.transaction_date', to)
      .is('categories.deleted_at', null)
      .eq('categories.exclude_from_reports', false)
      .order('id')
      .range(offset, offset + PAGE - 1)
    if (error) return { amounts: new Map(), error: true }

    const rows = (data ?? []) as unknown as Row[]
    for (const row of rows) {
      const parent = row.categories.parent
      if (parent && parent.deleted_at === null && parent.exclude_from_reports) continue
      const date = row.transactions.transaction_date
      amounts.set(date, (amounts.get(date) ?? 0) + Number(row.amount_base_currency))
    }
    if (rows.length < PAGE) break
  }
  return { amounts, error: false }
}
