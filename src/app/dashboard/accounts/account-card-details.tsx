'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

type AccountCardDetailsProps = {
  accountId: string
  postedLabel: string
  pendingLabel: string
  projectedLabel: string
  balanceType: 'posted' | 'owed'
  institutionName: string | null
  lastFour: string | null
  includeInNetWorth: boolean
  hasOpeningBalance: boolean
}

export function AccountCardDetails({
  accountId,
  postedLabel,
  pendingLabel,
  projectedLabel,
  balanceType,
  institutionName,
  lastFour,
  includeInNetWorth,
  hasOpeningBalance,
}: AccountCardDetailsProps) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        <ChevronDown
          className={`size-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
        {open ? 'Hide details' : 'Details'}
      </button>

      <div
        className={`grid transition-all duration-200 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 pt-2">
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

            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {institutionName ? <span>{institutionName}</span> : null}
              {lastFour ? <span>**** {lastFour}</span> : null}
              <span>{includeInNetWorth ? 'Included in net worth' : 'Excluded from net worth'}</span>
              {hasOpeningBalance ? <span>Opening balance set</span> : <span className="text-amber-600 dark:text-amber-400">No opening balance</span>}
            </div>

            <Link
              href={`/dashboard/transactions?account_id=${accountId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View transactions →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
