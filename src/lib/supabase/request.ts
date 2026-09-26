import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Per-request memoized identity lookups.
 *
 * One dashboard render used to ask Supabase "who is this?" five times and
 * read the same `profiles` row four times: the layout, the UI preferences, the
 * household switcher, the page and the net-worth trend each did their own
 * (measured 2026-09-25 with RUMBO_PERF=1, ~50 ms per round trip). React's
 * `cache()` makes every caller in the same server request share one answer.
 *
 * Scope is one request: nothing here is shared between users or requests, and
 * the queries still run under the caller's session, so RLS is unchanged. A
 * Server Action gets its own request, so it re-reads (after a write, a stale
 * value is never reused).
 */
export const getRequestUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

export type RequestProfile = {
  default_household_id: string | null
  display_name: string | null
  ui_preferences: unknown
}

/** The signed-in user's profile row (the columns the dashboard chrome needs). */
export const getRequestProfile = cache(async (): Promise<RequestProfile | null> => {
  const user = await getRequestUser()
  if (!user) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('default_household_id, display_name, ui_preferences')
    .eq('id', user.id)
    .maybeSingle()
  if (error || !data) return null
  return data as RequestProfile
})
