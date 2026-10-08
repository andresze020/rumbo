import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getRequestProfile, getRequestUser } from '@/lib/supabase/request'
import type { HouseholdOption } from '@/components/household-switcher'
import { resolveActiveHousehold } from './active'

export type HouseholdContext = {
  currentId: string | null
  households: HouseholdOption[]
  /**
   * MEM-7: the stored default household was not an active membership and has
   * just been repointed to `currentId` (null: none left). The layout redirects
   * on it, so every read of this request — which may still hold the stale id —
   * is thrown away.
   */
  recovered: boolean
}

const EMPTY: HouseholdContext = { currentId: null, households: [], recovered: false }

/**
 * The households this user can switch between, and which one is active.
 *
 * Read in the dashboard layout so the app bar's household selector is correct
 * on every screen, not just the ones that happen to query a household. Never
 * throws: the chrome losing its label must not take a page down.
 *
 * The membership join is what bounds the list — RLS already restricts it to
 * this user's rows, and nothing here widens that.
 *
 * MEM-7 lives here, in one place: a stored default that is not an active
 * membership is repointed (see `resolveActiveHousehold`) without an error page
 * and without naming the household it pointed at. Only on two successful
 * reads — a failed one must never wipe a valid default.
 */
export async function getHouseholdContext(): Promise<HouseholdContext> {
  try {
    const user = await getRequestUser()
    if (!user) return EMPTY

    const supabase = await createClient()
    const [profile, { data: memberships, error: membershipsError }] = await Promise.all([
      getRequestProfile(),
      supabase
        .from('household_members')
        .select('household_id, households(id, name)')
        .eq('user_id', user.id)
        .eq('status', 'active'),
    ])

    const households: HouseholdOption[] = []
    const seen = new Set<string>()
    for (const row of memberships ?? []) {
      // Supabase types an embedded one-to-one as an array in some versions.
      const embedded = (row as { households?: unknown }).households
      const household = (Array.isArray(embedded) ? embedded[0] : embedded) as
        | { id: string; name: string }
        | null
        | undefined
      if (!household?.id || seen.has(household.id)) continue
      seen.add(household.id)
      households.push({ id: household.id, name: household.name })
    }
    households.sort((a, b) => a.name.localeCompare(b.name))

    const storedId = (profile?.default_household_id as string | null) ?? null
    if (!profile || membershipsError) return { currentId: storedId, households, recovered: false }

    const { currentId, stale } = resolveActiveHousehold(storedId, households)
    if (!stale) return { currentId, households, recovered: false }

    // The user's own profile row: RLS lets them write it, as the household
    // switcher does. Not a Server Action because it runs during render; the
    // layout redirects right after, so nothing rendered from the stale id
    // reaches the screen.
    //
    // Compare-and-swap on the stale id: if anything changed the default since
    // it was read (a switch, a future invitation accept), this writes nothing
    // and reports no recovery, rather than overwriting a value it never saw.
    // Exactly one changed row is the only "recovered" — so a write that
    // silently matched nothing can never send the layout into a redirect loop.
    const { data: repaired, error: repairError } = await supabase
      .from('profiles')
      .update({ default_household_id: currentId })
      .eq('id', user.id)
      .eq('default_household_id', storedId as string)
      .select('id')
    if (repairError || repaired?.length !== 1) return { currentId: storedId, households, recovered: false }

    return { currentId, households, recovered: true }
  } catch {
    return EMPTY
  }
}
