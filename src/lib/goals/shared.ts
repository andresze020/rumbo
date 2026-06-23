// Pure, dependency-free helpers for goals, shared between the server (page +
// actions) and the client form. No 'use server'/'use client'.

export const GOAL_TYPES = [
  { value: 'emergency_fund', label: 'Emergency fund' },
  { value: 'debt_payoff', label: 'Debt payoff' },
  { value: 'down_payment', label: 'Down payment' },
  { value: 'travel', label: 'Travel' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'custom', label: 'Custom' },
] as const

export type GoalType = (typeof GOAL_TYPES)[number]['value']

export const GOAL_STATUSES = ['active', 'paused', 'completed', 'archived'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

const GOAL_TYPE_VALUES = GOAL_TYPES.map((t) => t.value)

const GOAL_TYPE_LABELS: Record<GoalType, string> = Object.fromEntries(
  GOAL_TYPES.map((t) => [t.value, t.label])
) as Record<GoalType, string>

export function isGoalType(value: string): value is GoalType {
  return (GOAL_TYPE_VALUES as readonly string[]).includes(value)
}

export function isGoalStatus(value: string): value is GoalStatus {
  return (GOAL_STATUSES as readonly string[]).includes(value)
}

export function goalTypeLabel(goalType: string): string {
  return GOAL_TYPE_LABELS[goalType as GoalType] ?? goalType
}

/** Progress toward the target, clamped to [0, 1]; null when there is no target. */
export function goalProgress(currentAmount: number, targetAmount: number): number {
  if (targetAmount <= 0) return 0
  return Math.min(1, Math.max(0, currentAmount / targetAmount))
}

/** A goal is complete once its current amount meets or exceeds its target. */
export function isGoalReached(currentAmount: number, targetAmount: number): boolean {
  return targetAmount > 0 && currentAmount >= targetAmount
}
