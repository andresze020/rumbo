/**
 * Centralized display formatting helpers.
 *
 * These are presentation-only. They must never alter financial values —
 * they only control how already-computed numbers are rendered. Keeping them
 * in one place avoids subtly divergent formatting across pages.
 *
 * The app locale (`en` | `es` | `fr`) selects the BCP-47 tag used for grouping,
 * decimal separators, currency-symbol placement, and month names. Pass the
 * active locale where it's in scope; helpers default to the app default when
 * it isn't, so leaf components stay call-compatible.
 */

import { translate } from './i18n/translate'
import type { Locale } from './i18n/dictionaries'

/** App locale → BCP-47 tag. `en` maps to en-CA (the app's original default). */
export function localeToBcp47(locale: Locale = 'en'): string {
  switch (locale) {
    case 'es':
      return 'es-ES'
    case 'fr':
      return 'fr-CA'
    case 'en':
    default:
      return 'en-CA'
  }
}

export function formatCurrency(value: number | string, currencyCode: string, locale: Locale = 'en') {
  return new Intl.NumberFormat(localeToBcp47(locale), {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(value))
}

/**
 * Compact currency for tight spaces (e.g. chart axes, dense tables).
 * Falls back to the full format for small magnitudes.
 */
export function formatCurrencyCompact(value: number | string, currencyCode: string, locale: Locale = 'en') {
  const numeric = Number(value)
  if (Math.abs(numeric) < 10_000) {
    return formatCurrency(numeric, currencyCode, locale)
  }
  return new Intl.NumberFormat(localeToBcp47(locale), {
    style: 'currency',
    currency: currencyCode,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(numeric)
}

/**
 * Returns the narrow currency symbol for a code (e.g. "$" for USD/CAD, "€"
 * for EUR), falling back to the code itself for unknown currencies. Used to
 * prefix amount inputs so users see which currency they're entering.
 */
export function getCurrencySymbol(currencyCode: string, locale: Locale = 'en') {
  try {
    const parts = new Intl.NumberFormat(localeToBcp47(locale), {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0)
    return parts.find((part) => part.type === 'currency')?.value ?? currencyCode
  } catch {
    return currencyCode
  }
}

const thousandsFormatter = new Intl.NumberFormat('en-CA', {
  maximumFractionDigits: 20,
})

/** Formats a raw numeric string (e.g. "1234567.5") with thousands separators while typing. */
export function formatAmountForDisplay(raw: string) {
  if (!raw) return ''
  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw
  const [integerPart, ...rest] = unsigned.split('.')
  const decimalPart = rest.length ? rest.join('') : undefined
  const groupedInteger = integerPart
    ? thousandsFormatter.format(BigInt(integerPart || '0'))
    : ''
  let result = groupedInteger
  if (decimalPart !== undefined) {
    result = `${result || '0'}.${decimalPart}`
  }
  return negative ? `-${result}` : result
}

/** Strips formatting back to a plain numeric string, allowing digits, one leading "-" and one ".". */
export function sanitizeAmountInput(value: string) {
  let negative = value.trim().startsWith('-')
  let digits = value.replace(/[^0-9.]/g, '')
  const firstDot = digits.indexOf('.')
  if (firstDot !== -1) {
    digits = digits.slice(0, firstDot + 1) + digits.slice(firstDot + 1).replace(/\./g, '')
  }
  if (!digits) negative = false
  return negative ? `-${digits}` : digits
}

/**
 * Formats a ratio (0.125 → "12.5%"). `null` renders the localized
 * "not available" label. `minimumFractionDigits` defaults to 1 (the app's
 * original behavior); pass 0 for whole-number-friendly displays like progress
 * bars where "50%" reads better than "50.0%".
 */
export function formatPercent(
  value: number | string | null,
  locale: Locale = 'en',
  { minimumFractionDigits = 1 }: { minimumFractionDigits?: number } = {}
) {
  if (value === null) {
    return translate(locale, 'common.notAvailable')
  }
  return new Intl.NumberFormat(localeToBcp47(locale), {
    style: 'percent',
    minimumFractionDigits,
    maximumFractionDigits: 1,
  }).format(Number(value))
}

/** Turns snake_case / lower case enum values into Title Case labels. */
export function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/** "2026-06" -> "June 2026" */
export function formatMonthLabel(month: string, locale: Locale = 'en') {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(localeToBcp47(locale), {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthNumber - 1, 1))
}

/** "2026-06" -> "Jun 2026" */
export function formatMonthLabelShort(month: string, locale: Locale = 'en') {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(localeToBcp47(locale), {
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, monthNumber - 1, 1))
}

/**
 * Formats a stored calendar date (`YYYY-MM-DD`) in UTC so it never shifts to
 * the previous day on servers or devices behind UTC.
 */
export function formatIsoDate(
  iso: string | null,
  locale: Locale = 'en',
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
) {
  if (!iso) return translate(locale, 'common.notAvailable')
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return translate(locale, 'common.notAvailable')

  return new Intl.DateTimeFormat(localeToBcp47(locale), {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

/**
 * Today's calendar date (`YYYY-MM-DD`) in the **viewer's** timezone.
 *
 * Most of the app derives "today" from `new Date().toISOString().slice(0, 10)`,
 * which is UTC — fine for server-rendered defaults (the server has no way to
 * know the user's timezone), but wrong for a control that literally says
 * "Today": a user in America/Montreal at 20:00 would get tomorrow's date. Use
 * this in client components where the label makes a promise about the user's
 * own day (BR-033 relative-date chips).
 */
export function todayIsoDateLocal(now: Date = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Shifts a `YYYY-MM-DD` date by whole days, staying on the calendar grid. */
export function shiftIsoDate(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return shifted.toISOString().slice(0, 10)
}

export function formatIsoDateRange(
  dateFrom: string,
  dateTo: string,
  locale: Locale = 'en'
) {
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }
  return `${formatIsoDate(dateFrom, locale, options)} – ${formatIsoDate(
    dateTo,
    locale,
    options
  )}`
}

export function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function formatTransactionCount(count: number, descriptor = 'transaction') {
  return formatCount(count, descriptor)
}
