import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getRequestProfile, getRequestUser } from '@/lib/supabase/request'
import type { HouseholdOption } from '@/components/household-switcher'
import { resolveActiveHousehold } from './active'

export type HouseholdContext = {
  currentId: string | null
  households: HouseholdOption[]
  /**
   * MEM-7: the stored default household when it is NOT an active membership
   * (null otherwise). `currentId` is then the one it falls back to (null: no
   * membership left). Nothing is written here — reads only, so a prefetch or
   * a retried render changes nothing; `recoverActiveHouseholdAction` does the
   * repair.
   */
  staleId: string | null
}

const EMPTY: HouseholdContext = { currentId: null, households: [], staleId: null }

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
 * MEM-7 is detected here, in one place: a stored default that is not an
 * active membership comes back as `staleId`, with the fallback in `currentId`
 * (see `resolveActiveHousehold`). Only on two successful reads — a failed one
 * must never mark a valid default stale.
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
    if (!profile || membershipsError) return { currentId: storedId, households, staleId: null }

    const { currentId, stale } = resolveActiveHousehold(storedId, households)
    return { currentId, households, staleId: stale ? storedId : null }
  } catch {
    return EMPTY
  }
}
