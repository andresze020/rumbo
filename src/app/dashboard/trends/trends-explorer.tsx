'use client'

import { useMemo, useState } from 'react'
import { Callout } from '@/components/callout'
import { LineChart } from '@/components/dashboard/line-chart'
import { TimeframeSelector } from '@/components/charts/timeframe-selector'
import { pickTickIndices } from '@/lib/charts/pick-ticks'
import type { TimeframeOption } from '@/lib/charts/timeframe-options'
import { formatCurrency, formatCurrencyCompact, formatPercent, localeToBcp47 } from '@/lib/format'
import type { Locale } from '@/lib/i18n/dictionaries'
import { cn } from '@/lib/utils'
import type { MonthlyPoint } from '@/lib/analysis/server'
import type { TrendPoint } from '@/lib/net-worth/trend'

const CARD = 'rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'

type TrendsExplorerProps = {
  currency: string
  locale: Locale
  /** Monthly income/expenses/savings for the longest selectable range, oldest first. */
  monthly: MonthlyPoint[]
  /** Long "Month Year" heading for each point in `monthly`, e.g. for a chart tooltip. */
  monthlyLongLabels: string[]
  /** Short "Mon 'YY" axis label for each point in `monthly` (year included: some ranges span more than 12 months). */
  monthlyTicks: string[]
  /** Net worth at each month-end for the longest selectable range, oldest first. Empty when it couldn't be loaded. */
  netWorth: TrendPoint[]
  netWorthLongLabels: string[]
  options: TimeframeOption[]
  defaultMonths: number
}

/** Small delta vs the previous month, color-coded by whether the move is "good". */
function deltaLabel(
  current: number,
  previous: number,
  locale: Locale,
  higherIsBad = false
): { text: string; good: boolean } | null {
  if (previous === 0) return null
  const diff = (current - previous) / Math.abs(previous)
  if (Math.abs(diff) < 0.0005) return { text: 'No change vs prev. month', good: true }
  const isUp = diff > 0
  const pct = new Intl.NumberFormat(localeToBcp47(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(diff) * 100)
  return { text: `${isUp ? '↑' : '↓'} ${pct}% vs prev. month`, good: higherIsBad ? !isUp : isUp }
}

function tail<T>(arr: T[], n: number): T[] {
  return arr.slice(-n)
}

/**
 * The Trends screen's interactive body (2026-09-26): the same 3M/6M/1Y
 * pills as the Dashboard's net worth chart, driving the KPIs, the four
 * trend charts and the month-by-month table together. The server sends the
 * longest range once; switching timeframes only re-slices client-side, so
 * it's instant and re-plays each chart's draw-in animation (keyed by the
 * selected month count) instead of navigating.
 */
export function TrendsExplorer({
  currency,
  locale,
  monthly,
  monthlyLongLabels,
  monthlyTicks,
  netWorth,
  netWorthLongLabels,
  options,
  defaultMonths,
}: TrendsExplorerProps) {
  const [months, setMonths] = useState(defaultMonths)

  // Net worth falls back to a flat zero line (matching `monthly`'s length and
  // labels) when the balance trend couldn't be loaded, same as before this
  // screen became range-aware.
  const netWorthFull = netWorth.length ? netWorth : monthly.map((m) => ({ month: m.month, label: m.label, value: 0 }))
  const netWorthLabelsFull = netWorth.length ? netWorthLongLabels : monthlyLongLabels
  const netWorthTicksFull = netWorth.length ? netWorthFull.map((p) => p.label) : monthlyTicks

  const series = tail(monthly, months)
  const longLabels = tail(monthlyLongLabels, months)
  const tickLabels = tail(monthlyTicks, months)
  const netWorthSeries = tail(netWorthFull, months)
  const netWorthTooltipLabels = tail(netWorthLabelsFull, months)
  const netWorthTickLabels = tail(netWorthTicksFull, months)

  const monthlyTickPoints = useMemo(
    () => pickTickIndices(tickLabels.length).map((index) => ({ index, label: tickLabels[index] })),
    [tickLabels]
  )
  const netWorthTicks = useMemo(
    () => pickTickIndices(netWorthTickLabels.length).map((index) => ({ index, label: netWorthTickLabels[index] })),
    [netWorthTickLabels]
  )

  // "This month vs last month" deltas are month-over-month, not affected by
  // how far back the chart looks — always read off the full, un-sliced data.
  const thisMonth = monthly[monthly.length - 1] ?? { income: 0, expenses: 0, savings: 0, savingsRate: null }
  const prevMonth = monthly[monthly.length - 2] ?? { income: 0, expenses: 0, savings: 0, savingsRate: null }

  const count = series.length || 1
  const avgIncome = series.reduce((s, m) => s + m.income, 0) / count
  const avgExpenses = series.reduce((s, m) => s + m.expenses, 0) / count
  const avgSavings = series.reduce((s, m) => s + m.savings, 0) / count

  const firstNetWorth = netWorthSeries[0]?.value ?? 0
  const lastNetWorth = netWorthSeries[netWorthSeries.length - 1]?.value ?? 0
  const netWorthChange = lastNetWorth - firstNetWorth

  const incomeDelta = deltaLabel(thisMonth.income, prevMonth.income, locale, false)
  const expensesDelta = deltaLabel(thisMonth.expenses, prevMonth.expenses, locale, true)
  const savingsDelta = deltaLabel(thisMonth.savings, prevMonth.savings, locale, false)

  const hasActivity =
    series.some((m) => m.income !== 0 || m.expenses !== 0) || netWorthSeries.some((p) => p.value !== 0)

  const rangeLabel = options.find((o) => o.months === months)?.label ?? `${months}M`

  const kpis = [
    {
      label: 'Avg. monthly income',
      value: formatCurrency(avgIncome, currency, locale),
      valueClass: 'text-emerald-600 dark:text-emerald-400',
      sub: incomeDelta,
    },
    {
      label: 'Avg. monthly spending',
      value: formatCurrency(avgExpenses, currency, locale),
      valueClass: 'text-red-600 dark:text-red-400',
      sub: expensesDelta,
    },
    {
      label: 'Avg. monthly savings',
      value: `${avgSavings >= 0 ? '+' : '−'}${formatCurrency(Math.abs(avgSavings), currency, locale)}`,
      valueClass: avgSavings >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      sub: savingsDelta,
    },
    {
      label: 'Net worth change',
      value: `${netWorthChange >= 0 ? '+' : '−'}${formatCurrency(Math.abs(netWorthChange), currency, locale)}`,
      valueClass: netWorthChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      sub: { text: `over the last ${rangeLabel}`, good: netWorthChange >= 0 },
    },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">How your money has moved over the last {rangeLabel}.</p>
        <TimeframeSelector
          options={options}
          value={months}
          onChange={setMonths}
          ariaLabel="Select the time range shown in the charts below"
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={cn(CARD, 'min-w-0 p-4 transition-shadow hover:shadow-md')}>
            {/* Fixed to two lines' worth of height: a label that wraps in one
                language (e.g. "Ingreso mensual prom.") shouldn't push its
                value down relative to a sibling card whose label didn't. */}
            <p className="min-h-[2.25rem] break-words text-[13px] font-medium leading-snug text-muted-foreground">
              {kpi.label}
            </p>
            <p
              className={cn(
                'mt-2.5 break-words text-xl font-semibold tabular-nums sm:text-2xl',
                kpi.valueClass
              )}
            >
              {kpi.value}
            </p>
            {kpi.sub ? (
              <p
                className={cn(
                  'mt-1 break-words text-[11.5px] font-medium',
                  kpi.sub.good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                )}
              >
                {kpi.sub.text}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {!hasActivity ? (
        <Callout variant="info" className="border-dashed text-muted-foreground">
          No financial activity recorded over the last {rangeLabel}.
        </Callout>
      ) : null}

      {/* Income vs. expenses */}
      <div className={cn(CARD, 'p-4 sm:p-5')}>
        <h2 className="mb-1 text-sm font-bold">Income vs. expenses</h2>
        <p className="mb-3 text-xs text-muted-foreground">Posted income and expenses per month in {currency}.</p>
        <LineChart
          key={months}
          series={[
            { label: 'Expenses', values: series.map((m) => m.expenses), tone: 'negative', area: true },
            { label: 'Income', values: series.map((m) => m.income), tone: 'positive', dashed: true },
          ]}
          xCount={series.length}
          xLabels={longLabels}
          ticks={monthlyTickPoints}
          currency={currency}
          height={220}
          zeroBased
          formatValue={(v) => formatCurrencyCompact(v, currency, locale)}
          ariaLabel={`Income and expenses for each of the last ${rangeLabel}`}
        />
      </div>

      {/* Savings + net worth */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className={cn(CARD, 'p-4 sm:p-5')}>
          <h2 className="mb-1 text-sm font-bold">Monthly savings</h2>
          <p className="mb-3 text-xs text-muted-foreground">Income minus expenses each month.</p>
          <LineChart
            key={months}
            series={[{ label: 'Savings', values: series.map((m) => m.savings), tone: 'accent', area: true }]}
            xCount={series.length}
            xLabels={longLabels}
            ticks={monthlyTickPoints}
            currency={currency}
            height={200}
            zeroBased
            formatValue={(v) => formatCurrencyCompact(v, currency, locale)}
            ariaLabel={`Monthly savings for each of the last ${rangeLabel}`}
          />
        </div>

        <div className={cn(CARD, 'p-4 sm:p-5')}>
          <h2 className="mb-1 text-sm font-bold">Net worth</h2>
          <p className="mb-3 text-xs text-muted-foreground">Assets minus liabilities at each month-end.</p>
          <LineChart
            key={months}
            series={[{ label: 'Net worth', values: netWorthSeries.map((p) => p.value), tone: 'positive', area: true }]}
            xCount={netWorthSeries.length}
            xLabels={netWorthTooltipLabels}
            ticks={netWorthTicks}
            currency={currency}
            height={200}
            formatValue={(v) => formatCurrencyCompact(v, currency, locale)}
            ariaLabel={`Net worth at the end of each of the last ${rangeLabel}`}
          />
        </div>
      </div>

      {/* Savings rate */}
      <div className={cn(CARD, 'p-4 sm:p-5')}>
        <h2 className="mb-1 text-sm font-bold">Savings rate</h2>
        <p className="mb-3 text-xs text-muted-foreground">Share of income kept each month.</p>
        <LineChart
          key={months}
          series={[
            {
              label: 'Savings rate',
              values: series.map((m) => (m.savingsRate ?? 0) * 100),
              tone: 'accent',
              area: true,
            },
          ]}
          xCount={series.length}
          xLabels={longLabels}
          ticks={monthlyTickPoints}
          currency={currency}
          height={200}
          zeroBased
          formatValue={(v) => `${Math.round(v)}%`}
          ariaLabel={`Savings rate for each of the last ${rangeLabel}`}
        />
      </div>

      {/* Month by month */}
      <div className={cn(CARD, 'p-4 sm:p-5')}>
        <h2 className="mb-3 text-sm font-bold">Month by month</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm tabular-nums">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 pr-4 text-left font-medium">Month</th>
                <th className="py-2 pr-4 text-right font-medium">Income</th>
                <th className="py-2 pr-4 text-right font-medium">Expenses</th>
                <th className="py-2 pr-4 text-right font-medium">Savings</th>
                <th className="py-2 text-right font-medium">Savings rate</th>
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map((m) => (
                <tr key={m.month} className="border-b last:border-0">
                  <td className="py-2.5 pr-4 text-left font-medium">{m.label}</td>
                  <td className="py-2.5 pr-4 text-right text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(m.income, currency, locale)}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-red-600 dark:text-red-400">
                    {formatCurrency(m.expenses, currency, locale)}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 pr-4 text-right font-medium',
                      m.savings >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {`${m.savings >= 0 ? '+' : '−'}${formatCurrency(Math.abs(m.savings), currency, locale)}`}
                  </td>
                  <td className="py-2.5 text-right text-muted-foreground">{formatPercent(m.savingsRate, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
