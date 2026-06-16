'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { BalanceAmount } from '@/components/balance-amount'
import { useLanguage } from '@/components/language-provider'

type AccountCardDetailsProps = {
  accountId: string
  summaryLeft: ReactNode
  balanceLabel: string
  /** Signed numeric balance — drives green (positive) / red (negative) coloring. */
  balanceAmount: number
  postedLabel: string
  pendingLabel: string
  projectedLabel: string
  balanceType: 'posted' | 'owed'
  baseCurrencyLabel?: string | null
}

export function AccountCardDetails({
  accountId,
  summaryLeft,
  balanceLabel,
  balanceAmount,
  postedLabel,
  pendingLabel,
  projectedLabel,
  balanceType,
  baseCurrencyLabel,
}: AccountCardDetailsProps) {
  const [open, setOpen] = useState(false)
  const { t } = useLanguage()

  const isOwed = balanceType === 'owed'

  return (
    <div>
      {/* Summary row — full row clickable */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="-mx-2 flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
        aria-expanded={open}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {summaryLeft}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <BalanceAmount
              label={balanceLabel}
              amount={balanceAmount}
              className="text-base leading-snug"
            />
            {baseCurrencyLabel ? (
              <p className="text-[11px] text-muted-foreground">≈ {baseCurrencyLabel}</p>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              {isOwed ? t('accounts.owed') : t('accounts.available')}
            </p>
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
                <p className="text-xs text-muted-foreground">{isOwed ? t('accounts.postedOwed') : t('accounts.posted')}</p>
                <p className="text-sm font-semibold tabular-nums">{postedLabel}</p>
              </div>
              <div className="px-3 space-y-0.5">
                <p className="text-xs text-muted-foreground">{isOwed ? t('accounts.pendingOwed') : t('accounts.pending')}</p>
                <p className="text-sm font-semibold tabular-nums">{pendingLabel}</p>
              </div>
              <div className="pl-3 space-y-0.5">
                <p className="text-xs text-muted-foreground">{isOwed ? t('accounts.projectedOwed') : t('accounts.projected')}</p>
                <p className="text-sm font-semibold tabular-nums">{projectedLabel}</p>
              </div>
            </div>

            {/* View transactions link */}
            <div className="flex items-center">
              <Link
                href={`/dashboard/transactions?account_id=${accountId}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <ArrowRight className="size-3" aria-hidden="true" />
                {t('accounts.viewTransactions')}
              </Link>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
