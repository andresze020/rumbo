'use client'

import { LineChart } from '@/components/dashboard/line-chart'
import { pickTickIndices } from '@/lib/charts/pick-ticks'

type HeroTrendChartProps = {
  /** Net worth for the longest selectable range, oldest first — sliced client-side per timeframe. */
  trend: { values: number[]; labels: string[]; ticks: string[] }
  currency: string
  seriesLabel: string
  /** Months to show, controlled by the caller (shared with the timeframe pills elsewhere on the card). */
  months: number
  /** One pre-translated aria-label per selectable month count (mentions the count in plain language). */
  ariaLabelByMonths: Record<number, string>
}

/**
 * The Dashboard hero card's net worth trend chart. Purely presentational —
 * the timeframe pills live in the card's header (2026-09-26: moved there so
 * they read as part of the summary row instead of floating past the chart's
 * own axis labels) and drive this via the `months` prop. Keying by `months`
 * replays the draw-in animation on a timeframe change, same trick the
 * dashboard uses for month navigation.
 */
export function HeroTrendChart({ trend, currency, seriesLabel, months, ariaLabelByMonths }: HeroTrendChartProps) {
  if (trend.values.length <= 1) return null

  const values = trend.values.slice(-months)
  const labels = trend.labels.slice(-months)
  const tickLabels = trend.ticks.slice(-months)
  const ticks = pickTickIndices(values.length).map((index) => ({ index, label: tickLabels[index] }))
  const ariaLabel = ariaLabelByMonths[months] ?? Object.values(ariaLabelByMonths)[0] ?? ''

  return (
    <LineChart
      key={months}
      series={[{ label: seriesLabel, values, tone: 'primary', area: true }]}
      xCount={values.length}
      xLabels={labels}
      ticks={ticks}
      currency={currency}
      className="h-32 lg:h-44"
      markLast
      ariaLabel={ariaLabel}
    />
  )
}
