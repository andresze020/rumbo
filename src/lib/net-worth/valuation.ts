/**
 * RUM-002 — the one authoritative net worth valuation.
 *
 * Net worth, Dashboard, and Accounts each carried their own JS reduction over
 * the same `get_account_balances`-family RPC rows — plus a 4th copy in
 * `trend-actions.ts` and narrower debts-only copies in `secondary-widgets.tsx`
 * and `plan/page.tsx`. All of them computed the same formula; nothing
 * stopped them from drifting. This is that formula, once.
 *
 * The invariant, taken from the code as it already ran before this ticket and
 * kept deliberately unchanged: `netWorth = totalAssets + signedLiabilities`.
 * A liability's raw balance is negative when owed and positive when the
 * household is in credit (an overpaid card) — a credit balance correctly
 * *adds* to net worth. `totalLiabilities` below is a display magnitude
 * (`max(0, -balance)`, never negative), not a term in that formula — it is
 * what a "Liabilities" figure on screen means, not what net worth subtracts.
 * A credit balance shows as `0` there, not as a negative liability, and not
 * as a positive one either (see `getDisplayedLiabilityBalance`).
 *
 * Population is deliberately NOT this module's concern. Different callers
 * need different account sets on legitimate grounds — Net worth and
 * Dashboard want only `include_in_net_worth` accounts (`selectNetWorthAccounts`
 * below); Accounts' "Total balance" wants every account currently displayed,
 * `include_in_net_worth` or not, because it answers "what does this screen
 * show", not "what is my net worth" — that is a different question with a
 * different, already differently-labelled answer, not a bug to reconcile
 * away. Archived accounts are excluded upstream, in SQL
 * (`get_account_balances_as_of_many`'s `p_include_archived` default), before
 * any row reaches this module.
 *
 * Currency is also not this module's concern: every row it reads is already
 * in base currency, converted server-side by the RPC's own FX revaluation
 * (`supabase/migrations/20260817120000_balance_fx_revaluation.sql` — stocks
 * revalue at the as-of-date rate, falling back to the historical per-entry
 * sum only when the household has no rate on file for that pair). This
 * module sums numbers; it does not convert them.
 */

export type ValuationAccountRow = {
  account_class: string
  posted_balance_base_currency: number | string
  projected_balance_base_currency: number | string
}

export type ValuationSummary = {
  totalAssets: number
  /** Display magnitude for "Liabilities": max(0, -signed). Not a formula term. */
  totalLiabilities: number
  /** Raw signed sum. Negative = owed. Positive = the household is in credit. */
  signedLiabilities: number
  netWorth: number
  projectedAssets: number
  projectedLiabilities: number
  signedProjectedLiabilities: number
  projectedNetWorth: number
}

/**
 * A liability balance as a display magnitude: how much is owed, never
 * negative. A credit balance (the household is owed money, not the other
 * way around) shows as `0` here — it is not a debt, but it is also not
 * subtracted as a negative debt; it simply isn't debt. It still counts
 * toward `netWorth` via the raw signed sum in `computeValuation`.
 */
export function getDisplayedLiabilityBalance(value: number | string): number {
  return Math.max(0, -Number(value))
}

function sumBy<T extends ValuationAccountRow>(
  rows: T[],
  accountClass: 'asset' | 'liability',
  field: 'posted_balance_base_currency' | 'projected_balance_base_currency'
): number {
  return rows
    .filter((row) => row.account_class === accountClass)
    .reduce((sum, row) => sum + Number(row[field]), 0)
}

/**
 * The shared valuation formula: assets, liabilities (both signed and
 * display-magnitude), and net worth, posted and projected. Takes whatever
 * population the caller already decided on — see the module header for why
 * that decision belongs to the caller, not here.
 */
export function computeValuation(rows: ValuationAccountRow[]): ValuationSummary {
  const totalAssets = sumBy(rows, 'asset', 'posted_balance_base_currency')
  const signedLiabilities = sumBy(rows, 'liability', 'posted_balance_base_currency')
  const totalLiabilities = rows
    .filter((row) => row.account_class === 'liability')
    .reduce((sum, row) => sum + getDisplayedLiabilityBalance(row.posted_balance_base_currency), 0)
  const projectedAssets = sumBy(rows, 'asset', 'projected_balance_base_currency')
  const signedProjectedLiabilities = sumBy(rows, 'liability', 'projected_balance_base_currency')
  const projectedLiabilities = rows
    .filter((row) => row.account_class === 'liability')
    .reduce((sum, row) => sum + getDisplayedLiabilityBalance(row.projected_balance_base_currency), 0)

  return {
    totalAssets,
    totalLiabilities,
    signedLiabilities,
    netWorth: totalAssets + signedLiabilities,
    projectedAssets,
    projectedLiabilities,
    signedProjectedLiabilities,
    projectedNetWorth: projectedAssets + signedProjectedLiabilities,
  }
}

/**
 * The standard net worth population: accounts the household has opted into
 * net worth. Archived accounts are already excluded upstream in SQL, so this
 * is the only filter Net worth and Dashboard need before calling
 * `computeValuation`. Accounts' "Total balance" deliberately does not call
 * this — see the module header.
 */
export function selectNetWorthAccounts<T extends { include_in_net_worth: boolean }>(
  rows: T[]
): T[] {
  return rows.filter((row) => row.include_in_net_worth)
}
