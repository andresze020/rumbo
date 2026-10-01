/**
 * Which empty state the Transactions list shows when a query returns nothing
 * (MQ-003).
 *
 * The copy used to hinge on whether the URL *named* a period: the same empty
 * October read "No transactions yet" on a bare `/dashboard/transactions` and
 * "No transactions found for these filters" on `?month=2026-10`, and its
 * button swapped between "Add transaction" and "Clear filters" with it. Any
 * re-render that changed only the URL's shape — a scope restore, a cached
 * render of the bare URL — flipped the card under the user's finger, and a
 * household with years of history was told it had none.
 *
 * So the decision is made from what is true about the data and the view, never
 * from how the URL happens to spell it:
 *
 * - `household-empty` — the household has never recorded a transaction. The
 *   only case that may say "yet".
 * - `caught-up` — the review queue is what is narrowed, and it is clear.
 * - `search` — a search term matched nothing.
 * - `filters` — a sheet filter (type, status, account, category, payee, tag)
 *   is narrowing the view; clearing them is the useful next step.
 * - `period` — nothing but the period is narrowing it: the household has
 *   history, just none in this window.
 */
export type TransactionsEmptyState =
  | 'household-empty'
  | 'caught-up'
  | 'search'
  | 'filters'
  | 'period'

export function transactionsEmptyState(input: {
  householdHasTransactions: boolean
  reviewUnreviewed: boolean
  hasSearch: boolean
  hasGeneralFilters: boolean
}): TransactionsEmptyState {
  if (!input.householdHasTransactions) return 'household-empty'
  if (input.reviewUnreviewed) return 'caught-up'
  if (input.hasSearch) return 'search'
  if (input.hasGeneralFilters) return 'filters'
  return 'period'
}
