import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/supabase/request'
import { defaultPrivacyScope, type PrivacyScope } from './scope'

export type RequestPrivacyScope = {
  scope: PrivacyScope
  /** The caller's id, for `scopeByOwner` / `scopeByTransaction` ('' signed out). */
  userId: string
}

/**
 * The privacy scope this request reads in `householdId` (HH-2). There is no
 * switch yet (HH-3): it is `all` for a user who owns a private account in the
 * household and `household` for everyone else — the same rows for them, so
 * nothing they see changes.
 *
 * Memoized per request like `getRequestUser`; one indexed head count
 * (`idx_accounts_private_owner`).
 */
export const getPrivacyScope = cache(async (householdId: string): Promise<RequestPrivacyScope> => {
  const user = await getRequestUser()
  if (!user) return { scope: 'household', userId: '' }

  const supabase = await createClient()
  const { count } = await supabase
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .eq('private_owner_id', user.id)
    .is('deleted_at', null)

  return { scope: defaultPrivacyScope((count ?? 0) > 0), userId: user.id }
})
