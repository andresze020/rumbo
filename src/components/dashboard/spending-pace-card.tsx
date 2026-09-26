import { LineChart } from '@/components/dashboard/line-chart'
import { Money } from '@/components/dashboard/money'
import type { SpendingPace } from '@/lib/dashboard/spending-pace'
import { cn } from '@/lib/utils'

type SpendingPaceCardProps = {
  pace: SpendingPace
  currency: string
  labels: {
    title: string
    /** Headline under the amount, e.g. "$312.40 less than by this day in August". */
    comparison: string | null
    comparisonTone: 'good' | 'bad' | 'neutral'
    currentSeries: string
    previousSeries: string
    /** Tooltip heading per day of the domain, e.g. "Day 12". */
    dayLabels: string[]
    ariaLabel: string
  }
  className?: string
}

/**
 * Spending pace (2026-09-26): this month's spending, day by day and running
 * total, against last month's line. Answers "am I spending faster than last
 * month?" before the month is over, which the monthly totals cannot.
 */
export function SpendingPaceCard({ pace, currency, labels, className }: SpendingPaceCardProps) {
  // The month on screen sets the axis; last month is read "by the same day",
  // so its days past this month's length (Aug 31 against September) drop off.
  const xCount = pace.daysInMonth
  const spent = pace.current[pace.current.length - 1] ?? 0
  // Ticks at the start, the weeks and the end: enough to place a day without
  // a label on every one.
  const tickDays = [1, 8, 15, 22, xCount]
  const ticks = tickDays.map((day) => ({ index: day - 1, label: String(day) }))

  return (
    <section
      aria-labelledby="spending-pace-title"
      className={cn('flex flex-col rounded-2xl border bg-card p-5 shadow-sm shadow-black/[0.03]', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="spending-pace-title" className="text-sm font-semibold">
            {labels.title}
          </h2>
          <p className="mt-2">
            <Money value={spent} currency={currency} className="text-3xl font-semibold tracking-tight" />
          </p>
          {labels.comparison ? (
            <p
              className={cn(
                'mt-1 text-xs font-medium',
                labels.comparisonTone === 'good' && 'text-emerald-700 dark:text-emerald-400',
                labels.comparisonTone === 'bad' && 'text-amber-700 dark:text-amber-400',
                labels.comparisonTone === 'neutral' && 'text-muted-foreground'
              )}
            >
              {labels.comparison}
            </p>
          ) : null}
        </div>
        <ul className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-primary" aria-hidden="true" />
            {labels.currentSeries}
          </li>
          <li className="flex items-center gap-1.5">
            <svg width="16" height="2" aria-hidden="true" className="overflow-visible">
              <line x1="0" x2="16" y1="1" y2="1" stroke="var(--muted-foreground)" strokeOpacity="0.7" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            {labels.previousSeries}
          </li>
        </ul>
      </div>

      <LineChart
        className="mt-5 min-h-[180px] flex-1"
        series={[
          { label: labels.currentSeries, values: pace.current, tone: 'primary', area: true },
          { label: labels.previousSeries, values: pace.previous.slice(0, xCount), tone: 'muted', dashed: true },
        ]}
        xCount={xCount}
        xLabels={labels.dayLabels}
        ticks={ticks}
        currency={currency}
        zeroBased
        markLast
        ariaLabel={labels.ariaLabel}
      />
    </section>
  )
}
