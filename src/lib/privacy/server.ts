import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/supabase/request'
import { getUiPreferences } from '@/lib/preferences/server'
import { resolvePrivacyScope, type PrivacyScope } from './scope'

export type RequestPrivacyScope = {
  scope: PrivacyScope
  /** The caller's id, for `scopeByOwner` / `scopeByTransaction` ('' signed out). */
  userId: string
  /** Whether the caller owns a private account here — the switch shows only then (SCP-1). */
  ownsPrivateAccount: boolean
}

/**
 * The ids of the caller's own private accounts in `householdId`, archived ones
 * included (deleted ones not). RLS hides every other member's private account,
 * so "private and visible" is exactly "mine". Drives the lock marker (PRV-2)
 * wherever an account is listed by id, and the ownership test below.
 *
 * Memoized per request; one indexed read (`idx_accounts_private_owner`).
 */
export const getOwnPrivateAccountIds = cache(async (householdId: string): Promise<Set<string>> => {
  const user = await getRequestUser()
  if (!user) return new Set()

  const supabase = await createClient()
  const { data } = await supabase
    .from('accounts')
    .select('id')
    .eq('household_id', householdId)
    .eq('private_owner_id', user.id)
    .is('deleted_at', null)

  return new Set(((data ?? []) as { id: string }[]).map((row) => row.id))
})

/**
 * The privacy scope this request reads in `householdId`: the one the user last
 * picked in the app bar (SCP-5, default everything) while they own a private
 * account here, household for everyone else — the same rows for them, so
 * nothing they see changes (SCP-6).
 *
 * Memoized per request like `getRequestUser`.
 */
export const getPrivacyScope = cache(async (householdId: string): Promise<RequestPrivacyScope> => {
  const user = await getRequestUser()
  if (!user) return { scope: 'household', userId: '', ownsPrivateAccount: false }

  const [privateIds, preferences] = await Promise.all([
    getOwnPrivateAccountIds(householdId),
    getUiPreferences(),
  ])
  const ownsPrivateAccount = privateIds.size > 0

  return {
    scope: resolvePrivacyScope(ownsPrivateAccount, preferences.privacyScope),
    userId: user.id,
    ownsPrivateAccount,
  }
})
