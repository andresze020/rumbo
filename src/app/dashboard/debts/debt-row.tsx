'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'

type Debt = {
  id: string
  account_id: string
  name: string
  lender_name: string | null
  original_principal: number | string | null
  interest_rate: number | string | null
  interest_rate_period: string | null
  minimum_payment: number | string | null
  payment_due_day: number | string | null
  status: string
  notes: string | null
}

type Account = {
  id: string
  name: string
  account_type: string
  currency_code: string
  include_in_net_worth: boolean
}

type DebtRowProps = {
  debt: Debt
  account: Account | undefined
  currentBalance: number
  baseCurrency: string
  paydownPercent: number | null
  canRegisterPayment: boolean
  noSourceAccounts: boolean
  editHref: string
  payHref: string
}

function formatCurrency(value: number | string, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(value))
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value)
}

function formatDueDay(value: number | string | null) {
  return value ? `Day ${value}` : 'Not set'
}

export function DebtRow({
  debt,
  account,
  currentBalance,
  baseCurrency,
  paydownPercent,
  canRegisterPayment,
  noSourceAccounts,
  editHref,
  payHref,
}: DebtRowProps) {
  const [open, setOpen] = useState(false)
  const currency = account?.currency_code ?? baseCurrency

  return (
    <div className={debt.status === 'inactive' ? 'bg-muted/20' : ''}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={open}
      >
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-sm font-medium ${debt.status === 'inactive' ? 'text-muted-foreground' : ''}`}
            >
              {debt.name}
            </span>
            <StatusBadge status={debt.status} />
          </div>
          {debt.lender_name ? (
            <p className="text-xs text-muted-foreground">{debt.lender_name}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">
              {formatCurrency(currentBalance, currency)}
            </p>
            <p className="text-xs text-muted-foreground">outstanding</p>
          </div>
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </div>
      </button>

      <div
        className={`grid transition-all duration-200 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="mx-4 mb-4 space-y-3 rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              {account?.name ?? 'Missing account'} &middot;{' '}
              {account?.account_type ?? 'debt'} &middot; {currency}
              {account && !account.include_in_net_worth
                ? ' · Excluded from net worth'
                : ''}
            </p>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border bg-background p-2.5">
                <p className="text-xs text-muted-foreground">Original principal</p>
                <p className="mt-0.5 text-sm font-medium">
                  {debt.original_principal
                    ? formatCurrency(debt.original_principal, currency)
                    : 'Not set'}
                </p>
              </div>
              <div className="rounded-md border bg-background p-2.5">
                <p className="text-xs text-muted-foreground">Interest</p>
                <p className="mt-0.5 text-sm font-medium">
                  {debt.interest_rate
                    ? `${debt.interest_rate}% ${debt.interest_rate_period ?? ''}`.trim()
                    : 'Not set'}
                </p>
              </div>
              <div className="rounded-md border bg-background p-2.5">
                <p className="text-xs text-muted-foreground">Min. payment</p>
                <p className="mt-0.5 text-sm font-medium">
                  {debt.minimum_payment
                    ? formatCurrency(debt.minimum_payment, currency)
                    : 'Not set'}
                </p>
              </div>
              <div className="rounded-md border bg-background p-2.5">
                <p className="text-xs text-muted-foreground">Due day</p>
                <p className="mt-0.5 text-sm font-medium">
                  {formatDueDay(debt.payment_due_day)}
                </p>
              </div>
            </div>

            {paydownPercent !== null ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Principal paid down</span>
                  <span className="font-medium">{formatPercent(paydownPercent)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round(paydownPercent * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}

            {debt.notes ? (
              <p className="text-xs text-muted-foreground">{debt.notes}</p>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              <Link
                href={editHref}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Edit
              </Link>
              {debt.status === 'active' ? (
                canRegisterPayment ? (
                  <Link
                    href={payHref}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    Register payment
                  </Link>
                ) : (
                  <span className="self-center text-xs text-muted-foreground">
                    {noSourceAccounts
                      ? 'No matching asset account.'
                      : 'Fully paid off.'}
                  </span>
                )
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
