import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getRequestProfile, getRequestUser } from '@/lib/supabase/request'
import type { HouseholdOption } from '@/components/household-switcher'

export type HouseholdContext = {
  currentId: string | null
  households: HouseholdOption[]
}

const EMPTY: HouseholdContext = { currentId: null, households: [] }

/**
 * The households this user can switch between, and which one is active.
 *
 * Read in the dashboard layout so the app bar's household selector is correct
 * on every screen, not just the ones that happen to query a household. Never
 * throws: the chrome losing its label must not take a page down.
 *
 * The membership join is what bounds the list — RLS already restricts it to
 * this user's rows, and nothing here widens that.
 */
export async function getHouseholdContext(): Promise<HouseholdContext> {
  try {
    const user = await getRequestUser()
    if (!user) return EMPTY

    const supabase = await createClient()
    const [profile, { data: memberships }] = await Promise.all([
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

    return {
      currentId: (profile?.default_household_id as string | null) ?? null,
      households,
    }
  } catch {
    return EMPTY
  }
}
