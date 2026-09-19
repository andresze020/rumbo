'use client'

import { HouseholdChip } from '@/components/household-chip'
import { useLanguage } from '@/components/language-provider'
import { PeriodSelector } from './period-selector'

type TransactionsHeaderProps = {
  householdName: string
  periodLabel: string
  periodShortLabel: string
  periodMonth: string
  isCustomRange: boolean
  monthHrefTemplate: string
  allTimeHref: string
}

/**
 * Two short rows instead of the old eyebrow + title + description block: the
 * household became a chip, the description went (the list under it says what
 * this screen is), and the period moved up beside the title where it is both
 * visible and tappable.
 */
export function TransactionsHeader({
  householdName,
  periodLabel,
  periodShortLabel,
  periodMonth,
  isCustomRange,
  monthHrefTemplate,
  allTimeHref,
}: TransactionsHeaderProps) {
  const { t } = useLanguage()

  return (
    <header className="space-y-1">
      <HouseholdChip name={householdName} className="-ml-1.5" />

      <div className="flex min-w-0 items-center justify-between gap-2">
        <h1 className="min-w-0 shrink-0 truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {t('nav.transactions')}
        </h1>
        <PeriodSelector
          label={periodLabel}
          shortLabel={periodShortLabel}
          month={periodMonth}
          isCustomRange={isCustomRange}
          monthHrefTemplate={monthHrefTemplate}
          allTimeHref={allTimeHref}
        />
      </div>
    </header>
  )
}
