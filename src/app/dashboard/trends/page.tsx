import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { LocalizedClientBoundary } from '@/components/localized-client-boundary'
import { getLocale } from '@/lib/i18n/server'
import { longMonthLabel } from '@/lib/analysis/server'
import { trendMonthLabel } from '@/lib/net-worth/trend'
import { getDashboardTrend } from '@/app/dashboard/trend-actions'
import { MAX_MONTHLY_TIMEFRAME_MONTHS, MONTHLY_TIMEFRAME_OPTIONS } from '@/lib/charts/timeframe-options'
import { getHousehold, getMonthlySeries, lastNMonths, parseMonthParam } from '@/lib/analysis/server'
import { TrendsExplorer } from './trends-explorer'

type TrendsPageProps = {
  searchParams: Promise<{ month?: string; range?: string }>
}

export default async function TrendsPage({ searchParams }: TrendsPageProps) {
  const params = await searchParams
  const locale = await getLocale()
  const month = parseMonthParam(params.month)
  // A bookmarked `?range=12` link from before the timeframe pills still picks
  // a sensible starting point; the pills themselves no longer write to the URL.
  const defaultMonths = params.range === '12' ? 12 : 6
  const ctx = await getHousehold()
  const currency = ctx.household.base_currency

  const months = lastNMonths(month, MAX_MONTHLY_TIMEFRAME_MONTHS)
  const [monthly, netWorthResult] = await Promise.all([
    getMonthlySeries(ctx, months, locale),
    getDashboardTrend('net-worth', month, MAX_MONTHLY_TIMEFRAME_MONTHS),
  ])
  const netWorth = netWorthResult.ok ? netWorthResult.data : []

  const monthlyLongLabels = monthly.map((m) => longMonthLabel(m.month, locale))
  const monthlyTicks = monthly.map((m) => trendMonthLabel(m.month))
  const netWorthLongLabels = netWorth.map((p) => longMonthLabel(p.month, locale))

  return (
    <LocalizedClientBoundary>
      <main className="mx-auto flex w-full max-w-[1340px] flex-col gap-4 p-4 sm:p-6">
        <PageHeader eyebrow="Analysis" title="Trends" />

        <TrendsExplorer
          currency={currency}
          locale={locale}
          monthly={monthly}
          monthlyLongLabels={monthlyLongLabels}
          monthlyTicks={monthlyTicks}
          netWorth={netWorth}
          netWorthLongLabels={netWorthLongLabels}
          options={MONTHLY_TIMEFRAME_OPTIONS}
          defaultMonths={defaultMonths}
        />
      </main>
    </LocalizedClientBoundary>
  )
}
