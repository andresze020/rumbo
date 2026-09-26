'use client'

import { cn } from '@/lib/utils'
import type { TimeframeOption } from '@/lib/charts/timeframe-options'

type TimeframeSelectorProps = {
  options: TimeframeOption[]
  value: number
  onChange: (months: number) => void
  ariaLabel: string
  className?: string
}

/**
 * A row of month-count pills (3M / 6M / 1Y): the Wealthsimple-style
 * timeframe switch. Purely client state — no navigation, no data refetch —
 * so a chart already holding the superset can re-slice and re-animate
 * instantly on click.
 */
export function TimeframeSelector({ options, value, onChange, ariaLabel, className }: TimeframeSelectorProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('inline-flex shrink-0 gap-1 rounded-xl border bg-muted/40 p-1', className)}
    >
      {options.map((option) => {
        const active = option.months === value
        return (
          <button
            key={option.months}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.months)}
            className={cn(
              'flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
