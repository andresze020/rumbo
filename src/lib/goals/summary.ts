/**
 * MQ-006 — the "Total saved" figure across goals in more than one currency.
 *
 * It used to add up only the goals in the household's base currency, so a goal
 * created in COP on a CAD household simply did not count: "Total saved" stayed
 * at zero right after one was funded. Now every non-archived goal counts,
 * converted to base currency at the household's latest rate — the same
 * `get_exchange_rate` lookup net worth values foreign accounts with. A currency
 * with no rate on file is not dropped silently: it is reported back on its own,
 * in its own currency, so the page can say what is missing from the total.
 *
 * Archived goals are excluded; active, paused and completed ones all count
 * (still-held savings, as before).
 */

export type GoalAmounts = {
  currency_code: string
  current_amount: number | string
  target_amount: number | string
  status: string
}

export type GoalTotals = {
  /** Saved and target in base currency, over every goal that could be converted. */
  saved: number
  target: number
  /** Foreign currencies that were converted into the totals above. */
  converted: string[]
  /** Per currency with no rate on file: left out of the totals, in its own currency. */
  unconverted: { currency: string; saved: number; target: number }[]
}

/**
 * `ratesToBase` maps a currency to how many base units one unit is worth, or
 * null when no rate exists. The base currency itself needs no entry.
 */
export function summarizeGoals(
  goals: GoalAmounts[],
  baseCurrency: string,
  ratesToBase: Map<string, number | null>
): GoalTotals {
  let saved = 0
  let target = 0
  const converted = new Set<string>()
  const unconverted = new Map<string, { currency: string; saved: number; target: number }>()

  for (const goal of goals) {
    if (goal.status === 'archived') continue
    const current = Number(goal.current_amount)
    const goalTarget = Number(goal.target_amount)
    if (goal.currency_code === baseCurrency) {
      saved += current
      target += goalTarget
      continue
    }
    const rate = ratesToBase.get(goal.currency_code) ?? null
    if (rate !== null && Number.isFinite(rate) && rate > 0) {
      saved += current * rate
      target += goalTarget * rate
      converted.add(goal.currency_code)
      continue
    }
    const bucket = unconverted.get(goal.currency_code) ?? {
      currency: goal.currency_code,
      saved: 0,
      target: 0,
    }
    bucket.saved += current
    bucket.target += goalTarget
    unconverted.set(goal.currency_code, bucket)
  }

  return {
    saved,
    target,
    converted: [...converted].sort(),
    unconverted: [...unconverted.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
  }
}
