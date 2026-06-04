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
