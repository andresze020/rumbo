'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

type AccountCardDetailsProps = {
  accountId: string
  // summary (always visible)
  summaryLeft: ReactNode
  balanceLabel: string
  balanceSubLabel: string
  // detail content
  postedLabel: string
  pendingLabel: string
  projectedLabel: string
  balanceType: 'posted' | 'owed'
  institutionName: string | null
  lastFour: string | null
  includeInNetWorth: boolean
  hasOpeningBalance: boolean
  // action buttons passed from server component
  children: ReactNode
}

export function AccountCardDetails({
  accountId,
  summaryLeft,
  balanceLabel,
  balanceSubLabel,
  postedLabel,
  pendingLabel,
  projectedLabel,
  balanceType,
  institutionName,
  lastFour,
  includeInNetWorth,
  hasOpeningBalance,
  children,
}: AccountCardDetailsProps) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      {/* Summary row — always visible, single line */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex flex-wrap items-center gap-2">
          {summaryLeft}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-base font-semibold leading-snug">{balanceLabel}</p>
            <p className="text-xs text-muted-foreground">{balanceSubLabel}</p>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-expanded={open}
            aria-label={open ? 'Hide details' : 'Show details'}
          >
            <ChevronDown
              className={`size-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {/* Expandable detail section */}
      <div
        className={`grid transition-all duration-200 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 pt-3 border-t mt-3">
            {/* Balances */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{postedLabel}</span>
                {' '}{balanceType === 'owed' ? 'posted (owed)' : 'posted'}
              </span>
              <span>
                <span className="font-medium text-foreground">{pendingLabel}</span>
                {' '}{balanceType === 'owed' ? 'pending (owed)' : 'pending'}
              </span>
              <span>
                <span className="font-medium text-foreground">{projectedLabel}</span>
                {' '}{balanceType === 'owed' ? 'projected (owed)' : 'projected'}
              </span>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {institutionName ? <span>{institutionName}</span> : null}
              {lastFour ? <span>**** {lastFour}</span> : null}
              <span>{includeInNetWorth ? 'Included in net worth' : 'Excluded from net worth'}</span>
              {hasOpeningBalance
                ? <span>Opening balance set</span>
                : <span className="text-amber-600 dark:text-amber-400">No opening balance</span>}
            </div>

            {/* View transactions */}
            <Link
              href={`/dashboard/transactions?account_id=${accountId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View transactions →
            </Link>

            {/* Actions passed from server */}
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
