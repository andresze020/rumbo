import Link from 'next/link'
import { AccountAvatar } from '@/components/account-avatar'
import { StatusBadge } from '@/components/status-badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCurrency, formatLabel } from '@/lib/format'

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

type DebtCardProps = {
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

function formatPercent(value: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value)
}

/**
 * Card representation of a single debt — matches the Deudas design: an account
 * glyph, rate / due metadata, the outstanding balance, a paydown bar and the
 * primary actions. Display only; all values are pre-computed by the page.
 */
export function DebtCard({
  debt,
  account,
  currentBalance,
  baseCurrency,
  paydownPercent,
  canRegisterPayment,
  noSourceAccounts,
  editHref,
  payHref,
}: DebtCardProps) {
  const currency = account?.currency_code ?? baseCurrency
  const isInactive = debt.status === 'inactive'

  const rateLabel = debt.interest_rate
    ? `${debt.interest_rate}%${debt.interest_rate_period ? ` ${formatLabel(debt.interest_rate_period)}` : ''}`
    : null
  const dueLabel = debt.payment_due_day ? `Due day ${debt.payment_due_day}` : null
  const metaLabel = [rateLabel, dueLabel].filter(Boolean).join(' · ') || 'No rate or due day set'

  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border bg-card p-5 shadow-sm shadow-black/[0.03]',
        isInactive && 'opacity-75'
      )}
    >
      <div className="flex items-start gap-3">
        <AccountAvatar accountType={account?.account_type ?? 'debt'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{debt.name}</p>
            {isInactive ? <StatusBadge status={debt.status} /> : null}
          </div>
          <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">{metaLabel}</p>
        </div>
      </div>

      <p className="mt-3.5 font-mono text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
        {formatCurrency(currentBalance, currency)}
      </p>

      {paydownPercent !== null ? (
        <>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.round(paydownPercent * 100)}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular-nums">{formatPercent(paydownPercent)} paid off</span>
            {debt.minimum_payment ? (
              <span className="tabular-nums">Min {formatCurrency(debt.minimum_payment, currency)}</span>
            ) : null}
          </div>
        </>
      ) : debt.minimum_payment ? (
        <p className="mt-2.5 text-xs text-muted-foreground tabular-nums">
          Min payment {formatCurrency(debt.minimum_payment, currency)}
        </p>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3.5">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {debt.lender_name ?? account?.name ?? 'Liability account'}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link href={editHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Edit
          </Link>
          {!isInactive && canRegisterPayment ? (
            <Link href={payHref} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Pay
            </Link>
          ) : !isInactive ? (
            <span className="text-xs text-muted-foreground">
              {noSourceAccounts ? 'No source acct.' : 'Paid off'}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
