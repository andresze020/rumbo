import { InfoTooltip } from '@/components/info-tooltip'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'

type FinancialHeroCardProps = {
  netWorth: number
  assets: number
  liabilities: number
  projected: number
  /** Net-worth change vs last month as a fraction (0.03 = +3%), or null. */
  deltaPct: number | null
  currency: string
  /** Net-worth values for the last N months, oldest→newest, for the sparkline. */
  spark: number[]
  /**
   * MOCK / DEMO ONLY. Illustrative composite from savings rate + budget usage.
   * NOT a validated metric and NOT financial advice — always rendered with the
   * "Demo" tooltip. No real health metric exists yet (Sprint 3 brief).
   */
  healthScore: number
  labels: {
    netWorth: string
    assets: string
    liabilities: string
    projected: string
    monthHealth: string
    vsPrev: string
    healthTooltip: string
  }
}

/** Demo letter grade for the mock health score. */
function healthGrade(score: number) {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B+'
  if (score >= 60) return 'B'
  if (score >= 50) return 'C+'
  if (score >= 40) return 'C'
  return 'D'
}

/** Builds an SVG polyline (200×28 viewBox) from net-worth history. */
function sparkPoints(values: number[]) {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = 200 / (values.length - 1)
  return values
    .map((v, i) => {
      const x = i * stepX
      const y = 26 - ((v - min) / span) * 24
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function DeltaPill({
  deltaPct,
  vsPrev,
  onAccent = false,
}: {
  deltaPct: number | null
  vsPrev: string
  onAccent?: boolean
}) {
  if (deltaPct === null || Math.abs(deltaPct) < 0.0005) return null
  const up = deltaPct > 0
  const arrow = up ? '↑' : '↓'
  const pct = new Intl.NumberFormat('en-CA', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(deltaPct) * 100)
  if (onAccent) {
    return (
      <span className="rounded-md bg-white/20 px-2 py-0.5 text-xs font-semibold text-white">
        {arrow} {pct}% {vsPrev}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'rounded-md px-2 py-0.5 text-xs font-semibold',
        up
          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
          : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
      )}
    >
      {arrow} {pct}% {vsPrev}
    </span>
  )
}

export function FinancialHeroCard({
  netWorth,
  assets,
  liabilities,
  projected,
  deltaPct,
  currency,
  spark,
  healthScore,
  labels,
}: FinancialHeroCardProps) {
  const score = Math.round(healthScore)
  const grade = healthGrade(score)
  const points = sparkPoints(spark)
  const netWorthClass = netWorth < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'

  return (
    <>
      {/* ── Mobile: blue hero ─────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/85 p-5 text-white shadow-sm lg:hidden">
        <p className="text-xs font-medium uppercase tracking-wide text-white/70">{labels.netWorth}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            {formatCurrency(netWorth, currency)}
          </span>
          <DeltaPill deltaPct={deltaPct} vsPrev={labels.vsPrev} onAccent />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/20 pt-3">
          <div>
            <p className="text-[11px] text-white/70">{labels.assets}</p>
            <p className="text-base font-semibold tabular-nums">{formatCurrency(assets, currency)}</p>
          </div>
          <div>
            <p className="text-[11px] text-white/70">{labels.liabilities}</p>
            <p className="text-base font-semibold tabular-nums">{formatCurrency(liabilities, currency)}</p>
          </div>
        </div>
      </div>

      {/* ── Desktop: control-center hero ──────────────────────────────── */}
      <div className="hidden items-center gap-6 rounded-2xl border bg-card p-5 shadow-sm shadow-black/[0.03] lg:grid lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.netWorth}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <span className={cn('text-4xl font-semibold tracking-tight tabular-nums', netWorthClass)}>
              {formatCurrency(netWorth, currency)}
            </span>
            <DeltaPill deltaPct={deltaPct} vsPrev={labels.vsPrev} />
          </div>
          {points ? (
            <svg
              viewBox="0 0 200 28"
              width="200"
              height="28"
              preserveAspectRatio="none"
              className="mt-2 overflow-visible text-primary"
              aria-hidden="true"
            >
              <polyline
                points={points}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.9"
              />
            </svg>
          ) : null}
        </div>

        <div className="border-l pl-5 text-right">
          <p className="mb-1 text-[10.5px] text-muted-foreground">{labels.assets}</p>
          <p className="whitespace-nowrap text-[17px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCurrency(assets, currency)}
          </p>
        </div>
        <div className="text-right">
          <p className="mb-1 text-[10.5px] text-muted-foreground">{labels.liabilities}</p>
          <p className="whitespace-nowrap text-[17px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">
            {formatCurrency(liabilities, currency)}
          </p>
        </div>
        <div className="border-l pl-5 text-right">
          <p className="mb-1 text-[10.5px] text-muted-foreground">{labels.projected}</p>
          <p className="whitespace-nowrap text-[17px] font-semibold tabular-nums text-sky-600 dark:text-sky-400">
            {formatCurrency(projected, currency)}
          </p>
        </div>

        {/* Demo health score */}
        <div className="border-l pl-5 text-center">
          <div className="mb-1.5 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
            {labels.monthHealth}
            <InfoTooltip text={labels.healthTooltip} label={labels.monthHealth} />
          </div>
          <div className="mx-auto mb-1 flex size-12 items-center justify-center rounded-full border-[3px] border-primary bg-primary/10">
            <span className="text-sm font-bold text-primary">{grade}</span>
          </div>
          <p className="text-[10.5px] text-muted-foreground">{score}/100</p>
        </div>
      </div>
    </>
  )
}
