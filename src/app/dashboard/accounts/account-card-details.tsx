'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown } from 'lucide-react'

type AccountCardDetailsProps = {
  accountId: string
  summaryLeft: ReactNode
  balanceLabel: string
  balanceSubLabel: string
  postedLabel: string
  pendingLabel: string
  projectedLabel: string
  balanceType: 'posted' | 'owed'
  institutionName: string | null
  lastFour: string | null
  includeInNetWorth: boolean
  hasOpeningBalance?: boolean
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

  const isOwed = balanceType === 'owed'

  return (
    <div>
      {/* Summary row — full row clickable */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-md text-left hover:bg-muted/50 transition-colors -mx-1 px-1 py-0.5"
        aria-expanded={open}
      >
        <div className="min-w-0 flex flex-wrap items-center gap-2">
          {summaryLeft}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <p className="text-base font-semibold leading-snug tabular-nums">{balanceLabel}</p>
            <p className="text-xs text-muted-foreground">{balanceSubLabel}</p>
          </div>
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </div>
      </button>

      {/* Expandable detail section */}
      <div
        className={`grid transition-all duration-200 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="mt-2 rounded-lg bg-muted/40 p-3 space-y-3">

            {/* Balance breakdown — 3 columns */}
            <div className="grid grid-cols-3 divide-x divide-border text-center">
              <div className="pr-3 space-y-0.5">
                <p className="text-xs text-muted-foreground">{isOwed ? 'Posted (owed)' : 'Posted'}</p>
                <p className="text-sm font-semibold tabular-nums">{postedLabel}</p>
              </div>
              <div className="px-3 space-y-0.5">
                <p className="text-xs text-muted-foreground">{isOwed ? 'Pending (owed)' : 'Pending'}</p>
                <p className="text-sm font-semibold tabular-nums">{pendingLabel}</p>
              </div>
              <div className="pl-3 space-y-0.5">
                <p className="text-xs text-muted-foreground">{isOwed ? 'Projected (owed)' : 'Projected'}</p>
                <p className="text-sm font-semibold tabular-nums">{projectedLabel}</p>
              </div>
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              {institutionName ? (
                <>
                  <span>{institutionName}</span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              {lastFour ? (
                <>
                  <span>**** {lastFour}</span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <span>{includeInNetWorth ? 'Included in net worth' : 'Excluded from net worth'}</span>
              {hasOpeningBalance !== undefined ? (
                <>
                  <span aria-hidden="true">·</span>
                  {hasOpeningBalance ? (
                    <span className="text-emerald-600 dark:text-emerald-400">✓ Opening balance</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">⚠ No opening balance</span>
                  )}
                </>
              ) : null}
            </div>

            {/* Footer: link + actions on same row */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/dashboard/transactions?account_id=${accountId}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <ArrowRight className="size-3" aria-hidden="true" />
                View transactions
              </Link>

              <div className="flex flex-wrap gap-1.5">
                {children}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
