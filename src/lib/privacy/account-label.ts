/**
 * HH-3 (PRV-2): the lock beside a private account's name where only text can
 * go — a native <select>, a picker row, a transfer's "From → To" line. JSX
 * lists use `PrivateAccountMarker` instead.
 *
 * Only the owner ever sees one (RLS hides everyone else's private accounts),
 * and the ids come from `getOwnPrivateAccountIds`, which the app layout has
 * already loaded for this request.
 */
export const PRIVATE_ACCOUNT_MARK = '🔒'

export function markPrivateName(name: string, isPrivate: boolean): string {
  return isPrivate ? `${name} ${PRIVATE_ACCOUNT_MARK}` : name
}

/**
 * The same accounts, a private one's display name carrying the lock and its
 * name as stored kept in `storedName`, for anything that compares names.
 */
export function markPrivateAccounts<T extends { id: string; name: string }>(
  accounts: T[],
  privateIds: ReadonlySet<string>
): (T & { storedName?: string })[] {
  if (privateIds.size === 0) return accounts
  return accounts.map((account) =>
    privateIds.has(account.id)
      ? { ...account, name: markPrivateName(account.name, true), storedName: account.name }
      : account
  )
}

/**
 * The name as stored, for comparing what someone typed (or a CSV says)
 * against it. Read from `storedName`, never by trimming the display name: a
 * shared account may really be called "Vault 🔒".
 */
export function storedAccountName(account: { name: string; storedName?: string }): string {
  return account.storedName ?? account.name
}

/** `markPrivateAccounts` for balance RPC rows (`account_id`, `account_name`). */
export function markPrivateBalanceRows<T extends { account_id: string; account_name: string }>(
  rows: T[],
  privateIds: ReadonlySet<string>
): T[] {
  if (privateIds.size === 0) return rows
  return rows.map((row) =>
    privateIds.has(row.account_id) ? { ...row, account_name: markPrivateName(row.account_name, true) } : row
  )
}
