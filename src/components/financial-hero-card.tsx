'use client'

import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { HeroTrendChart } from '@/components/dashboard/hero-trend-chart'
import { TimeframeSelector } from '@/components/charts/timeframe-selector'
import { Money } from '@/components/dashboard/money'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import { MONTHLY_TIMEFRAME_OPTIONS } from '@/lib/charts/timeframe-options'

type FinancialHeroCardProps = {
  netWorth: number
  assets: number
  liabilities: number
  projected: number
  /** Net-worth change vs last month's end, or null when there is nothing to compare. */
  delta: { amount: number; pct: number | null } | null
  currency: string
  /** Net worth for the longest selectable range, oldest first, with their labels. */
  trend: { values: number[]; labels: string[]; ticks: string[] }
  /** Months shown before the reader picks a different timeframe. */
  defaultTrendMonths: number
  /** One pre-translated chart aria-label per selectable month count. */
  trendAriaByMonths: Record<number, string>
  labels: {
    netWorth: string
    assets: string
    liabilities: string
    projected: string
    vsPrev: string
    trendSeries: string
    trendRangeAria: string
  }
}

function DeltaPill({ delta, currency, vsPrev }: { delta: FinancialHeroCardProps['delta']; currency: string; vsPrev: string }) {
  if (!delta || Math.abs(delta.amount) < 0.005) return null
  const up = delta.amount > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  // "0.0%" says nothing next to an amount; only show a change that rounds to something.
  const pct =
    delta.pct === null || Math.abs(delta.pct) < 0.0005
      ? null
      : new Intl.NumberFormat('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(delta.pct) * 100)
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold tabular-nums',
          up
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {up ? '+' : '−'}
        {formatCurrency(Math.abs(delta.amount), currency)}
        {pct !== null ? <span className="font-medium opacity-80">· {pct}%</span> : null}
      </span>
      <span className="text-muted-foreground">{vsPrev}</span>
    </p>
  )
}

/**
 * The Dashboard's first card (2026-09-26 redesign): net worth with its cents
 * set back, the change since last month's end, an interactive six-month
 * trend, and what it is made of. One layout for every breakpoint; the chart
 * sits beside the figures on desktop and under them on a phone.
 */
export function FinancialHeroCard({
  netWorth,
  assets,
  liabilities,
  projected,
  delta,
  currency,
  trend,
  defaultTrendMonths,
  trendAriaByMonths,
  labels,
}: FinancialHeroCardProps) {
  // Projected only adds information when pending or future-dated entries move
  // it; otherwise it repeats the net worth next to it (2026-09-25 redesign).
  const showProjected = Math.abs(projected - netWorth) >= 0.005
  const [months, setMonths] = useState(defaultTrendMonths)

  return (
    <section
      aria-labelledby="net-worth-title"
      className="relative isolate overflow-hidden rounded-2xl border bg-card p-5 shadow-sm shadow-black/[0.03] sm:p-6"
    >
      {/* A soft brand glow behind the figure: depth without a loud gradient. */}
      <div
        className="pointer-events-none absolute -left-24 -top-32 -z-10 size-80 rounded-full bg-primary/10 blur-3xl dark:bg-primary/15"
        aria-hidden="true"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
        <div className="min-w-0">
          <h2 id="net-worth-title" className="text-sm font-medium text-muted-foreground">
            {labels.netWorth}
          </h2>
          <p className="mt-1.5">
            <Money
              value={netWorth}
              currency={currency}
              className={cn(
                'text-[2.5rem] font-semibold leading-none tracking-tight sm:text-5xl',
                netWorth < 0 && 'text-rose-600 dark:text-rose-400'
              )}
            />
          </p>
          <div className="mt-3 min-h-5">
            <DeltaPill delta={delta} currency={currency} vsPrev={labels.vsPrev} />
          </div>

          <div className="mt-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-t pt-4">
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  {labels.assets}
                </dt>
                <dd className="mt-0.5 text-base font-semibold">
                  <Money value={assets} currency={currency} />
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-rose-500" aria-hidden="true" />
                  {labels.liabilities}
                </dt>
                <dd className="mt-0.5 text-base font-semibold">
                  <Money value={liabilities} currency={currency} />
                </dd>
              </div>
              {showProjected ? (
                <div>
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-sky-500" aria-hidden="true" />
                    {labels.projected}
                  </dt>
                  <dd className="mt-0.5 text-base font-semibold">
                    <Money value={projected} currency={currency} />
                  </dd>
                </div>
              ) : null}
            </dl>

            {MONTHLY_TIMEFRAME_OPTIONS.length > 1 ? (
              <TimeframeSelector
                options={MONTHLY_TIMEFRAME_OPTIONS}
                value={months}
                onChange={setMonths}
                ariaLabel={labels.trendRangeAria}
              />
            ) : null}
          </div>
        </div>

        <HeroTrendChart
          trend={trend}
          currency={currency}
          seriesLabel={labels.trendSeries}
          months={months}
          ariaLabelByMonths={trendAriaByMonths}
        />
      </div>
    </section>
  )
}
