import { formatMonthLabelShort, localeToBcp47 } from '@/lib/format'
import type { Locale } from '@/lib/i18n/dictionaries'

/**
 * The one thing that decides what slice of time the Transactions screen is
 * looking at.
 *
 * It used to be two: a `month` the header's period control owned, and a
 * `date_from`/`date_to` pair the filter sheet owned, each able to be set
 * without the other knowing. They could disagree — a sheet preset applied a
 * range the header still labelled with a month — and the page resolved the
 * contradiction with a precedence rule nobody could see. Now the URL is parsed
 * once, here, into a single `TransactionPeriod`, and the RPC bounds, the
 * totals, the count, the date headers and the control's own label all read
 * that object.
 */

/** A range wide enough to cover every transaction. */
export const ALL_TIME_FROM = '2000-01-01'
export const ALL_TIME_TO = '2099-12-31'

export const PERIOD_PRESETS = [
  'this-month',
  'last-month',
  'last-3-months',
  'last-6-months',
  'ytd',
  'all-time',
] as const

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

export type TransactionPeriod = {
  /**
   * `preset` follows the calendar (This month is whatever month it is now),
   * `month` is one pinned calendar month, `custom` is a range the user typed.
   */
  kind: 'preset' | 'month' | 'custom'
  preset: PeriodPreset | null
  /** `YYYY-MM` the period starts in. Seeds the month grid, never the query. */
  month: string
  dateFrom: string
  dateTo: string
  /**
   * False only for All time: the RPC gets null bounds there rather than a
   * range that merely looks wide, so "every transaction" needs no upper year.
   */
  bounded: boolean
}

// ── Date arithmetic ─────────────────────────────────────────────────────────
// UTC throughout: these are calendar dates, not instants, and a behind-UTC
// server would otherwise resolve "today" to yesterday.

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function currentMonth(): string {
  return todayIsoDate().slice(0, 7)
}

export function monthFirstDay(month: string): string {
  return `${month}-01`
}

export function monthLastDay(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}

export function offsetDate(baseDate: string, days: number): string {
  const [year, month, day] = baseDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return shifted.toISOString().slice(0, 10)
}

export function offsetMonth(month: string, months: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + months, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_MONTH = /^\d{4}-\d{2}$/

function isPreset(value: string): value is PeriodPreset {
  return (PERIOD_PRESETS as readonly string[]).includes(value)
}

// ── Building ────────────────────────────────────────────────────────────────

/** A pinned calendar month. */
export function monthPeriod(month: string): TransactionPeriod {
  return {
    kind: 'month',
    preset: null,
    month,
    dateFrom: monthFirstDay(month),
    dateTo: monthLastDay(month),
    bounded: true,
  }
}

/** A preset, resolved against today. */
export function presetPeriod(preset: PeriodPreset): TransactionPeriod {
  const today = todayIsoDate()
  const thisMonth = today.slice(0, 7)

  switch (preset) {
    case 'this-month':
      return { ...monthPeriod(thisMonth), kind: 'preset', preset }
    case 'last-month':
      return { ...monthPeriod(offsetMonth(thisMonth, -1)), kind: 'preset', preset }
    case 'last-3-months':
      return {
        kind: 'preset',
        preset,
        month: offsetMonth(thisMonth, -2),
        dateFrom: monthFirstDay(offsetMonth(thisMonth, -2)),
        dateTo: today,
        bounded: true,
      }
    case 'last-6-months':
      return {
        kind: 'preset',
        preset,
        month: offsetMonth(thisMonth, -5),
        dateFrom: monthFirstDay(offsetMonth(thisMonth, -5)),
        dateTo: today,
        bounded: true,
      }
    case 'ytd':
      return {
        kind: 'preset',
        preset,
        month: `${today.slice(0, 4)}-01`,
        dateFrom: `${today.slice(0, 4)}-01-01`,
        dateTo: today,
        bounded: true,
      }
    case 'all-time':
      return {
        kind: 'preset',
        preset,
        month: thisMonth,
        dateFrom: ALL_TIME_FROM,
        dateTo: ALL_TIME_TO,
        bounded: false,
      }
  }
}

/** A range the user typed. Collapses to a month when it spans exactly one. */
export function customPeriod(dateFrom: string, dateTo: string): TransactionPeriod {
  if (dateFrom === ALL_TIME_FROM && dateTo === ALL_TIME_TO) {
    return presetPeriod('all-time')
  }
  const month = dateFrom.slice(0, 7)
  // "This month" and a hand-typed Sep 1 – Sep 30 are the same view, so the
  // month grid should light up rather than call it an arbitrary range.
  if (dateFrom === monthFirstDay(month) && dateTo === monthLastDay(month)) {
    return monthPeriod(month)
  }
  return { kind: 'custom', preset: null, month, dateFrom, dateTo, bounded: true }
}

// ── Parsing ─────────────────────────────────────────────────────────────────

type RawParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** True when the URL says anything at all about the period. */
export function hasPeriodParam(params: RawParams): boolean {
  const period = first(params.period)
  const dateFrom = first(params.date_from)
  const dateTo = first(params.date_to)
  const month = first(params.month)
  return Boolean(
    (period && isPreset(period)) ||
      (dateFrom && dateTo && ISO_DATE.test(dateFrom) && ISO_DATE.test(dateTo)) ||
      (month && ISO_MONTH.test(month))
  )
}

/**
 * The period this URL is asking for.
 *
 * `period=` is the form this screen writes now; `date_from`/`date_to` and
 * `month` are still read because a dozen links elsewhere in the app (the
 * calendar, the budgets rows, a note's date, the dashboard's review queue)
 * point here with them, and a shared URL should not stop working.
 *
 * `unboundedFallback` is for a payee- or tag-only URL: those views are
 * all-time by design, and labelling them with the current month had the
 * control claim a period the results did not have.
 */
export function parseTransactionPeriod(
  params: RawParams,
  { unboundedFallback = false }: { unboundedFallback?: boolean } = {}
): TransactionPeriod {
  const preset = first(params.period)
  if (preset && isPreset(preset)) return presetPeriod(preset)

  const dateFrom = first(params.date_from)
  const dateTo = first(params.date_to)
  if (dateFrom && dateTo && ISO_DATE.test(dateFrom) && ISO_DATE.test(dateTo)) {
    return customPeriod(dateFrom, dateTo)
  }

  const month = first(params.month)
  if (month && ISO_MONTH.test(month)) return monthPeriod(month)

  if (unboundedFallback) return presetPeriod('all-time')
  return monthPeriod(currentMonth())
}

/** How this period travels in a URL — one shape per kind, never two at once. */
export function appendPeriodParams(
  params: URLSearchParams,
  period: TransactionPeriod
): URLSearchParams {
  params.delete('period')
  params.delete('month')
  params.delete('date_from')
  params.delete('date_to')

  if (period.kind === 'preset' && period.preset) {
    params.set('period', period.preset)
  } else if (period.kind === 'month') {
    params.set('month', period.month)
  } else {
    params.set('date_from', period.dateFrom)
    params.set('date_to', period.dateTo)
  }
  return params
}

/**
 * Whether two periods are looking at the same days *right now*.
 *
 * Deliberately not identity: `month=2026-09` and the `this-month` preset are
 * different URLs — one is pinned, one follows the calendar, and a shared link
 * must keep meaning what it said — but in September they show the same rows,
 * so the control has to light exactly one of them rather than neither.
 */
export function resolvesTheSame(a: TransactionPeriod, b: TransactionPeriod): boolean {
  return (
    a.bounded === b.bounded && a.dateFrom === b.dateFrom && a.dateTo === b.dateTo
  )
}

// ── Labels ──────────────────────────────────────────────────────────────────

/** "Sep 1" / "Sep 1, 2025" — the year only when it is not the current one. */
export function formatPeriodDate(iso: string, locale: Locale = 'en'): string {
  if (!ISO_DATE.test(iso)) return iso
  const [year, month, day] = iso.split('-').map(Number)
  const showYear = String(year) !== todayIsoDate().slice(0, 4)
  return new Intl.DateTimeFormat(localeToBcp47(locale), {
    month: 'short',
    day: 'numeric',
    ...(showYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

/**
 * What the control reads. Short on purpose: it shares a 320px line with the
 * screen title.
 *
 * `translateUi` is passed in rather than imported so this stays usable from a
 * server component and a client one without either owning the locale.
 */
export function formatPeriodLabel(
  period: TransactionPeriod,
  locale: Locale,
  ui: (source: string) => string
): string {
  if (period.preset === 'all-time') return ui('All time')
  if (period.preset === 'ytd') return `${ui('YTD')} ${period.dateFrom.slice(0, 4)}`
  if (period.preset === 'last-3-months') return ui('Last 3 months')
  if (period.preset === 'last-6-months') return ui('Last 6 months')
  // This month and Last month are each exactly one month, so they read as one.
  if (period.kind === 'month' || period.preset) {
    return formatMonthLabelShort(period.month, locale)
  }
  const from = formatPeriodDate(period.dateFrom, locale)
  const to = formatPeriodDate(period.dateTo, locale)
  if (period.dateFrom === period.dateTo) return from
  // Same month: "Sep 1–15" rather than repeating the month name.
  if (period.dateFrom.slice(0, 7) === period.dateTo.slice(0, 7)) {
    const [, day] = to.split(' ')
    return `${from}–${day ?? to}`
  }
  return `${from} – ${to}`
}
