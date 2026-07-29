'use client'

import { useEffect, useState } from 'react'
import { formatIsoDate, shiftIsoDate, todayIsoDateLocal } from '@/lib/format'
import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'

/**
 * BR-033 — one-tap chips for the three dates that cover most manual entry
 * (today / yesterday / two days ago), so the common case never opens the
 * native date picker. The picker still overrides: these only write into the
 * same `transaction_date` state the calendar control edits.
 *
 * "Today" is the **viewer's** calendar day (`todayIsoDateLocal`), not UTC, and
 * a re-check every minute keeps a form left open across midnight from stranding
 * a stale "Today".
 */
export function RelativeDateChips({
  value,
  onSelect,
  className,
}: {
  /** Currently selected ISO date (`YYYY-MM-DD`). */
  value: string
  onSelect: (iso: string) => void
  className?: string
}) {
  const { t, locale } = useLanguage()
  const [today, setToday] = useState(() => todayIsoDateLocal())

  useEffect(() => {
    const id = window.setInterval(() => {
      setToday((current) => {
        const now = todayIsoDateLocal()
        return now === current ? current : now
      })
    }, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const chips = [
    { iso: today, label: t('transactionForm.dateToday') },
    { iso: shiftIsoDate(today, -1), label: t('transactionForm.dateYesterday') },
    { iso: shiftIsoDate(today, -2), label: t('transactionForm.dateTwoDaysAgo') },
  ]

  return (
    <div className={cn('flex gap-1.5', className)} role="group">
      {chips.map((chip) => {
        const isActive = value === chip.iso
        return (
          <button
            key={chip.iso}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(chip.iso)}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center rounded-lg border px-2 py-1.5 text-[11px] font-medium leading-tight transition-colors',
              isActive
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <span className="truncate">{chip.label}</span>
            <span className="truncate text-[10px] font-normal opacity-70">
              {formatIsoDate(chip.iso, locale, { month: 'short', day: 'numeric' })}
            </span>
          </button>
        )
      })}
    </div>
  )
}
