'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/households/server'

/**
 * Switch which of the user's households the app is showing.
 *
 * This changes a *profile preference* (`profiles.default_household_id`), not
 * any household rule: the membership check below only re-states what RLS
 * already enforces, so a household the user is not an active member of cannot
 * be selected even if its id is posted by hand. Nothing about the households
 * themselves, their data or their policies is touched.
 */
export async function switchHouseholdAction(formData: FormData) {
  const householdId = String(formData.get('household_id') ?? '').trim()
  const returnTo = String(formData.get('return_to') ?? '/dashboard')
  // Only ever back into this app, never to an absolute URL a form could carry.
  const safeReturnTo = returnTo.startsWith('/') ? returnTo : '/dashboard'

  if (!householdId) redirect(safeReturnTo)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .eq('household_id', householdId)
    .eq('status', 'active')
    .maybeSingle()

  if (!membership) redirect(safeReturnTo)

  await supabase
    .from('profiles')
    .update({ default_household_id: householdId })
    .eq('id', user.id)

  // Every screen is household-scoped, so none of the cached ones survive this.
  revalidatePath('/dashboard', 'layout')
  redirect(safeReturnTo)
}

/**
 * MEM-7: move a user whose default household is no longer one of their active
 * memberships to another membership, or to onboarding when none is left —
 * without an error page and without naming the household they left.
 *
 * Detection is `getHouseholdContext` (read-only); this is the one write.
 * Called from /onboarding, where the dashboard layout and its pages all send a
 * stale default. A compare-and-swap on the stale id: if the default changed
 * since it was read (a switch, an invitation accepted elsewhere), nothing is
 * overwritten and the next request simply reads the new value.
 *
 * A failed write throws instead of redirecting, so the caller can fall back to
 * the page it is on rather than bouncing between /dashboard and /onboarding.
 */
export async function recoverActiveHouseholdAction() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { currentId, staleId } = await getHouseholdContext()

  if (staleId) {
    const { error } = await supabase
      .from('profiles')
      .update({ default_household_id: currentId })
      .eq('id', user.id)
      .eq('default_household_id', staleId)
    if (error) throw new Error('Could not switch household')
  }

  // Every screen was rendered for the household being left.
  revalidatePath('/', 'layout')
  redirect(currentId ? '/dashboard' : '/onboarding')
}
