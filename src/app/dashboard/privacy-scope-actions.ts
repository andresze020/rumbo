'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isPrivacyScope } from '@/lib/privacy/scope'

/**
 * HH-3 (SCP-1, SCP-5): remember the Household / Mine / Everything scope the
 * user picked in the app bar.
 *
 * A *profile preference*, like `switchHouseholdAction`: it changes which of
 * the rows RLS already allows each screen shows, never what is allowed. Stored
 * per user (`profiles.ui_preferences.privacyScope`), merged into the existing
 * preferences so nothing else in them is touched.
 */
export async function setPrivacyScopeAction(formData: FormData) {
  const scope = formData.get('scope')
  const returnTo = String(formData.get('return_to') ?? '/dashboard')
  // Only ever back into this app, never to an absolute URL a form could carry.
  const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard'

  if (!isPrivacyScope(scope)) redirect(safeReturnTo)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('ui_preferences')
    .eq('id', user.id)
    .maybeSingle()
  const current =
    profile?.ui_preferences && typeof profile.ui_preferences === 'object' && !Array.isArray(profile.ui_preferences)
      ? (profile.ui_preferences as Record<string, unknown>)
      : {}

  await supabase
    .from('profiles')
    .update({ ui_preferences: { ...current, privacyScope: scope } })
    .eq('id', user.id)

  // Every scoped screen reads it, so none of the cached ones survive this.
  revalidatePath('/dashboard', 'layout')
  redirect(safeReturnTo)
}
