import { createClient } from '@/lib/supabase/server'

export type Currency = {
  code: string
  name: string
}

/**
 * Active currencies are the single source of truth for every currency picker
 * and server-side validation. Add a currency by inserting a row into the
 * `currencies` table (see migrations) — no code change required.
 */
export async function getActiveCurrencies(): Promise<Currency[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('currencies')
    .select('code, name')
    .eq('is_active', true)
    .order('code', { ascending: true })

  if (error) {
    throw new Error('Could not load active currencies.')
  }

  return (data ?? []) as Currency[]
}

/**
 * Validates a currency code against the active `currencies` table.
 * Use this in server actions instead of a hardcoded allowlist so new
 * currencies are accepted automatically once inserted.
 */
export async function isActiveCurrency(code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(normalized)) return false

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('currencies')
    .select('code')
    .eq('code', normalized)
    .eq('is_active', true)
    .maybeSingle()

  return !error && Boolean(data)
}
