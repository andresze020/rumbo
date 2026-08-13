/**
 * BR-030 — credit-card statement cycle date math.
 *
 * Pure, dependency-free, and operates on `YYYY-MM-DD` strings in UTC, matching
 * `lib/recurring/shared.ts`. No 'use server' / 'use client': the account form
 * needs this on the client to preview the cycle windows *before an account
 * exists*, which is the detail the App B recording showed and the reason this
 * lives in TypeScript at all.
 *
 * For an account that already exists, the windows shown on screen come from
 * `get_card_cycle_summaries`, not from here — the RPC computes the money and its
 * own window in one place, so the figures and the dates beside them can never
 * disagree. This helper deliberately answers only "what would the windows be",
 * never "how much is owed".
 */

function parseIso(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Last day of the month containing `year`/`month` (1-indexed month). */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * The given day of month, clamped to that month's last day — day 31 in February
 * resolves to the 28th or 29th rather than spilling into March. Mirrors
 * `card_cycle_day_in_month` in the migration exactly; the two must agree.
 *
 * `monthOffset` shifts whole months from the anchor, which is how the callers
 * below express "the month after the statement closed".
 */
export function cycleDayInMonth(
  anchorIso: string,
  day: number,
  monthOffset = 0
): string {
  const { year, month } = parseIso(anchorIso)
  // Normalise through a Date so a monthOffset crossing a year boundary works.
  const target = new Date(Date.UTC(year, month - 1 + monthOffset, 1))
  const targetYear = target.getUTCFullYear()
  const targetMonth = target.getUTCMonth() + 1
  const clamped = Math.min(day, lastDayOfMonth(targetYear, targetMonth))
  return toIso(new Date(Date.UTC(targetYear, targetMonth - 1, clamped)))
}

function addDays(iso: string, days: number): string {
  const { year, month, day } = parseIso(iso)
  return toIso(new Date(Date.UTC(year, month - 1, day + days)))
}

export type CardCycle = {
  /** The statement that has already closed — this is what becomes payable. */
  closedPeriodStart: string
  closedPeriodEnd: string
  closedPaymentDue: string
  /** The cycle still accumulating charges; not billed yet. */
  openPeriodStart: string
  openPeriodEnd: string
  openPaymentDue: string
}

/**
 * Resolve both cycle windows for a card, as of `asOfIso`.
 *
 * The payment falls on `paymentDay` of the month **after** the statement closes,
 * which is how both benchmark cards read (close 06-30 → pay 07-01). A card whose
 * payment day is earlier in the month than its statement day therefore still
 * gets a due date after the close, not before it.
 */
export function resolveCardCycle(
  statementDay: number,
  paymentDay: number,
  asOfIso: string
): CardCycle {
  // If this month's close has not arrived yet, the most recent closed statement
  // is last month's.
  const closeThisMonth = cycleDayInMonth(asOfIso, statementDay)
  const closedPeriodEnd =
    closeThisMonth <= asOfIso
      ? closeThisMonth
      : cycleDayInMonth(asOfIso, statementDay, -1)

  return {
    // The closed statement began the day after the close before it.
    closedPeriodStart: addDays(cycleDayInMonth(closedPeriodEnd, statementDay, -1), 1),
    closedPeriodEnd,
    closedPaymentDue: cycleDayInMonth(closedPeriodEnd, paymentDay, 1),
    openPeriodStart: addDays(closedPeriodEnd, 1),
    openPeriodEnd: cycleDayInMonth(closedPeriodEnd, statementDay, 1),
    openPaymentDue: cycleDayInMonth(closedPeriodEnd, paymentDay, 2),
  }
}

/** Account types a statement cycle is meaningful for — mirrors
 * `accounts_cycle_type_chk`. */
export const CARD_CYCLE_TYPES = ['credit_card', 'debt'] as const

export function supportsCardCycle(accountType: string): boolean {
  return (CARD_CYCLE_TYPES as readonly string[]).includes(accountType)
}

/** 1–31, or null when the field is blank / not a usable day. */
export function parseCycleDay(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) return null
  return parsed
}
