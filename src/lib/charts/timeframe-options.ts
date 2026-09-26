export type TimeframeOption = {
  months: number
  label: string
}

/**
 * Shared month-count presets for the trend charts (Dashboard net worth, Trends).
 * Capped at 12: each chart's server data is fetched once for the longest
 * option and sliced client-side per pill, so going further (e.g. 24) would
 * raise every page load's RPC fan-out (one `get_monthly_dashboard_summary`
 * call per month) past what a user picking the widest range already cost
 * before this timeframe switch existed.
 */
export const MONTHLY_TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { months: 3, label: '3M' },
  { months: 6, label: '6M' },
  { months: 12, label: '1Y' },
]

export const MAX_MONTHLY_TIMEFRAME_MONTHS = Math.max(
  ...MONTHLY_TIMEFRAME_OPTIONS.map((o) => o.months)
)
