'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TrendPoint } from '@/app/dashboard/trend-actions'

// Reads CSS custom properties at runtime so Recharts SVG attributes
// get resolved color values instead of unresolved var() strings.
function useChartColors() {
  const { resolvedTheme } = useTheme()
  const [colors, setColors] = useState({
    primary: 'oklch(0.546 0.245 262.881)',
    muted: 'oklch(0.556 0 0)',
  })

  useEffect(() => {
    const style = getComputedStyle(document.documentElement)
    const primary = style.getPropertyValue('--primary').trim()
    const muted = style.getPropertyValue('--muted-foreground').trim()
    setColors({
      primary: primary || 'oklch(0.546 0.245 262.881)',
      muted: muted || 'oklch(0.556 0 0)',
    })
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
  if (formatAs === 'percent') {
    return new Intl.NumberFormat('en-CA', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value)
  }
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
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

export function TrendChart({ data, currency, formatAs, gradientId }: TrendChartProps) {
  const { primary, muted } = useChartColors()

  const values = data.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const allZero = min === 0 && max === 0
  const yDomain: [number | 'auto', number | 'auto'] = allZero
    ? [0, 1]
    : [min < 0 ? min * 1.1 : Math.min(0, min * 0.9), max * 1.1]

  return (
    <ResponsiveContainer width="100%" height={112}>
      <AreaChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" style={{ stopColor: primary, stopOpacity: 0.25 }} />
            <stop offset="95%" style={{ stopColor: primary, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: muted }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis domain={yDomain} hide />
        <Tooltip
          content={<CustomTooltip currency={currency} formatAs={formatAs} />}
          cursor={{ stroke: muted, strokeWidth: 1, strokeDasharray: '3 3' }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={primary}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 3, fill: primary }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
