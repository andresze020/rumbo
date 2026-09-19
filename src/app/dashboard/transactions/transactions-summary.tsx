import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { getLocale } from '@/lib/i18n/server'
import { createUiTranslator } from '@/lib/i18n/ui'
import { cn } from '@/lib/utils'

type TransactionsSummaryProps = {
  /** Totals for the WHOLE filtered set, in the household's base currency. */
  incomeBase: number
  expenseBase: number
  baseCurrency: string
}

/**
 * Net first, income and expenses under it.
 *
 * These are the RPC's figures for the whole filtered set — transfers, debt
 * payments, opening balances and voided rows are already excluded server-side,
 * so moving money between your own accounts stays neutral here. Nothing is
 * recomputed on this side; the component only formats.
 *
 * The currency code sits in the label rather than on a line of its own under
 * the card: these households hold both CAD and COP accounts, so it is not
 * decoration, but it is also not worth 18px of its own.
 */
export async function TransactionsSummary({
  incomeBase,
  expenseBase,
  baseCurrency,
}: TransactionsSummaryProps) {
  const locale = await getLocale()
  const ui = createUiTranslator(locale)
  const netBase = incomeBase - expenseBase

  return (
    <section
      aria-label={ui('Period totals')}
      className="rounded-2xl border bg-card px-3 py-2 shadow-sm shadow-black/[0.03]"
    >
      <p className="text-xs font-medium text-muted-foreground">
        {ui('Net')}
        <span aria-hidden="true"> · </span>
        {baseCurrency}
      </p>
      <p
        className={cn(
          'text-[1.375rem] font-semibold tabular-nums leading-tight',
          netBase < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'
        )}
      >
        {formatCurrency(netBase, baseCurrency, locale)}
      </p>

      <dl className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs">
        <div className="flex min-w-0 items-center gap-1.5">
          <ArrowDownLeft
            className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          <dt className="text-muted-foreground">{ui('Income')}</dt>
          <dd className="truncate font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCurrency(incomeBase, baseCurrency, locale)}
          </dd>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <ArrowUpRight
            className="size-3.5 shrink-0 text-red-600 dark:text-red-400"
            aria-hidden="true"
          />
          <dt className="text-muted-foreground">{ui('Expenses')}</dt>
          <dd className="truncate font-semibold tabular-nums text-red-600 dark:text-red-400">
            {formatCurrency(expenseBase, baseCurrency, locale)}
          </dd>
        </div>
      </dl>
    </section>
  )
}
