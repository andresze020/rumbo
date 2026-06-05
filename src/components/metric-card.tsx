'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getDashboardTrend, type TrendMetric, type TrendPoint } from '@/app/dashboard/trend-actions'
import { TrendChart } from './trend-chart'

type MetricCardProps = {
  label: string
  value: ReactNode
  description: string
  delta?: ReactNode
  trendMetric?: TrendMetric
  currentMonth?: string
  currency?: string
}

export function MetricCard({
  label,
  value,
  description,
  delta,
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
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium leading-snug">{label}</CardTitle>
          {hasTrend ? (
            <ChevronDown
              className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          ) : null}
        </div>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {delta ? <div className="mt-1">{delta}</div> : null}
      </CardContent>
    </>
  )

  return (
    <Card className="border-t-2 border-t-primary/50">
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
