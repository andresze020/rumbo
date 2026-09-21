/**
 * RUM-006 — grouping rows from `get_account_balances_as_of_many` by date.
 *
 * The RPC returns one row per (as_of_date, account); every call site needs the
 * same reshape into "rows for this one date" before it can reuse the logic
 * written for the single-date RPC. Pulled out once so Dashboard, Net worth and
 * Accounts don't each carry their own copy of the same loop, and so the shape
 * is covered by a unit test instead of only by three copies of manual review.
 */

export type DatedRow = { as_of_date: string }

/**
 * Splits a flat list of dated rows into one array per distinct `as_of_date`,
 * preserving each date's row order. A date present in `dates` but absent from
 * `rows` simply has no entry in the returned map — callers read a missing key
 * as "no rows for that date" (`?? []`), which for this RPC means the
 * household has no accounts, not that the date was skipped: every account
 * gets an explicit zero-balance row for every requested date, even one before
 * its first transaction.
 */
export function groupByAsOfDate<T extends DatedRow>(rows: T[]): Map<string, T[]> {
  const byDate = new Map<string, T[]>()
  for (const row of rows) {
    const bucket = byDate.get(row.as_of_date)
    if (bucket) bucket.push(row)
    else byDate.set(row.as_of_date, [row])
  }
  return byDate
}
