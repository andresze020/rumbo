'use client'

import { useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { ChevronDown } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { getDashboardTrend, type TrendMetric, type TrendPoint } from '@/app/dashboard/trend-actions'

const TrendChart = dynamic(
  () => import('./trend-chart').then((m) => ({ default: m.TrendChart })),
  {
    ssr: false,
    loading: () => <p className="py-4 text-center text-xs text-muted-foreground">Loading chart…</p>,
  }
)

type MetricCardProps = {
  label: string
  value: ReactNode
  description?: string
  delta?: ReactNode
  /** Optional glyph shown in a tinted tile next to the label. */
  icon?: ReactNode
  /** Tailwind classes for the icon tile (bg + text). */
  accent?: string
  /** Color treatment for the value text. */
  valueClassName?: string
  trendMetric?: TrendMetric
  currentMonth?: string
  currency?: string
}

export function MetricCard({
  label,
  value,
  description,
  delta,
  icon,
  accent = 'bg-primary/10 text-primary',
  valueClassName,
  trendMetric,
  currentMonth,
  currency = 'CAD',
}: MetricCardProps) {
  const [open, setOpen] = useState(false)
  const [trendData, setTrendData] = useState<TrendPoint[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const hasTrend = Boolean(trendMetric && currentMonth)
  const formatAs = trendMetric === 'savings-rate' ? 'percent' : 'currency'
  const gradientId = `trend-${label.replace(/\s+/g, '-').toLowerCase()}`

  async function handleToggle() {
    const next = !open
    setOpen(next)
    if (next && !trendData && trendMetric && currentMonth) {
      setLoading(true)
      setLoadError(false)
      try {
        const result = await getDashboardTrend(trendMetric, currentMonth)
        if (result.ok) {
          setTrendData(result.data)
        } else {
          setLoadError(true)
        }
      } catch {
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    }
  }

  const header = (
    <>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon ? (
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
                  accent
                )}
                aria-hidden="true"
              >
                {icon}
              </span>
            ) : null}
            <CardTitle className="truncate text-sm font-medium leading-snug text-muted-foreground">
              {label}
            </CardTitle>
          </div>
          {hasTrend ? (
            <ChevronDown
              className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className={cn('text-2xl font-semibold tracking-tight tabular-nums', valueClassName)}>
          {value}
        </p>
        {delta ? <div className="mt-1.5">{delta}</div> : null}
        {description ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </CardContent>
    </>
  )

  return (
    <Card className="transition-shadow hover:shadow-md">
      {hasTrend ? (
        <button
          type="button"
          className="w-full text-left"
          onClick={handleToggle}
          aria-expanded={open}
          aria-label={`${label} — tap to ${open ? 'hide' : 'show'} trend`}
        >
          {header}
        </button>
      ) : (
        header
      )}

      {hasTrend ? (
        <div
          className={`grid transition-all duration-200 ease-in-out ${
            open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            <div className="border-t px-4 pb-4 pt-3">
              {loading ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Loading trend…</p>
              ) : loadError ? (
                <p className="py-4 text-center text-xs text-destructive">Could not load trend data.</p>
              ) : trendData ? (
                <TrendChart
                  data={trendData}
                  currency={currency}
                  formatAs={formatAs}
                  gradientId={gradientId}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  )
}
