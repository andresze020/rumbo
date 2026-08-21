const FX_API_BASE =
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api'

export type FxResult =
  | { rate: number; date: string; isLatest: false }
  | { rate: number; date: string; isLatest: true }
  | { rate: null; error: string }

export async function fetchFxRate(
  baseCurrency: string,
  accountCurrency: string,
  transactionDate: string
): Promise<FxResult> {
  const today = new Date().toISOString().slice(0, 10)
  const isFuture = transactionDate > today
  const fetchDate = isFuture ? 'latest' : transactionDate
  const base = baseCurrency.toLowerCase()
  const account = accountCurrency.toLowerCase()

  async function tryDate(tag: string) {
    const url = `${FX_API_BASE}@${tag}/v1/currencies/${base}.json`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const data = (await res.json()) as Record<string, unknown>
    const rates = data[base] as Record<string, number> | undefined
    const rate = rates?.[account]
    if (typeof rate !== 'number' || rate <= 0) return null
    const date = typeof data['date'] === 'string' ? data['date'] : tag
    return { rate, date }
  }

  try {
    const result = await tryDate(fetchDate)
    if (result) {
      return { rate: result.rate, date: result.date, isLatest: isFuture }
    }

    if (!isFuture) {
      const latest = await tryDate('latest')
      if (latest) {
        return { rate: latest.rate, date: latest.date, isLatest: true }
      }
    }

    return { rate: null, error: `No rate found for ${accountCurrency}/${baseCurrency}. Enter it manually.` }
  } catch {
    return { rate: null, error: 'Could not fetch rate. Enter it manually.' }
  }
}

/**
 * The rate in the direction the ledger stores it: **1 `from` = N `to`**, which
 * is what `exchange_rates.rate` and `exchange_rate_to_base` both mean.
 *
 * `fetchFxRate` above answers the question the entry forms ask ("how much of my
 * account currency is one unit of base?"), which is the inverse of this one.
 * The API publishes a file per currency, so this reads `from`'s file directly
 * rather than inverting a number and compounding the rounding.
 */
export async function fetchDirectRate(
  fromCurrency: string,
  toCurrency: string,
  onDate?: string
): Promise<{ rate: number; date: string } | null> {
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
    return { rate: 1, date: onDate ?? new Date().toISOString().slice(0, 10) }
  }

  // Pass a real date, never the literal 'latest': fetchFxRate compares the
  // argument against today to decide whether it is a future date, and it
  // already falls back to 'latest' when the day's file is not published yet.
  const today = new Date().toISOString().slice(0, 10)
  const direct = await fetchFxRate(fromCurrency, toCurrency, onDate ?? today)

  if (direct.rate !== null) {
    return { rate: direct.rate, date: direct.date }
  }

  // The provider publishes a file per currency, so the direct read normally
  // works. If `from` has no file of its own, the pair still exists inside
  // `to`'s file — read it the other way and invert.
  const reverse = await fetchFxRate(toCurrency, fromCurrency, onDate ?? today)

  if (reverse.rate !== null && reverse.rate > 0) {
    return { rate: 1 / reverse.rate, date: reverse.date }
  }

  return null
}
