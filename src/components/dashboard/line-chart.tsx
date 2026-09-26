'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatCurrency } from '@/lib/format'
import { ACCENT_COLOR, NEGATIVE_COLOR, POSITIVE_COLOR } from '@/lib/chart-colors'
import { cn } from '@/lib/utils'

export type LineSeriesTone = 'primary' | 'muted' | 'positive' | 'negative' | 'accent'

export type LineSeries = {
  label: string
  /** One value per x index; shorter than the domain when the series stops early (the open month). */
  values: number[]
  tone: LineSeriesTone
  dashed?: boolean
  /** Gradient fill under the line. */
  area?: boolean
}

type LineChartProps = {
  series: LineSeries[]
  /** Size of the x domain (days in the month, months in the trend). */
  xCount: number
  /** Tooltip heading per x index. */
  xLabels: string[]
  /** Axis ticks under the plot; omit for a sparkline-style chart. */
  ticks?: { index: number; label: string }[]
  currency: string
  /** Overrides the tooltip's default currency formatting, e.g. for a percentage series. */
  formatValue?: (value: number) => string
  /** Plot height in px; omit to fill the parent's remaining height (a flex column). */
  height?: number
  /** Include 0 in the y domain (cumulative spending). Off: fit to the data (net worth). */
  zeroBased?: boolean
  /** Mark the last point of the first series (today's position). */
  markLast?: boolean
  ariaLabel: string
  className?: string
}

const TONE: Record<LineSeriesTone, string> = {
  primary: 'var(--primary)',
  muted: 'var(--muted-foreground)',
  positive: POSITIVE_COLOR,
  negative: NEGATIVE_COLOR,
  accent: ACCENT_COLOR,
} as const

/**
 * Monotone cubic path (Fritsch–Carlson): smooth like a spline, but never
 * overshoots between points, so a cumulative line never appears to dip and a
 * flat stretch stays flat.
 */
function monotonePath(points: [number, number][]): string {
  const n = points.length
  if (n === 0) return ''
  if (n === 1) return `M${points[0][0]},${points[0][1]}`
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1][0] - points[i][0])
    slope.push((points[i + 1][1] - points[i][1]) / (dx[i] || 1))
  }
  const tangent: number[] = [slope[0]]
  for (let i = 1; i < n - 1; i++) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i]))
  }
  tangent.push(slope[n - 2])
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    const h = dx[i] / 3
    d += `C${(x0 + h).toFixed(2)},${(y0 + h * tangent[i]).toFixed(2)} ${(x1 - h).toFixed(2)},${(y1 - h * tangent[i + 1]).toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`
  }
  return d
}

/**
 * The Dashboard's line/area chart: plain SVG (no chart library), smooth
 * monotone lines, a gradient area, a crosshair with a tooltip on hover or
 * drag, and arrow-key stepping when focused. Values are pre-computed on the
 * server; this only draws them.
 */
export function LineChart({
  series,
  xCount,
  xLabels,
  ticks,
  currency,
  formatValue,
  height: fixedHeight,
  zeroBased = false,
  markLast = false,
  ariaLabel,
  className,
}: LineChartProps) {
  const formatTooltipValue = formatValue ?? ((v: number) => formatCurrency(v, currency))
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const boxRef = useRef<HTMLDivElement>(null)
  // Real pixel size, so strokes are never stretched; a guess until measured.
  const [size, setSize] = useState({ width: 600, height: fixedHeight ?? 180 })
  const [active, setActive] = useState<number | null>(null)
  const width = size.width
  const height = fixedHeight ?? size.height

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.max(1, Math.round(entry.contentRect.width)),
        height: Math.max(1, Math.round(entry.contentRect.height)),
      })
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const all = series.flatMap((s) => s.values)
  let min = Math.min(...all, ...(zeroBased ? [0] : []))
  let max = Math.max(...all, ...(zeroBased ? [0] : []))
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0
    max = 1
  }
  const span = max - min || Math.abs(max) || 1
  // Headroom so the line never touches the card edge; a fitted domain gets
  // room below too, so the area keeps some body under the lowest point.
  const top = max + span * 0.12
  const bottom = zeroBased ? min : min - span * 0.35
  const padY = 4
  const x = (i: number) => (xCount <= 1 ? width / 2 : (i / (xCount - 1)) * width)
  const y = (v: number) => padY + (1 - (v - bottom) / (top - bottom || 1)) * (height - padY * 2)
  const xPct = (i: number) => (xCount <= 1 ? 50 : (i / (xCount - 1)) * 100)
  const yPct = (v: number) => (y(v) / height) * 100

  const paths = series.map((s) => {
    const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number])
    const line = monotonePath(pts)
    const area =
      s.area && pts.length > 1
        ? `${line}L${pts[pts.length - 1][0].toFixed(2)},${height}L${pts[0][0].toFixed(2)},${height}Z`
        : null
    return { line, area }
  })

  function indexFromPointer(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const fx = Math.min(1, Math.max(0, (e.clientX - rect.left) / (rect.width || 1)))
    return Math.round(fx * (xCount - 1))
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const last = Math.max(...series.map((s) => s.values.length)) - 1
    setActive((prev) => {
      const from = prev ?? last
      return Math.min(xCount - 1, Math.max(0, from + (e.key === 'ArrowRight' ? 1 : -1)))
    })
  }

  const lead = series[0]
  const lastIndex = lead ? lead.values.length - 1 : -1
  const tooltipRows =
    active === null
      ? []
      : series
          .map((s) => ({ s, v: s.values[active] }))
          .filter((r) => r.v !== undefined)
  // The tooltip sits inside the plot, beside the crosshair (never above the
  // chart, where a card's rounded, clipped edge would cut it off), and flips
  // to the left side past the middle.
  const tipOnLeft = active !== null && xPct(active) > 55

  return (
    <div className={cn('flex select-none flex-col', className)}>
      <div
        ref={boxRef}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className={cn(
          'relative touch-pan-y rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          fixedHeight === undefined && 'min-h-0 flex-1'
        )}
        style={fixedHeight === undefined ? undefined : { height: fixedHeight }}
        onPointerMove={(e) => setActive(indexFromPointer(e))}
        onPointerDown={(e) => setActive(indexFromPointer(e))}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 overflow-visible"
          aria-hidden="true"
        >
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`${gradientId}-${i}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={TONE[s.tone]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={TONE[s.tone]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {zeroBased ? (
            <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeWidth={1} />
          ) : null}
          {/* Draw back to front so the lead series sits on top. */}
          {[...series.keys()].reverse().map((i) => {
            const s = series[i]
            const p = paths[i]
            return (
              <g key={i}>
                {p.area ? (
                  <path d={p.area} fill={`url(#${gradientId}-${i})`} className="motion-safe:animate-[rumbo-fade_700ms_ease-out_both]" />
                ) : null}
                <path
                  d={p.line}
                  fill="none"
                  stroke={TONE[s.tone]}
                  strokeOpacity={s.tone === 'muted' ? 0.55 : 1}
                  strokeWidth={s.tone === 'muted' ? 1.5 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={s.dashed ? '4 4' : undefined}
                  pathLength={s.dashed ? undefined : 1}
                  className={cn(
                    s.dashed
                      ? 'motion-safe:animate-[rumbo-fade_700ms_ease-out_both]'
                      : '[stroke-dasharray:1] motion-safe:animate-[rumbo-draw_900ms_cubic-bezier(0.22,1,0.36,1)_both]'
                  )}
                />
              </g>
            )
          })}
        </svg>

        {/* Today's point: an HTML dot, so it stays round at any width. */}
        {markLast && lead && lastIndex >= 0 && active === null ? (
          <span
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/20 motion-safe:animate-[rumbo-fade_400ms_ease-out_700ms_both]"
            style={{ left: `${xPct(lastIndex)}%`, top: `${yPct(lead.values[lastIndex])}%` }}
            aria-hidden="true"
          />
        ) : null}

        {active !== null ? (
          <>
            <span
              className="pointer-events-none absolute inset-y-0 w-px bg-foreground/15"
              style={{ left: `${xPct(active)}%` }}
              aria-hidden="true"
            />
            {tooltipRows.map(({ s, v }) => (
              <span
                key={s.label}
                className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
                style={{ left: `${xPct(active)}%`, top: `${yPct(v)}%`, backgroundColor: TONE[s.tone] }}
                aria-hidden="true"
              />
            ))}
            <div
              className={cn(
                'pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border bg-popover/95 px-2.5 py-2 text-xs text-popover-foreground shadow-lg shadow-black/5 backdrop-blur-sm',
                tipOnLeft ? '-translate-x-[calc(100%+12px)]' : 'translate-x-3'
              )}
              style={{ left: `${xPct(active)}%` }}
            >
              <p className="mb-1 font-medium text-muted-foreground">{xLabels[active]}</p>
              {tooltipRows.map(({ s, v }) => (
                <p key={s.label} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
                    <span
                      className="inline-block h-0.5 w-3 rounded-full"
                      style={{ backgroundColor: TONE[s.tone], opacity: s.tone === 'muted' ? 0.6 : 1 }}
                      aria-hidden="true"
                    />
                    {s.label}
                  </span>
                  <span className="font-semibold tabular-nums">{formatTooltipValue(v)}</span>
                </p>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {ticks?.length ? (
        <div className="relative mt-2 h-4 text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick.index}
              className={cn(
                'absolute top-0 whitespace-nowrap',
                tick.index === 0 ? '' : tick.index === xCount - 1 ? '-translate-x-full' : '-translate-x-1/2'
              )}
              style={{ left: `${xPct(tick.index)}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
