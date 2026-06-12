'use server'

import { cookies } from 'next/headers'
import { ACCOUNTS_VIEW_COOKIE, isAccountsView } from './server'

export async function setAccountsViewAction(view: string) {
  if (!isAccountsView(view)) return

  const store = await cookies()
  store.set(ACCOUNTS_VIEW_COOKIE, view, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
}
