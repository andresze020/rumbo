import 'server-only'
import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * MQ-006 — today's rate to base currency for each foreign goal currency, from
 * the household's own rates via `get_exchange_rate` (exact-or-latest-prior on
 * the pair, then the inverse pair): the lookup net worth uses for foreign
 * accounts. One call per distinct currency, run together; null when the
 * household has no usable rate for it.
 */
export async function getGoalRatesToBase(
  supabase: SupabaseServerClient,
  householdId: string,
  baseCurrency: string,
  currencies: Iterable<string>
): Promise<Map<string, number | null>> {
  const foreign = [...new Set(currencies)].filter((code) => code && code !== baseCurrency)
  const today = new Date().toISOString().slice(0, 10)
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
  return new Map(
    foreign.map((code, i) => {
      const { data, error } = results[i]
      const rate = error || data === null || data === undefined ? null : Number(data)
      return [code, rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null]
    })
  )
}
