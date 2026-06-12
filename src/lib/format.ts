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

/**
 * Returns the narrow currency symbol for a code (e.g. "$" for USD/CAD, "€"
 * for EUR), falling back to the code itself for unknown currencies. Used to
 * prefix amount inputs so users see which currency they're entering.
 */
export function getCurrencySymbol(currencyCode: string) {
  try {
    const parts = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0)
    return parts.find((part) => part.type === 'currency')?.value ?? currencyCode
  } catch {
    return currencyCode
  }
}

const thousandsFormatter = new Intl.NumberFormat(LOCALE, {
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
