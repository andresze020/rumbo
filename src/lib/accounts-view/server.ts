import { cookies } from 'next/headers'

export const ACCOUNTS_VIEW_COOKIE = 'af_accounts_view'

export type AccountsView = 'list' | 'group'

export const DEFAULT_ACCOUNTS_VIEW: AccountsView = 'group'

export function isAccountsView(value: string): value is AccountsView {
  return value === 'list' || value === 'group'
}

export async function getAccountsView(): Promise<AccountsView> {
  const store = await cookies()
  const value = store.get(ACCOUNTS_VIEW_COOKIE)?.value
  return value && isAccountsView(value) ? value : DEFAULT_ACCOUNTS_VIEW
}
