import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { fxToday } from '@/lib/fx'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * MQ-006 — today's rate to base currency for each foreign goal currency, from
 * the household's own rates via `get_exchange_rate` (exact-or-latest-prior on
 * the pair, then the inverse pair): the lookup net worth uses for foreign
 * accounts. One call per distinct currency, run together.
 */
export type GoalRatesToBase = {
  /** Currency → rate to base; null when the household has no usable rate. */
  rates: Map<string, number | null>
  /**
   * A lookup itself failed (network, database, permissions). Its currency is
   * also null in `rates`, but "no rate on file" would be the wrong thing to
   * tell the user, so callers surface this as a load error instead.
   */
  failed: boolean
}

export async function getGoalRatesToBase(
  supabase: SupabaseServerClient,
  householdId: string,
  baseCurrency: string,
  currencies: Iterable<string>
): Promise<GoalRatesToBase> {
  const foreign = [...new Set(currencies)].filter((code) => code && code !== baseCurrency)
  // The FX day (UTC), like every rate read — see `fxToday`.
  const today = fxToday()
  const results = await Promise.all(
    foreign.map((code) =>
      supabase.rpc('get_exchange_rate', {
        p_household_id: householdId,
        p_from_currency: code,
        p_to_currency: baseCurrency,
        p_rate_date: today,
      })
    )
  )
  const failed = results.some((result) => result.error)
  const rates = new Map(
    foreign.map((code, i) => {
      const { data, error } = results[i]
      const rate = error || data === null || data === undefined ? null : Number(data)
      return [code, rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null]
    })
  )
  return { rates, failed }
}
