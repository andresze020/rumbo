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
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
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
          formatter={(value: number) => [formatValue(value, currency, formatAs), '']}
          labelFormatter={(label) => label}
          contentStyle={{
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid hsl(var(--border))',
            background: 'hsl(var(--card))',
            color: 'hsl(var(--card-foreground))',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
          itemStyle={{ color: 'hsl(var(--foreground))' }}
          cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
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
