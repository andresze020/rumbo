import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { formatCurrency } from '@/lib/format'

type NetWorthHeroProps = {
  netWorth: number
  assets: number
  liabilities: number
  projected: number
  /** Net-worth change vs the previous month as a fraction (0.03 = +3%), or null. */
  deltaPct: number | null
  currency: string
  /** Net-worth values for the trailing months, oldest→newest, for the sparkline. */
  spark: number[]
  monthLabel: string
  labels: {
    netWorth: string
    assets: string
    liabilities: string
    projected: string
    vsPrev: string
  }
}

/** Builds an SVG polyline (260×30 viewBox) from net-worth history. */
function sparkPoints(values: number[]) {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = 260 / (values.length - 1)
  return values
    .map((value, index) => {
      const x = index * stepX
      const y = 28 - ((value - min) / span) * 26
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function DeltaPill({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null || Math.abs(deltaPct) < 0.0005) return null
  const up = deltaPct > 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  const pct = new Intl.NumberFormat('en-CA', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(deltaPct) * 100)
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold tabular-nums text-white">
      <Arrow className="size-3" aria-hidden="true" />
      {pct}%
    </span>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 lg:border-l lg:border-white/20 lg:pl-7 lg:text-right">
      <p className="text-[10.5px] text-white/75">{label}</p>
      <p className="mt-1 break-words font-mono text-sm font-semibold tabular-nums sm:text-base lg:whitespace-nowrap">
        {value}
      </p>
    </div>
  )
}

/**
 * Patrimonio (net-worth) hero: a full accent panel that headlines net worth for
 * the selected month alongside its assets / liabilities / projected breakdown.
 * Display only — all values are pre-computed from the ledger by the caller.
 */
export function NetWorthHero({
  netWorth,
  assets,
  liabilities,
  projected,
  deltaPct,
  currency,
  spark,
  monthLabel,
  labels,
}: NetWorthHeroProps) {
  const points = sparkPoints(spark)

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/85 p-5 text-white shadow-lg shadow-primary/25 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center lg:gap-0">
        <div className="min-w-0 lg:pr-7">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">
            {labels.netWorth} · {monthLabel}
          </p>
          <p className="mt-1.5 break-words font-mono text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
            {formatCurrency(netWorth, currency)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <DeltaPill deltaPct={deltaPct} />
            <span className="text-xs text-white/80">{labels.vsPrev}</span>
          </div>
          {points ? (
            <svg
              viewBox="0 0 260 30"
              preserveAspectRatio="none"
              className="mt-2.5 h-6 w-[220px] max-w-full overflow-visible opacity-60"
              aria-hidden="true"
            >
              <polyline
                points={points}
                fill="none"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-white/20 pt-4 lg:contents">
          <HeroStat label={labels.assets} value={formatCurrency(assets, currency)} />
          <HeroStat label={labels.liabilities} value={formatCurrency(liabilities, currency)} />
          <HeroStat label={labels.projected} value={formatCurrency(projected, currency)} />
        </div>
      </div>
    </section>
  )
}
