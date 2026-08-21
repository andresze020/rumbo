'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { fetchDirectRate } from '@/lib/fx'

export type RefreshRatesResult = {
  status: 'updated' | 'fresh' | 'unauthenticated' | 'failed'
  /** Currencies whose rate was written on this run. */
  updated: string[]
  /** Currencies the provider had no usable rate for; the old one still stands. */
  failed: string[]
}

/**
 * Brings the household's exchange rates up to today from the public rate API.
 *
 * Runs as the signed-in user, so RLS applies exactly as it does everywhere
 * else — no service-role key is introduced for this. That also means rates
 * refresh when someone opens the app rather than on a server schedule, which
 * for a personal finance app is the moment the number is actually being read.
 *
 * Safe to call repeatedly: it skips any currency that already has a rate dated
 * today, and the upsert is keyed on (household, pair, date), so two tabs racing
 * write the same row rather than two.
 *
 * A provider failure is never fatal — the previous rate stays on file and the
 * balance keeps using it.
 */
export async function refreshExchangeRatesAction(): Promise<RefreshRatesResult> {
  const empty = { updated: [], failed: [] }
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { status: 'unauthenticated', ...empty }

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  const householdId = profile?.default_household_id as string | undefined
  if (!householdId) return { status: 'unauthenticated', ...empty }

  const { data: household } = await supabase
    .from('households')
    .select('base_currency')
    .eq('id', householdId)
    .maybeSingle()

  const baseCurrency = household?.base_currency as string | undefined
  if (!baseCurrency) return { status: 'failed', ...empty }

  // Only the currencies this household actually holds accounts in. Archived
  // accounts count — their balance still shows on the accounts screen.
  const { data: accountRows } = await supabase
    .from('accounts')
    .select('currency_code')
    .eq('household_id', householdId)
    .is('deleted_at', null)

  const currencies = [
    ...new Set(
      ((accountRows ?? []) as { currency_code: string }[])
        .map((row) => row.currency_code)
        .filter((code) => code !== baseCurrency)
    ),
  ]

  if (!currencies.length) return { status: 'fresh', ...empty }

  const today = new Date().toISOString().slice(0, 10)

  const { data: todaysRates } = await supabase
    .from('exchange_rates')
    .select('from_currency_code')
    .eq('household_id', householdId)
    .eq('to_currency_code', baseCurrency)
    .eq('rate_date', today)
    .in('from_currency_code', currencies)

  const alreadyFresh = new Set(
    ((todaysRates ?? []) as { from_currency_code: string }[]).map(
      (row) => row.from_currency_code
    )
  )
  const stale = currencies.filter((code) => !alreadyFresh.has(code))

  if (!stale.length) return { status: 'fresh', ...empty }

  const updated: string[] = []
  const failed: string[] = []

  for (const currencyCode of stale) {
    const result = await fetchDirectRate(currencyCode, baseCurrency, today)

    if (!result || !Number.isFinite(result.rate) || result.rate <= 0) {
      failed.push(currencyCode)
      continue
    }

    // Stored under the date the provider published, not "today": on a weekend
    // the newest figure is Friday's, and dating it today would invent a
    // quotation that never existed. The as-of lookup takes the newest rate on
    // or before the day being shown, so it is used either way.
    const { error } = await supabase.from('exchange_rates').upsert(
      {
        household_id: householdId,
        from_currency_code: currencyCode,
        to_currency_code: baseCurrency,
        rate: result.rate,
        rate_date: result.date,
        source: 'auto',
        created_by: user.id,
        updated_by: user.id,
      },
      { onConflict: 'household_id,from_currency_code,to_currency_code,rate_date' }
    )

    if (error) failed.push(currencyCode)
    else updated.push(currencyCode)
  }

  if (!updated.length) {
    return { status: failed.length ? 'failed' : 'fresh', updated, failed }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard/net-worth')
  revalidatePath('/dashboard/plan')
  revalidatePath('/dashboard/debts')
  revalidatePath('/dashboard/settings')

  return { status: 'updated', updated, failed }
}
