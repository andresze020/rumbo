import { formatCurrency, formatPercent } from '@/lib/format'

const NEAR_LIMIT_THRESHOLD = 0.8

function budgetSentence(totalBudgetPercent: number) {
  const used = formatPercent(totalBudgetPercent)
  if (totalBudgetPercent > 1) {
    return `You've gone over budget (${used} used).`
  }
  if (totalBudgetPercent >= NEAR_LIMIT_THRESHOLD) {
    return `You're close to your budget limit (${used} used).`
  }
  return `You're on track with your budget (${used} used).`
}

export function DashboardSummary({
  monthlyExpenses,
  expensesDelta,
  hasBudget,
  totalBudgetPercent,
  currency,
}: {
  monthlyExpenses: number
  /** Difference vs last month (this month minus last month), or null if no prior data. */
  expensesDelta: number | null
  hasBudget: boolean
  totalBudgetPercent: number
  currency: string
}) {
  const spentLabel = formatCurrency(monthlyExpenses, currency)

  let deltaPhrase = ''
  if (expensesDelta !== null && Math.abs(expensesDelta) >= 0.01) {
    const diffLabel = formatCurrency(Math.abs(expensesDelta), currency)
    deltaPhrase = expensesDelta > 0 ? ` — ${diffLabel} more than last month` : ` — ${diffLabel} less than last month`
  }

  return (
    <p className="text-sm text-muted-foreground">
      This month you&apos;ve spent <span className="font-semibold text-foreground">{spentLabel}</span>
      {deltaPhrase}. {hasBudget ? budgetSentence(totalBudgetPercent) : null}
    </p>
  )
}
