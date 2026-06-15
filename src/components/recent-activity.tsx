import Link from 'next/link'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from 'lucide-react'
import { Money } from '@/components/money'
import { cn } from '@/lib/utils'

export type RecentActivityRow = {
  id: string
  title: string
  subtitle: string
  accountName: string
  dateLabel: string
  /** Signed amount in the entry currency: income +, expense −, transfer abs. */
  amount: number
  currency: string
  type: 'income' | 'expense' | 'transfer' | 'other'
}

const TYPE_STYLE: Record<
  RecentActivityRow['type'],
  { icon: typeof ArrowDownLeft; tile: string }
> = {
  income: {
    icon: ArrowDownLeft,
    tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
  },
  expense: {
    icon: ArrowUpRight,
    tile: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
  },
  transfer: { icon: ArrowLeftRight, tile: 'bg-muted text-muted-foreground' },
  other: { icon: ArrowLeftRight, tile: 'bg-muted text-muted-foreground' },
}

export function RecentActivity({
  rows,
  emptyLabel,
}: {
  rows: RecentActivityRow[]
  emptyLabel: string
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-sm shadow-black/[0.03]">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="divide-y overflow-hidden">
      {rows.map((row) => {
        const style = TYPE_STYLE[row.type]
        const Icon = style.icon
        const tone =
          row.type === 'income' ? 'positive' : row.type === 'expense' ? 'negative' : 'muted'
        return (
          <Link
            key={row.id}
            href={`/dashboard/transactions?edit=${row.id}`}
            className="grid grid-cols-[34px_minmax(0,1fr)_88px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 lg:grid-cols-[36px_minmax(0,1fr)_110px_70px_100px]"
          >
            <span
              className={cn(
                'flex size-[34px] shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
                style.tile
              )}
              aria-hidden="true"
            >
              <Icon />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.title}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                <span className="lg:hidden">
                  {row.subtitle} · {row.dateLabel}
                </span>
                <span className="hidden lg:inline">{row.subtitle}</span>
              </p>
            </div>
            <div className="hidden min-w-0 truncate text-xs text-muted-foreground lg:block">
              {row.accountName}
            </div>
            <div className="hidden text-xs text-muted-foreground lg:block">{row.dateLabel}</div>
            <Money
              value={row.amount}
              currency={row.currency}
              tone={tone}
              signed={row.type === 'income'}
              className="shrink-0 text-right text-sm font-bold"
            />
          </Link>
        )
      })}
    </div>
  )
}
