// BR-035 — pure helpers for installment plans, shared between the server page
// and the client form. No 'use server' / 'use client'.
//
// These must agree with `create_installment_plan` in
// `20260730150000_br_035_installment_plans.sql`: the form previews the split the
// RPC is about to write, and a preview that disagreed with what got saved would
// be worse than no preview at all. Both are deliberately short enough to compare
// side by side.

export type InstallmentSplit = {
  /** Amount of every installment except the last. */
  perInstallment: number
  /** The last one, which absorbs the rounding remainder. */
  lastInstallment: number
  /** Always exactly the original total. */
  total: number
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Divide `total` into `count` installments.
 *
 * `total / count` rarely divides evenly, so every installment gets the same
 * rounded amount and the **last** one absorbs the remainder. That is what makes
 * the N amounts sum to the original total exactly — BR-035's first verification,
 * and the thing a household actually checks against its card statement.
 */
export function splitInstallments(total: number, count: number): InstallmentSplit {
  const roundedTotal = roundToCents(total)
  const perInstallment = roundToCents(roundedTotal / count)
  const lastInstallment = roundToCents(roundedTotal - perInstallment * (count - 1))
  return { perInstallment, lastInstallment, total: roundedTotal }
}

/**
 * The date of installment `number` (1-based) in a plan starting `startIso`.
 *
 * The day is clamped to the target month's last day, so a plan starting Jan 31
 * bills Feb 28 rather than skipping to Mar 3 — the same rule the SQL uses, and
 * the same rule `advance_recurring_next_run` applies to monthly frequencies.
 */
export function installmentDate(startIso: string, number: number): string {
  const [year, month, day] = startIso.split('-').map(Number)
  const targetMonthIndex = month - 1 + (number - 1)
  const lastDay = new Date(Date.UTC(year, targetMonthIndex + 1, 0)).getUTCDate()
  const clampedDay = Math.min(day, lastDay)
  return new Date(Date.UTC(year, targetMonthIndex, clampedDay))
    .toISOString()
    .slice(0, 10)
}

export const INSTALLMENT_STATUSES = ['active', 'completed', 'cancelled'] as const
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number]
