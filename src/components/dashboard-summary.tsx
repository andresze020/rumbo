import { formatCurrency, formatPercent } from '@/lib/format'
import { translate } from '@/lib/i18n/translate'
import type { Locale } from '@/lib/i18n/dictionaries'

const NEAR_LIMIT_THRESHOLD = 0.8

function budgetSentence(locale: Locale, totalBudgetPercent: number) {
  const used = formatPercent(totalBudgetPercent)
  if (totalBudgetPercent > 1) {
    return translate(locale, 'dashboardSummary.overBudget', { percent: used })
  }
  if (totalBudgetPercent >= NEAR_LIMIT_THRESHOLD) {
    return translate(locale, 'dashboardSummary.nearLimit', { percent: used })
  }
  return translate(locale, 'dashboardSummary.onTrack', { percent: used })
}

export function DashboardSummary({
  monthlyExpenses,
  expensesDelta,
  hasBudget,
  totalBudgetPercent,
  currency,
  locale,
}: {
  monthlyExpenses: number
  /** Difference vs last month (this month minus last month), or null if no prior data. */
  expensesDelta: number | null
  hasBudget: boolean
  totalBudgetPercent: number
  currency: string
  locale: Locale
}) {
  const spentLabel = formatCurrency(monthlyExpenses, currency)

  let deltaPhrase = ''
  if (expensesDelta !== null && Math.abs(expensesDelta) >= 0.01) {
    const diffLabel = formatCurrency(Math.abs(expensesDelta), currency)
    deltaPhrase = expensesDelta > 0
      ? ` — ${translate(locale, 'dashboardSummary.moreThanLastMonth', { amount: diffLabel })}`
      : ` — ${translate(locale, 'dashboardSummary.lessThanLastMonth', { amount: diffLabel })}`
  }

  return (
    <p className="text-sm text-muted-foreground">
      {translate(locale, 'dashboardSummary.spent')}{' '}
      <span className="font-semibold text-foreground">{spentLabel}</span>
      {deltaPhrase}. {hasBudget ? budgetSentence(locale, totalBudgetPercent) : null}
    </p>
  )
}
