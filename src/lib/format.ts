/**
 * Centralized display formatting helpers.
 *
 * These are presentation-only. They must never alter financial values —
 * they only control how already-computed numbers are rendered. Keeping them
 * in one place avoids subtly divergent formatting across pages.
 */

const LOCALE = 'en-CA'

export function formatCurrency(value: number | string, currencyCode: string) {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(value))
}

/**
 * Compact currency for tight spaces (e.g. chart axes, dense tables).
 * Falls back to the full format for small magnitudes.
 */
export function formatCurrencyCompact(value: number | string, currencyCode: string) {
  const numeric = Number(value)
  if (Math.abs(numeric) < 10_000) {
    return formatCurrency(numeric, currencyCode)
  }
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: currencyCode,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(numeric)
}

export function formatPercent(value: number | string | null) {
  if (value === null) {
    return 'N/A'
  }
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value))
}

/** Turns snake_case / lower case enum values into Title Case labels. */
export function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/** "2026-06" -> "June 2026" */
export function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(LOCALE, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthNumber - 1, 1))
}

/** "2026-06" -> "Jun 2026" */
export function formatMonthLabelShort(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(LOCALE, {
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, monthNumber - 1, 1))
}

export function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function formatTransactionCount(count: number, descriptor = 'transaction') {
  return formatCount(count, descriptor)
}
