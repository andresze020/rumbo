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
 * RUM-009 — what the user should do next, derived from the weakest component.
 *
 * - `rein_in_budget`: budget adherence is strictly the weakest component.
 * - `record_income`: no savings rate yet (no income this month), so the
 *   savings component sits at the neutral 50.
 * - `raise_savings`: savings is the weakest component and below 100.
 * - `set_budget`: savings is maxed but there is no budget to measure against.
 * - `keep_going`: every component is at 100.
 */
export type HealthAction =
  | 'record_income'
  | 'raise_savings'
  | 'rein_in_budget'
  | 'set_budget'
  | 'keep_going'

export type HealthBreakdown = {
  score: number
  grade: string
  savings: {
    /** Month savings rate (0.1 = 10%), or null with no income. */
    rate: number | null
    /** Sub-score 0–100. */
    points: number
    /** Effective weight in the final score (1 when there is no budget). */
    weight: number
  }
  /** null when the month has no budget: the score is savings-only. */
  budget: {
    /** actual / planned (1 = 100% of the plan used). */
    percentUsed: number
    points: number
    weight: number
  } | null
  weakest: 'savings' | 'budget'
  action: HealthAction
}

/**
 * Full, explainable month-health result. The dashboard and Month review both
 * render from this so the number, its inputs and the suggested action can
 * never disagree between surfaces.
 */
export function healthBreakdown({
  savingsRate,
  hasBudget,
  budgetPercent,
}: HealthScoreInput): HealthBreakdown {
  const rate = savingsRate == null || !Number.isFinite(savingsRate) ? null : savingsRate
  const savingsPoints = savingsComponent(rate)
  const budget = hasBudget
    ? {
        percentUsed: budgetPercent,
        points: budgetComponent(budgetPercent),
        weight: HEALTH_BUDGET_WEIGHT,
      }
    : null
  const savings = {
    rate,
    points: savingsPoints,
    weight: budget ? HEALTH_SAVINGS_WEIGHT : 1,
  }

  const raw = budget
    ? savings.weight * savings.points + budget.weight * budget.points
    : savings.points
  const score = Math.round(Math.max(0, Math.min(100, raw)))

  const weakest: HealthBreakdown['weakest'] =
    budget && budget.points < savings.points ? 'budget' : 'savings'

  let action: HealthAction
  if (weakest === 'budget') action = 'rein_in_budget'
  else if (rate == null) action = 'record_income'
  else if (savings.points < 100) action = 'raise_savings'
  else if (!budget) action = 'set_budget'
  else action = 'keep_going'

  return { score, grade: healthGrade(score), savings, budget, weakest, action }
}

/**
 * Combined month-health score (0–100, integer). Weighted savings + budget
 * adherence, renormalised to savings-only when there is no budget.
 */
export function computeHealthScore(input: HealthScoreInput): number {
  return healthBreakdown(input).score
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
