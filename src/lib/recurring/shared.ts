// Pure, dependency-free helpers for recurring transactions, shared between the
// server (page + actions) and the client form. No 'use server'/'use client'.

/** UC-9 added `transfer`; a transfer template carries a destination account
 * instead of a category. */
export const RECURRING_TYPES = ['income', 'expense', 'transfer'] as const
export type RecurringType = (typeof RECURRING_TYPES)[number]

/** A transfer template has a From/To account pair and no category. */
export function isTransferType(value: string): boolean {
  return value === 'transfer'
}

export const RECURRING_FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice a month (1st & 15th)' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
] as const

export type Frequency = (typeof RECURRING_FREQUENCIES)[number]['value']

const FREQUENCY_VALUES = RECURRING_FREQUENCIES.map((f) => f.value)

const FREQUENCY_LABELS: Record<Frequency, string> = Object.fromEntries(
  RECURRING_FREQUENCIES.map((f) => [f.value, f.label])
) as Record<Frequency, string>

export function isRecurringType(value: string): value is RecurringType {
  return (RECURRING_TYPES as readonly string[]).includes(value)
}

export function isFrequency(value: string): value is Frequency {
  return (FREQUENCY_VALUES as readonly string[]).includes(value)
}

export function frequencyLabel(frequency: string): string {
  return FREQUENCY_LABELS[frequency as Frequency] ?? frequency
}

// ── Date math (UTC-safe; operates on YYYY-MM-DD strings) ──────────────────────

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Add whole months, clamping the day to the target month's last day
 * (e.g. Jan 31 + 1mo → Feb 28; used for monthly/quarterly/yearly). */
function addMonthsClamped(date: Date, months: number): void {
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const lastDayOfMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate()
  date.setUTCDate(Math.min(day, lastDayOfMonth))
}

/**
 * Compute the next run date for a recurring template, given the date it last
 * ran (or its start date). Returns a YYYY-MM-DD string.
 *
 * `semimonthly` posts twice a month: days 1–14 advance to the 15th of the same
 * month; the 15th onward advances to the 1st of the next month.
 */
export function computeNextRunDate(fromIso: string, frequency: Frequency): string {
  const date = parseIsoDate(fromIso)

  switch (frequency) {
    case 'daily':
      date.setUTCDate(date.getUTCDate() + 1)
      break
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7)
      break
    case 'biweekly':
      date.setUTCDate(date.getUTCDate() + 14)
      break
    case 'semimonthly':
      if (date.getUTCDate() < 15) {
        date.setUTCDate(15)
      } else {
        date.setUTCDate(1)
        date.setUTCMonth(date.getUTCMonth() + 1)
      }
      break
    case 'monthly':
      addMonthsClamped(date, 1)
      break
    case 'quarterly':
      addMonthsClamped(date, 3)
      break
    case 'yearly':
      addMonthsClamped(date, 12)
      break
  }

  return toIsoDate(date)
}

/** Today's date as a YYYY-MM-DD string (UTC), matching the rest of the app. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/** A YYYY-MM-DD string `days` after `fromIso` (UTC-safe). */
export function addDaysIso(fromIso: string, days: number): string {
  const [y, m, d] = fromIso.split('-').map(Number)
  return toIsoDate(new Date(Date.UTC(y, m - 1, d + days)))
}

/**
 * Project a template's upcoming occurrence dates from `fromIso` (its
 * `next_run_date`) forward, up to and including `horizonIso`, stopping at
 * `endIso` if the template ends sooner. `maxCount` caps runaway daily series.
 * Returns YYYY-MM-DD strings in ascending order.
 */
export function projectOccurrences(
  fromIso: string,
  frequency: Frequency,
  horizonIso: string,
  endIso: string | null = null,
  maxCount = 60
): string[] {
  const dates: string[] = []
  const limit = endIso && endIso < horizonIso ? endIso : horizonIso
  let current = fromIso
  for (let i = 0; i < maxCount && current <= limit; i += 1) {
    dates.push(current)
    current = computeNextRunDate(current, frequency)
  }
  return dates
}

/** Advance a run date forward by `frequency` until it is strictly after
 * `today`, so reactivating or posting never schedules a date in the past. */
export function advanceUntilFuture(
  fromIso: string,
  frequency: Frequency,
  today: string = todayIsoDate()
): string {
  let next = fromIso
  // Guard against pathological inputs; 1000 iterations covers daily over ~3 years.
  for (let i = 0; i < 1000 && next <= today; i += 1) {
    next = computeNextRunDate(next, frequency)
  }
  return next
}
