'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { deleteBudgetLineAction } from './actions'

type BudgetLineRow = {
  line_id: string | null
  category_id: string | null
  category_name: string | null
  category_is_archived: boolean | null
  category_exclude_from_budget: boolean | null
  category_exclude_from_reports: boolean | null
  planned_amount: number | string | null
  actual_amount: number | string | null
  transaction_count: number | string | null
}

type BudgetLineRowProps = {
  line: BudgetLineRow
  categoryName: string
  budgetCurrency: string
  selectedMonth: string
  editHref: string
}

const NEAR_LIMIT_THRESHOLD = 0.8

function formatCurrency(value: number, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(value)
}

function formatPercent(value: number | null) {
  if (value === null) return 'N/A'
  return new Intl.NumberFormat('en-CA', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

function getLineStatus(plannedAmount: number, actualAmount: number) {
  if (actualAmount > plannedAmount)
    return { label: 'Over budget', variant: 'destructive' as const, barColor: 'bg-destructive' }
  if (plannedAmount > 0 && actualAmount / plannedAmount >= NEAR_LIMIT_THRESHOLD)
    return { label: 'Near limit', variant: 'secondary' as const, barColor: 'bg-amber-500' }
  return { label: 'On track', variant: 'outline' as const, barColor: 'bg-emerald-500' }
}

export function BudgetLineRow({
  line,
  categoryName,
  budgetCurrency,
  selectedMonth,
  editHref,
}: BudgetLineRowProps) {
  const [open, setOpen] = useState(false)

  const plannedAmount = Number(line.planned_amount ?? 0)
  const actualAmount = Number(line.actual_amount ?? 0)
  const lineRemaining = plannedAmount - actualAmount
  const linePercent = plannedAmount > 0 ? actualAmount / plannedAmount : null
  const txCount = Number(line.transaction_count ?? 0)
  const status = getLineStatus(plannedAmount, actualAmount)
  const barWidth = linePercent !== null ? Math.min(Math.round(linePercent * 100), 100) : 0

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={open}
      >
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{categoryName}</span>
            <Badge variant={status.variant} className="text-xs">
              {status.label}
            </Badge>
            {line.category_is_archived ? (
              <Badge variant="outline" className="text-xs">
                Archived
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {txCount} transaction{txCount === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">
              {formatCurrency(actualAmount, budgetCurrency)}
            </p>
            <p className="text-xs text-muted-foreground">
              of {formatCurrency(plannedAmount, budgetCurrency)}
            </p>
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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {formatCurrency(actualAmount, budgetCurrency)} spent
                </span>
                <span className="font-medium">{formatPercent(linePercent)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${status.barColor}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                of {formatCurrency(plannedAmount, budgetCurrency)} planned
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border bg-background p-2.5">
                <p className="text-xs text-muted-foreground">Planned</p>
                <p className="mt-0.5 text-sm font-medium tabular-nums">
                  {formatCurrency(plannedAmount, budgetCurrency)}
                </p>
              </div>
              <div className="rounded-md border bg-background p-2.5">
                <p className="text-xs text-muted-foreground">Actual</p>
                <p className="mt-0.5 text-sm font-medium tabular-nums">
                  {formatCurrency(actualAmount, budgetCurrency)}
                </p>
              </div>
              <div className="rounded-md border bg-background p-2.5">
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="mt-0.5 text-sm font-medium tabular-nums">
                  {formatCurrency(lineRemaining, budgetCurrency)}
                </p>
              </div>
              <div className="rounded-md border bg-background p-2.5">
                <p className="text-xs text-muted-foreground">Used</p>
                <p className="mt-0.5 text-sm font-medium">{formatPercent(linePercent)}</p>
              </div>
            </div>

            {line.category_exclude_from_reports ? (
              <p className="text-xs text-muted-foreground">Excluded from reports</p>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {line.category_id ? (
                <Link
                  href={editHref}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  Edit
                </Link>
              ) : null}
              {line.category_id ? (
                <Link
                  href={`/dashboard/transactions?category_id=${encodeURIComponent(line.category_id)}&month=${encodeURIComponent(selectedMonth)}`}
                  className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                >
                  View transactions →
                </Link>
              ) : null}
              <form action={deleteBudgetLineAction}>
                <input type="hidden" name="month" value={selectedMonth} />
                <input type="hidden" name="line_id" value={line.line_id ?? ''} />
                <SubmitButton
                  type="submit"
                  variant="outline"
                  size="sm"
                  pendingText="Removing…"
                >
                  Remove
                </SubmitButton>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
