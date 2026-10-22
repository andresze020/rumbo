/**
 * The URL flag a transaction save lands with.
 *
 * It used to be `created=1` — the same flag Accounts, Payees, Goals, Tags,
 * Categories, Debts and others use for their *own* creations. The "+" is
 * global, so a transaction saved from Accounts landed on
 * `/dashboard/accounts?created=1` and that screen announced "Account
 * created." for a transaction, while the real confirmation only existed on
 * Transactions. A flag of its own cannot be misread.
 *
 * The value is a timestamp, not `1`: two saves in a row land on the same URL
 * otherwise, and the dialog provider (which shows the toast on every screen)
 * needs to tell one landing from the next.
 */
export const TRANSACTION_CREATED_PARAM = 'txn_created'

export function transactionCreatedValue(now: number = Date.now()): string {
  return String(now)
}
