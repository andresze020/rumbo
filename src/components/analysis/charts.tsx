import { cn } from '@/lib/utils'

/**
 * Server-safe SVG charts for the analysis screens. No client JS: each chart is
 * drawn in a normalized `0 0 100 100` viewBox with `preserveAspectRatio="none"`
 * so it fills its container responsively, while strokes use
 * `vector-effect="non-scaling-stroke"` to stay crisp at any width. Axis labels
 * live in HTML next to the SVG so they never distort.
 */

type Series = {
  key: string
  label: string
  color: string
  values: number[]
  /** Dashed stroke + faint legend swatch — used for the secondary line. */
  dashed?: boolean
  /** Soft area fill under the line. */
  area?: boolean
}

type LineTrendChartProps = {
  series: Series[]
  labels: string[]
  /** Pixel height of the plot area. */
  height?: number
  /** Formats a value for the min/max gauge labels. */
  formatValue: (value: number) => string
  className?: string
}

function niceBounds(min: number, max: number): { lo: number; hi: number } {
  if (min === max) {
    if (min === 0) return { lo: 0, hi: 1 }
    return { lo: Math.min(0, min * 0.9), hi: max * 1.1 }
  }
  const padding = (max - min) * 0.08
  return { lo: min < 0 ? min - padding : Math.min(0, min), hi: max + padding }
}

export function LineTrendChart({
  series,
  labels,
  height = 180,
  formatValue,
  className,
}: LineTrendChartProps) {
  const all = series.flatMap((s) => s.values)
  const rawMin = Math.min(0, ...all)
  const rawMax = Math.max(0, ...all)
  const { lo, hi } = niceBounds(rawMin, rawMax)
  const span = hi - lo || 1
  const n = labels.length

  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100)
  const y = (v: number) => 100 - ((v - lo) / span) * 100
  const zeroY = y(0)

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => f * 100)

  return (
    <div className={className}>
      {/* Legend */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className={cn('h-[3px] w-3.5 rounded-full', s.dashed && 'opacity-70')}
              style={{
                backgroundColor: s.dashed ? 'transparent' : s.color,
                backgroundImage: s.dashed
                  ? `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)`
                  : undefined,
              }}
              aria-hidden="true"
            />
            {s.label}
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1" style={{ height }}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            aria-hidden="true"
          >
            {/* Gridlines */}
            {gridLines.map((gy) => (
              <line
                key={gy}
                x1="0"
                y1={gy}
                x2="100"
                y2={gy}
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                opacity={0.6}
              />
            ))}
            {/* Zero baseline (only if it sits inside the plot) */}
            {lo < 0 && hi > 0 ? (
              <line
                x1="0"
                y1={zeroY}
                x2="100"
                y2={zeroY}
                stroke="var(--muted-foreground)"
                strokeWidth="1"
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
                opacity={0.5}
              />
            ) : null}

            {/* Areas + lines */}
            {series.map((s) => {
              const pts = s.values.map((v, i) => `${x(i)},${y(v)}`)
              const line = `M ${pts.join(' L ')}`
              const areaPath = `M ${x(0)},${zeroY} L ${pts.join(' L ')} L ${x(n - 1)},${zeroY} Z`
              return (
                <g key={s.key}>
                  {s.area ? <path d={areaPath} fill={s.color} opacity={0.1} /> : null}
                  <path
                    d={line}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={s.dashed ? '5 4' : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )
            })}
          </svg>
        </div>

        {/* Min/max gauge */}
        <div className="flex w-14 shrink-0 flex-col justify-between py-0.5 text-right text-[9.5px] tabular-nums text-muted-foreground">
          <span>{formatValue(hi)}</span>
          {lo < 0 && hi > 0 ? <span>{formatValue(0)}</span> : null}
          <span>{formatValue(lo)}</span>
        </div>
      </div>

      {/* X labels */}
      <div className="mt-1.5 flex justify-between pr-16 text-[10px] text-muted-foreground">
        {labels.map((l, i) => (
          <span key={`${l}-${i}`}>{l}</span>
        ))}
      </div>
    </div>
  )
}

type BarPoint = {
  label: string
  income: number
  expenses: number
  net: number
}

type CashFlowBarsProps = {
  data: BarPoint[]
  height?: number
  formatValue: (value: number) => string
  incomeColor?: string
  expenseColor?: string
  className?: string
}

/**
 * Per-month paired bars (income up, expenses down from a zero baseline) with a
 * net-savings line overlaid. Used by the Cash flow screen.
 */
export function CashFlowBars({
  data,
  height = 220,
  formatValue,
  incomeColor = 'oklch(0.70 0.15 165)',
  expenseColor = 'oklch(0.65 0.20 25)',
  className,
}: CashFlowBarsProps) {
  const maxUp = Math.max(0, ...data.map((d) => d.income), ...data.map((d) => d.net))
  const maxDown = Math.max(0, ...data.map((d) => d.expenses), ...data.map((d) => -d.net))
  const hi = maxUp || 1
  const lo = -(maxDown || 1)
  const span = hi - lo || 1
  const n = data.length

  const y = (v: number) => 100 - ((v - lo) / span) * 100
  const zeroY = y(0)
  // Each month gets a slot; two bars centered within it.
  const slot = 100 / Math.max(n, 1)
  const barW = slot * 0.26
  const gap = slot * 0.06
  const center = (i: number) => slot * i + slot / 2
  const netPts = data.map((d, i) => `${center(i)},${y(d.net)}`)

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: incomeColor }} aria-hidden="true" />
          Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: expenseColor }} aria-hidden="true" />
          Expenses
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-3.5 rounded-full bg-foreground" aria-hidden="true" />
          Net
        </span>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1" style={{ height }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden="true">
            {[0, 0.5, 1].map((f) => (
              <line
                key={f}
                x1="0"
                y1={f * 100}
                x2="100"
                y2={f * 100}
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                opacity={0.6}
              />
            ))}
            <line x1="0" y1={zeroY} x2="100" y2={zeroY} stroke="var(--muted-foreground)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity={0.5} />

            {data.map((d, i) => {
              const cx = center(i)
              const incomeH = Math.abs(y(d.income) - zeroY)
              const expenseH = Math.abs(y(0) - y(-d.expenses === 0 ? 0 : -d.expenses))
              const expBottom = y(-d.expenses)
              return (
                <g key={d.label}>
                  <rect
                    x={cx - barW - gap / 2}
                    y={y(d.income)}
                    width={barW}
                    height={incomeH}
                    rx="0.6"
                    fill={incomeColor}
                  />
                  <rect
                    x={cx + gap / 2}
                    y={zeroY}
                    width={barW}
                    height={Math.abs(expBottom - zeroY) || expenseH}
                    rx="0.6"
                    fill={expenseColor}
                  />
                </g>
              )
            })}

            {/* Net line */}
            <path
              d={`M ${netPts.join(' L ')}`}
              fill="none"
              stroke="var(--foreground)"
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        <div className="flex w-14 shrink-0 flex-col justify-between py-0.5 text-right text-[9.5px] tabular-nums text-muted-foreground">
          <span>{formatValue(hi)}</span>
          <span>{formatValue(0)}</span>
          <span>{formatValue(lo)}</span>
        </div>
      </div>

      <div className="mt-1.5 flex justify-between pr-16 text-[10px] text-muted-foreground">
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
    </div>
  )
}
