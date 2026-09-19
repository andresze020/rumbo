'use client'

import { useLanguage } from '@/components/language-provider'
import type { TransactionPeriod } from '@/lib/periods/transaction-period'
import { PeriodSelector } from './period-selector'

type TransactionsHeaderProps = {
  period: TransactionPeriod
  periodLabel: string
  /** Every applied filter except the period, as a query string. */
  periodBaseQuery: string
}

/**
 * One line: the screen's name and the period it is showing.
 *
 * The household used to sit above this in a row of its own. It lives in the
 * app's top bar now, beside the Rumbo mark, where it belongs — this screen is
 * not the only one scoped to a household.
 */
export function TransactionsHeader({
  period,
  periodLabel,
  periodBaseQuery,
}: TransactionsHeaderProps) {
  const { t } = useLanguage()

  return (
    // Wraps rather than overflows: at 320px a long period label ("Last 6
    // months") drops onto its own line under the title instead of colliding
    // with it or pushing a horizontal scrollbar onto the page.
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h1 className="min-w-0 shrink-0 truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {t('nav.transactions')}
      </h1>
      <PeriodSelector
        period={period}
        label={periodLabel}
        baseQuery={periodBaseQuery}
      />
    </header>
  )
}
