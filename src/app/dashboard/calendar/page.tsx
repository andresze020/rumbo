import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ScrollText,
  StickyNote,
  Waves,
} from 'lucide-react'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { LocalizedClientBoundary } from '@/components/localized-client-boundary'
import { MonthNav } from '@/components/month-nav'
import { Callout } from '@/components/callout'
import { buttonVariants } from '@/components/ui/button'
import {
  formatCurrency,
  formatCurrencyCompact,
  formatIsoDate,
  localeToBcp47,
} from '@/lib/format'
import { getLocale } from '@/lib/i18n/server'
import { translate } from '@/lib/i18n/translate'
import type { Locale } from '@/lib/i18n/dictionaries'
import { cn } from '@/lib/utils'
import {
  getHousehold,
  longMonthLabel,
  monthEndDate,
  monthStartDate,
  parseMonthParam,
} from '@/lib/analysis/server'
import {
  getCalendarMonth,
  getTransferExpenseAccounts,
  type CalendarDay,
} from '@/lib/analysis/report-query'

type CalendarPageProps = {
  searchParams: Promise<{ month?: string }>
}

const CARD = 'rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'

/**
 * Monday-start weekday initials in the viewer's locale, for the grid header.
 * Derived from `Intl` rather than hardcoded so es/fr read correctly; the dates
 * used are a known Monday-to-Sunday week in UTC.
 */
function weekdayLabels(locale: Locale) {
  const formatter = new Intl.DateTimeFormat(localeToBcp47(locale), {
    weekday: 'short',
    timeZone: 'UTC',
  })
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2024, 0, 1 + index)))
  )
}

/** How many blank cells precede day 1 so the grid starts on a Monday. */
function leadingBlanks(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay()
  // getUTCDay: 0 = Sunday … 6 = Saturday. Monday-start means Monday → 0.
  return (weekday + 6) % 7
}

function DayCell({
  day,
  currency,
  locale,
  isToday,
}: {
  day: CalendarDay
  currency: string
  locale: Locale
  isToday: boolean
}) {
  const dayNumber = Number(day.date.slice(8))
  const hasActivity = day.txCount > 0
  const label = `${formatIsoDate(day.date, locale)} · ${formatCurrency(day.expenses, currency, locale)}`

  const inner = (
    <>
      <span
        className={cn(
          'flex size-5 items-center justify-center self-start rounded-full text-[11px] font-semibold tabular-nums',
          isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
        )}
      >
        {dayNumber}
      </span>
      {hasActivity ? (
        <span className="mt-auto flex w-full min-w-0 flex-col items-end gap-0.5 leading-tight">
          {day.expenses > 0 ? (
            <span className="w-full truncate text-right text-[9.5px] font-semibold tabular-nums text-red-600 sm:text-[11px] dark:text-red-400">
              −{formatCurrencyCompact(day.expenses, currency, locale)}
            </span>
          ) : null}
          {day.income > 0 ? (
            <span className="w-full truncate text-right text-[9.5px] font-semibold tabular-nums text-emerald-600 sm:text-[11px] dark:text-emerald-400">
              +{formatCurrencyCompact(day.income, currency, locale)}
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  )

  const shell = cn(
    'flex min-h-[3.75rem] flex-col gap-0.5 overflow-hidden rounded-lg border p-1 sm:min-h-[5rem] sm:p-1.5',
    hasActivity ? 'bg-card' : 'border-dashed bg-muted/20'
  )

  // Only a day with activity is worth navigating to.
  if (!hasActivity) {
    return <div className={shell}>{inner}</div>
  }

  return (
    <Link
      href={`/dashboard/transactions?date_from=${day.date}&date_to=${day.date}`}
      aria-label={label}
      className={cn(shell, 'transition-colors hover:border-primary/40 hover:bg-muted/40')}
    >
      {inner}
    </Link>
  )
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams
  const locale = await getLocale()
  const month = parseMonthParam(params.month)

  const ctx = await getHousehold()
  const currency = ctx.household.base_currency
  const transferExpenseAccounts = await getTransferExpenseAccounts(ctx)
  const calendar = await getCalendarMonth(ctx, month, transferExpenseAccounts)

  const todayIso = new Date().toISOString().slice(0, 10)
  const blanks = leadingBlanks(month)
  const weekdays = weekdayLabels(locale)
  const rangeHref = `/dashboard/transactions?date_from=${monthStartDate(month)}&date_to=${monthEndDate(month)}`
  const busiestDay = calendar.days.reduce<CalendarDay | null>(
    (best, day) => (day.expenses > (best?.expenses ?? 0) ? day : best),
    null
  )

  const kpis = [
    {
      label: 'Spent this month',
      value: formatCurrency(calendar.expenses, currency, locale),
      valueClass: 'text-red-600 dark:text-red-400',
      icon: <ArrowDownRight />,
      accent: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
    },
    {
      label: 'Received this month',
      value: formatCurrency(calendar.income, currency, locale),
      valueClass: 'text-emerald-600 dark:text-emerald-400',
      icon: <ArrowUpRight />,
      accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    },
    {
      label: 'Net flow',
      value: `${calendar.net >= 0 ? '+' : '−'}${formatCurrency(Math.abs(calendar.net), currency, locale)}`,
      valueClass:
        calendar.net >= 0
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-red-600 dark:text-red-400',
      icon: <Waves />,
      accent: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
    },
    {
      label: 'Days with activity',
      value: String(calendar.days.filter((d) => d.txCount > 0).length),
      valueClass: undefined,
      icon: <ScrollText />,
      accent: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
    },
  ]

  return (
    <LocalizedClientBoundary>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 pb-24 sm:gap-5 sm:p-6">
        <PageHeader
          eyebrow="Analysis"
          title="Calendar"
          description={`Day-by-day income and spending for ${longMonthLabel(month, locale)}.`}
          actions={
            <MonthNav
              month={month}
              basePath="/dashboard/calendar"
              previousLabel={translate(locale, 'common.previousMonth')}
              nextLabel={translate(locale, 'common.nextMonth')}
            />
          }
        />

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className={cn(CARD, 'p-3 sm:p-4')}>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
                    kpi.accent
                  )}
                  aria-hidden="true"
                >
                  {kpi.icon}
                </span>
                <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground sm:text-xs">
                  {kpi.label}
                </span>
              </div>
              <p
                className={cn(
                  'mt-2 break-words text-base font-semibold tabular-nums sm:text-xl',
                  kpi.valueClass
                )}
              >
                {kpi.value}
              </p>
            </div>
          ))}
        </div>

        {/* BR-039: the same note Reports carries, for the same reason. */}
        {calendar.transferExpenses > 0 ? (
          <Callout variant="info" className="border-dashed text-muted-foreground">
            {`${formatCurrency(calendar.transferExpenses, currency, locale)} of transfers into savings or investment accounts is counted as spending here, because those accounts are set to treat transfers as expense.`}
          </Callout>
        ) : null}

        {/* Month grid */}
        <div className={cn(CARD, 'p-2 sm:p-4')}>
          <div className="mb-1 grid grid-cols-7 gap-1 sm:gap-1.5">
            {weekdays.map((weekday) => (
              <span
                key={weekday}
                className="truncate px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[11px]"
              >
                {weekday}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {Array.from({ length: blanks }, (_, index) => (
              <div key={`blank-${index}`} aria-hidden="true" />
            ))}
            {calendar.days.map((day) => (
              <DayCell
                key={day.date}
                day={day}
                currency={currency}
                locale={locale}
                isToday={day.date === todayIso}
              />
            ))}
          </div>
          {/* One template literal, not text around an expression: the audited
              translation catalog keys on whole phrases, and a sentence split
              around {currency} would be translated in two unrelated halves. */}
          <p className="mt-3 text-[11px] text-muted-foreground">
            {`Tap a day to see its transactions. Amounts are posted income and expenses in ${currency}, so they add up to the same totals as the transaction list for this month.`}
          </p>
        </div>

        {/* Cross-links */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={rangeHref}
            className={cn(CARD, 'flex items-center gap-3 p-4 transition-colors hover:bg-muted/40')}
          >
            <span
              className="flex size-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400"
              aria-hidden="true"
            >
              <ScrollText className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">All transactions this month</p>
              <p className="text-xs text-muted-foreground">
                {busiestDay && busiestDay.expenses > 0
                  ? `Heaviest spending day: ${formatIsoDate(busiestDay.date, locale)}.`
                  : 'Open the full list for this month.'}
              </p>
            </div>
          </Link>
          <Link
            href={`/dashboard/reports?month=${month}`}
            className={cn(CARD, 'flex items-center gap-3 p-4 transition-colors hover:bg-muted/40')}
          >
            <span
              className="flex size-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400"
              aria-hidden="true"
            >
              <BarChart3 className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Reports</p>
              <p className="text-xs text-muted-foreground">
                Break the same month down by category and merchant.
              </p>
            </div>
          </Link>
          {/* BR-044: the calendar is where a dated note is most likely wanted. */}
          <Link
            href={`/dashboard/notes?month=${month}`}
            className={cn(CARD, 'flex items-center gap-3 p-4 transition-colors hover:bg-muted/40')}
          >
            <span
              className="flex size-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
              aria-hidden="true"
            >
              <StickyNote className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Notes</p>
              <p className="text-xs text-muted-foreground">
                Reminders and context for these days, kept out of the ledger.
              </p>
            </div>
          </Link>
        </div>

        <div className="md:hidden">
          <Link
            href="/dashboard/more"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}
          >
            Back to More
          </Link>
        </div>
      </main>
    </LocalizedClientBoundary>
  )
}
