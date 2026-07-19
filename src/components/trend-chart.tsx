'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  Area,
  AreaChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TrendPoint } from '@/app/dashboard/trend-actions'
import { formatCurrencyCompact, formatPercent } from '@/lib/format'

// Reads CSS custom properties at runtime so Recharts SVG attributes
// get resolved color values instead of unresolved var() strings.
function useChartColors() {
  const { resolvedTheme } = useTheme()
  const [colors, setColors] = useState({
    primary: 'oklch(0.546 0.245 262.881)',
    muted: 'oklch(0.556 0 0)',
    card: '#ffffff',
  })

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement)
      const primary = style.getPropertyValue('--primary').trim()
      const muted = style.getPropertyValue('--muted-foreground').trim()
      const card = style.getPropertyValue('--card').trim()
      setColors({
        primary: primary || 'oklch(0.546 0.245 262.881)',
        muted: muted || 'oklch(0.556 0 0)',
        card: card || '#ffffff',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [resolvedTheme])

  return colors
}

type TrendChartProps = {
  data: TrendPoint[]
  currency: string
  formatAs: 'currency' | 'percent'
  gradientId: string
}

function formatValue(value: number, currency: string, formatAs: 'currency' | 'percent') {
  return formatAs === 'percent' ? formatPercent(value) : formatCurrencyCompact(value, currency)
}

function CustomTooltip({
  active,
  payload,
  label,
  currency,
  formatAs,
}: {
  active?: boolean
  payload?: Array<{ value?: number | string }>
  label?: string
  currency: string
  formatAs: 'currency' | 'percent'
}) {
  if (!active || !payload?.length) return null
  const val = Number(payload[0]?.value ?? 0)
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{formatValue(val, currency, formatAs)}</p>
    </div>
  )
}

/**
 * Compact sparkline for the expandable KPI cards. Wealthsimple-style: a clean
 * line + soft gradient wash with no in-plot axis text — month + value live in
 * the hover/touch tooltip, and only the first/last month render as HTML
 * endpoints below the plot so labels can never collide at narrow widths.
 */
export function TrendChart({ data, currency, formatAs, gradientId }: TrendChartProps) {
  const { primary, muted, card } = useChartColors()

  const values = data.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const allZero = min === 0 && max === 0
  // Sparkline scaling: symmetric padding so the line never clips, even for
  // all-negative series; a flat series centers instead of hugging an edge.
  // Deliberately not zero-based — the sparkline shows shape, the tooltip
  // carries the values.
  const pad = (max - min) * 0.12 || Math.abs(max || 1) * 0.12
  const lo = allZero ? -1 : min - pad
  const hi = allZero ? 1 : max + pad

  const first = data[0]
  const last = data[data.length - 1]

  return (
    <div>
      <ResponsiveContainer width="100%" height={96}>
        <AreaChart data={data} margin={{ top: 6, right: 6, left: 6, bottom: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" style={{ stopColor: primary, stopOpacity: 0.18 }} />
              <stop offset="95%" style={{ stopColor: primary, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" hide />
          <YAxis domain={[lo, hi]} hide />
          <Tooltip
            content={<CustomTooltip currency={currency} formatAs={formatAs} />}
            cursor={{ stroke: muted, strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={primary}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            baseValue={lo}
            dot={false}
            activeDot={{ r: 4, fill: primary, stroke: card, strokeWidth: 2 }}
          />
          {/* Marks the current month at the line's end. */}
          {last ? (
            <ReferenceDot
              x={last.label}
              y={last.value}
              r={4}
              fill={primary}
              stroke={card}
              strokeWidth={2}
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
      {data.length > 1 ? (
        <div className="mt-1 flex justify-between text-[10px] leading-none text-muted-foreground">
          <span>{first.label}</span>
          <span>{last.label}</span>
        </div>
      ) : null}
    </div>
  )
}
