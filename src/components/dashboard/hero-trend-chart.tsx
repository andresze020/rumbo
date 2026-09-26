'use client'

import { useState } from 'react'
import { LineChart } from '@/components/dashboard/line-chart'
import { TimeframeSelector } from '@/components/charts/timeframe-selector'
import { pickTickIndices } from '@/lib/charts/pick-ticks'
import type { TimeframeOption } from '@/lib/charts/timeframe-options'

type HeroTrendChartProps = {
  /** Net worth for the longest selectable range, oldest first — sliced client-side per timeframe. */
  trend: { values: number[]; labels: string[]; ticks: string[] }
  currency: string
  seriesLabel: string
  options: TimeframeOption[]
  defaultMonths: number
  /** One pre-translated aria-label per selectable month count (mentions the count in plain language). */
  ariaLabelByMonths: Record<number, string>
  rangeAriaLabel: string
  className?: string
}

/**
 * The Dashboard hero card's net worth trend, with a Wealthsimple-style 3M/6M/1Y
 * switch. The server sends the longest range once; picking a timeframe only
 * re-slices and re-keys the chart (no refetch), which also replays its
 * draw-in animation — same `key` trick the dashboard uses for month changes.
 */
export function HeroTrendChart({
  trend,
  currency,
  seriesLabel,
  options,
  defaultMonths,
  ariaLabelByMonths,
  rangeAriaLabel,
  className,
}: HeroTrendChartProps) {
  const [months, setMonths] = useState(defaultMonths)

  if (trend.values.length <= 1) return null

  const values = trend.values.slice(-months)
  const labels = trend.labels.slice(-months)
  const tickLabels = trend.ticks.slice(-months)
  const ticks = pickTickIndices(values.length).map((index) => ({ index, label: tickLabels[index] }))

  return (
    <div className={className}>
      <LineChart
        key={months}
        series={[{ label: seriesLabel, values, tone: 'primary', area: true }]}
        xCount={values.length}
        xLabels={labels}
        ticks={ticks}
        currency={currency}
        className="h-32 lg:h-44"
        markLast
        ariaLabel={ariaLabelByMonths[months] ?? ariaLabelByMonths[defaultMonths]}
      />
      {options.length > 1 ? (
        <div className="mt-3 flex justify-center">
          <TimeframeSelector options={options} value={months} onChange={setMonths} ariaLabel={rangeAriaLabel} />
        </div>
      ) : null}
    </div>
  )
}
