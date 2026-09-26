import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Money } from '@/components/dashboard/money'
import { cn } from '@/lib/utils'

type CashFlowStat = {
  label: string
  amount: number
  /** Change vs the previous month, already formatted (or null when not comparable). */
  delta: ReactNode
  tone?: 'default' | 'negative'
  /** Identity dot: income, spending, savings. */
  dot: string
}

type CashFlowCardProps = {
  title: string
  currency: string
  income: Omit<CashFlowStat, 'dot'>
  spent: Omit<CashFlowStat, 'dot'>
  saved: Omit<CashFlowStat, 'dot'>
  /** Spent ÷ income (0.94 = 94 %), or null with no income. */
  spentShare: number | null
  /** One line under the bar: "94 % of income spent · 6.0 % saved". */
  barCaption: string
  review: { href: string; label: string } | null
  trends: { href: string; label: string }
  /** Footer slot: the Month health block. */
  footer?: ReactNode
  className?: string
}

/**
 * The month at a glance (2026-09-25, restyled 2026-09-26): what came in, what
 * went out, what was kept, and how much of the income the spending used, as a
 * statement — label, amount, change — rather than three competing tiles.
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
  className,
}: CashFlowCardProps) {
  const share = spentShare === null ? null : Math.max(0, spentShare)
  const barTone =
    share === null ? 'bg-muted' : share > 1 ? 'bg-rose-500' : share >= 0.9 ? 'bg-amber-500' : 'bg-emerald-500'
  const rows: CashFlowStat[] = [
    { ...income, dot: 'bg-emerald-500' },
    { ...spent, dot: 'bg-primary' },
    { ...saved, dot: 'bg-sky-400' },
  ]

  return (
    <section
      aria-labelledby="cash-flow-title"
      className={cn('flex flex-col rounded-2xl border bg-card shadow-sm shadow-black/[0.03]', className)}
    >
      <div className="flex items-center justify-between gap-2 px-5 pt-5">
        <h2 id="cash-flow-title" className="text-sm font-semibold">
          {title}
        </h2>
        <div className="flex min-w-0 items-center gap-1">
          {review ? (
            <Link
              href={review.href}
              className="inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span className="truncate">{review.label}</span>
            </Link>
          ) : null}
          <Link
            href={trends.href}
            className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {trends.label}
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <dl className="mt-3 divide-y px-5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <span className={cn('size-2 shrink-0 rounded-full', row.dot)} aria-hidden="true" />
              {row.label}
            </dt>
            <dd className="flex min-w-0 flex-col items-end">
              <Money
                value={row.amount}
                currency={currency}
                className={cn(
                  'text-lg font-semibold tracking-tight',
                  row.tone === 'negative' && 'text-rose-600 dark:text-rose-400'
                )}
              />
              <span className="min-h-4 text-[11px] leading-4">{row.delta}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="px-5 pb-5 pt-3">
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          {share !== null ? (
            <div
              className={cn('h-full rounded-full transition-[width] duration-700', barTone)}
              style={{ width: `${Math.min(100, Math.round(share * 100))}%` }}
            />
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{barCaption}</p>
      </div>

      {footer ? <div className="mt-auto border-t px-5 py-4">{footer}</div> : null}
    </section>
  )
}
