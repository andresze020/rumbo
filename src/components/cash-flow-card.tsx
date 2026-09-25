import Link from 'next/link'
import type { ReactNode } from 'react'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

type CashFlowStat = {
  label: string
  amount: number
  /** Change vs the previous month, already formatted (or null when not comparable). */
  delta: ReactNode
  tone?: 'default' | 'negative'
}

type CashFlowCardProps = {
  title: string
  currency: string
  income: CashFlowStat
  spent: CashFlowStat
  saved: CashFlowStat
  /** Spent ÷ income (0.94 = 94 %), or null with no income. */
  spentShare: number | null
  /** One line under the bar: "94 % of income spent · 6.0 % saved". */
  barCaption: string
  review: { href: string; label: string } | null
  trends: { href: string; label: string }
  /** Footer slot: the Month health line. */
  footer?: ReactNode
}

/**
 * The month at a glance, in one card: what came in, what went out, what was
 * kept, and how much of the income the spending used. Replaces four separate
 * KPI tiles whose captions ("5 posted income transactions", "Income minus
 * expenses") repeated what the numbers already say (2026-09-25 redesign).
 */
export function CashFlowCard({
  title,
  currency,
  income,
  spent,
  saved,
  spentShare,
  barCaption,
  review,
  trends,
  footer,
}: CashFlowCardProps) {
  const share = spentShare === null ? null : Math.max(0, spentShare)
  const barTone =
    share === null ? 'bg-muted' : share > 1 ? 'bg-rose-500' : share >= 0.9 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <section aria-labelledby="cash-flow-title" className="rounded-2xl border bg-card shadow-sm shadow-black/[0.03]">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <h2 id="cash-flow-title" className="text-sm font-semibold">
          {title}
        </h2>
        <div className="flex min-w-0 items-center gap-3">
          {review ? (
            <Link
              href={review.href}
              className="truncate rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
            >
              {review.label}
            </Link>
          ) : null}
          <Link href={trends.href} className="shrink-0 text-xs font-semibold text-primary hover:underline">
            {trends.label} →
          </Link>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 px-4 pt-3 sm:gap-4 sm:px-5">
        {[income, spent, saved].map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd
              className={cn(
                'mt-0.5 truncate text-lg font-semibold tracking-tight tabular-nums sm:text-2xl',
                stat.tone === 'negative' && 'text-rose-600 dark:text-rose-400'
              )}
            >
              {formatCurrency(stat.amount, currency)}
            </dd>
            <dd className="mt-0.5 min-h-4 truncate text-[11px] leading-4">{stat.delta}</dd>
          </div>
        ))}
      </dl>

      <div className="px-4 pb-4 pt-3 sm:px-5">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          {share !== null ? (
            <div className={cn('h-full rounded-full', barTone)} style={{ width: `${Math.min(100, Math.round(share * 100))}%` }} />
          ) : null}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{barCaption}</p>
      </div>

      {footer ? <div className="border-t px-4 py-3 sm:px-5">{footer}</div> : null}
    </section>
  )
}
