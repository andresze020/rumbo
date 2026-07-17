/**
 * BR-021 — Month health score.
 *
 * A transparent, documented 0–100 score (previously a labelled "demo"
 * heuristic). Two components, each mapped to 0–100 and combined with fixed
 * weights so the number is explainable rather than a black box:
 *
 *   1. Savings rate (weight 65%). Linear: −20% → 0, 0% → 50, +20%+ → 100.
 *      A missing savings rate (no income yet) is treated as neutral (50).
 *   2. Budget adherence (weight 35%, only when a budget exists). Within budget
 *      (≤100% used) → 100; degrades linearly to 0 by 150% used.
 *
 * When there is no budget the score is the savings component alone. The grade
 * bands are shared with the dashboard and month-review surfaces.
 *
 * This is a guidance metric, not financial advice — but it is now a real,
 * reproducible formula, not a mock.
 */

export const HEALTH_SAVINGS_WEIGHT = 0.65
export const HEALTH_BUDGET_WEIGHT = 0.35

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

/** Savings-rate sub-score (0–100). null rate → neutral 50. */
export function savingsComponent(savingsRate: number | null): number {
  if (savingsRate == null || !Number.isFinite(savingsRate)) return 50
  // −20% → 0, 0% → 50, +20% → 100
  return clamp01((savingsRate + 0.2) / 0.4) * 100
}

/** Budget-adherence sub-score (0–100). ≤100% used → 100, 150%+ → 0. */
export function budgetComponent(budgetPercent: number): number {
  if (!Number.isFinite(budgetPercent)) return 100
  return clamp01(1 - Math.max(0, budgetPercent - 1) / 0.5) * 100
}

export type HealthScoreInput = {
  savingsRate: number | null
  hasBudget: boolean
  /** actual / planned for the month's budget (only read when hasBudget). */
  budgetPercent: number
}

/**
 * Combined month-health score (0–100, integer). Weighted savings + budget
 * adherence, renormalised to savings-only when there is no budget.
 */
export function computeHealthScore({
  savingsRate,
  hasBudget,
  budgetPercent,
}: HealthScoreInput): number {
  const savings = savingsComponent(savingsRate)
  const raw = hasBudget
    ? HEALTH_SAVINGS_WEIGHT * savings + HEALTH_BUDGET_WEIGHT * budgetComponent(budgetPercent)
    : savings
  return Math.round(Math.max(0, Math.min(100, raw)))
}

/** Shared letter grade for a 0–100 score. */
export function healthGrade(score: number): string {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B+'
  if (score >= 60) return 'B'
  if (score >= 50) return 'C+'
  if (score >= 40) return 'C'
  return 'D'
}
