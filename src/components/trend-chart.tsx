'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TrendPoint } from '@/app/dashboard/trend-actions'

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
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis domain={yDomain} hide />
        <Tooltip
          content={<CustomTooltip currency={currency} formatAs={formatAs} />}
          cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '3 3' }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 3, fill: 'hsl(var(--primary))' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
