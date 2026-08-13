/**
 * BR-036 — the single shared period resolver.
 *
 * A "month" in this app has always been the calendar month. A household paid on
 * the 25th wants its periods to run 25th-to-24th instead. This module is the one
 * place that turns a `YYYY-MM` label plus a household's `month_start_day` into a
 * concrete date range.
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 * A period labelled `YYYY-MM` **starts** on `monthStartDay` of that month and
 * **ends the day before** the next period starts. Labelling by the starting month
 * is what makes "the period beginning with the July paycheque" read as July.
 *
 * Three properties fall out of deriving each end from the *next* start, and all
 * three are BR-036 verification items:
 *
 * 1. `monthStartDay = 1` reproduces the calendar month **exactly**, so a
 *    household that never touches the setting sees no change at all.
 * 2. Periods are **contiguous and non-overlapping** by construction — there is no
 *    arithmetic that could leave a gap or an overlap.
 * 3. Day clamping is safe. With `monthStartDay = 31`, January starts Jan 31 and
 *    February starts Feb 28, so the January period is Jan 31 – Feb 27 and the
 *    February period is Feb 28 – Mar 30. Still contiguous, still
 *    non-overlapping, because the end came from the next start rather than from
 *    the start plus a length.
 *
 * ── SCOPE (slice 1) ─────────────────────────────────────────────────────────
 * Only `/dashboard/reports` consumes this. Every monthly RPC still keys on
 * `date_trunc('month', ...)`. See the migration header for why, and do not
 * re-derive this logic when porting the rest — call this.
 *
 * Pure and dependency-free, operating on `YYYY-MM-DD` strings in UTC, matching
 * `lib/recurring/shared.ts` and `lib/cards/cycle.ts`.
 */

export const DEFAULT_MONTH_START_DAY = 1

export type Period = {
  /** Inclusive `YYYY-MM-DD`. */
  dateFrom: string
  /** Inclusive `YYYY-MM-DD`. */
  dateTo: string
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Parses a `YYYY-MM` label. */
function parseMonth(month: string): { year: number; month: number } {
  const [year, monthNumber] = month.split('-').map(Number)
  return { year, month: monthNumber }
}

/**
 * `monthStartDay` clamped into the month `label` names — day 31 in February
 * resolves to the 28th or 29th rather than spilling into March.
 */
export function periodStartDate(label: string, monthStartDay: number): string {
  const { year, month } = parseMonth(label)
  const day = Math.min(Math.max(monthStartDay, 1), lastDayOfMonth(year, month))
  return toIso(new Date(Date.UTC(year, month - 1, day)))
}

/** Shifts a `YYYY-MM` label by whole months. */
export function shiftPeriodLabel(label: string, delta: number): string {
  const { year, month } = parseMonth(label)
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * The full date range for the period labelled `label`.
 *
 * The end is the day before the *next* period starts, which is what guarantees
 * contiguity and makes day-clamping harmless.
 */
export function resolvePeriod(label: string, monthStartDay: number): Period {
  const dateFrom = periodStartDate(label, monthStartDay)
  const nextStart = periodStartDate(shiftPeriodLabel(label, 1), monthStartDay)

  const [year, month, day] = nextStart.split('-').map(Number)
  const dateTo = toIso(new Date(Date.UTC(year, month - 1, day - 1)))

  return { dateFrom, dateTo }
}

/** True when the household has moved off the calendar month. */
export function hasCustomMonthStart(monthStartDay: number): boolean {
  return monthStartDay !== DEFAULT_MONTH_START_DAY
}

/**
 * The period label that contains `iso` — the inverse of `resolvePeriod`.
 *
 * A date before the start day belongs to the *previous* label: with a start day
 * of 25, Jul 3 is inside the period that began Jun 25, which is labelled
 * `2026-06`.
 */
export function periodLabelForDate(iso: string, monthStartDay: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const startThisMonth = Math.min(monthStartDay, lastDayOfMonth(year, month))
  const label = `${year}-${String(month).padStart(2, '0')}`
  return day >= startThisMonth ? label : shiftPeriodLabel(label, -1)
}

/** Reads and validates a stored `month_start_day`, falling back to the default. */
export function parseMonthStartDay(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
    return DEFAULT_MONTH_START_DAY
  }
  return parsed
}
