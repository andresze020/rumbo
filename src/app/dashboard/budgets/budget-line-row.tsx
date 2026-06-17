'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Pencil, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { cn } from '@/lib/utils'
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
  categoryIcon?: string | null
  categoryColor?: string | null
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
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value)
}

function getLineStatus(plannedAmount: number, actualAmount: number) {
  if (actualAmount > plannedAmount)
    return {
      label: 'Over budget',
      variant: 'destructive' as const,
      barClassName: 'bg-destructive',
      textClassName: 'text-destructive',
    }
  if (plannedAmount > 0 && actualAmount / plannedAmount >= NEAR_LIMIT_THRESHOLD)
    return {
      label: 'Near limit',
      variant: 'secondary' as const,
      barClassName: 'bg-amber-500',
      textClassName: 'text-amber-600 dark:text-amber-400',
    }
  return {
    label: 'On track',
    variant: 'outline' as const,
    barClassName: 'bg-emerald-500',
    textClassName: 'text-emerald-600 dark:text-emerald-400',
  }
}

function CategoryGlyph({
  icon,
  color,
}: {
  icon?: string | null
  color?: string | null
}) {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold"
      style={color ? { color } : undefined}
      aria-hidden="true"
    >
      {icon ? <span className="leading-none">{icon}</span> : <Tag className="size-4" />}
    </span>
  )
}

export function BudgetLineRow({
  line,
  categoryName,
  categoryIcon,
  categoryColor,
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
  const overBudget = actualAmount > plannedAmount
  const remainingClassName =
    lineRemaining < 0
      ? 'text-destructive'
      : lineRemaining > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-muted-foreground'

  return (
    <div className={cn(overBudget && 'bg-destructive/5')}>
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
        >
          <div className="flex items-start gap-2.5">
            <CategoryGlyph icon={categoryIcon} color={categoryColor} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{categoryName}</p>
                  <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                    {txCount} transaction{txCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn('font-mono text-xs font-semibold tabular-nums', overBudget && 'text-destructive')}>
                    {formatCurrency(actualAmount, budgetCurrency)}
                  </p>
                  <p className={cn('mt-0.5 text-[10.5px] font-bold tabular-nums', status.textClassName)}>
                    {formatPercent(linePercent)}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    'mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
                    open && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-all', status.barClassName)}
                  style={
                    !overBudget && status.label === 'On track' && categoryColor
                      ? { width: `${barWidth}%`, backgroundColor: categoryColor }
                      : { width: `${barWidth}%` }
                  }
                />
              </div>
            </div>
          </div>
        </button>
      </div>

      <div className="hidden min-h-[62px] grid-cols-[minmax(11rem,1fr)_minmax(5rem,6.5rem)_minmax(5rem,6.5rem)_minmax(5rem,6.5rem)_minmax(9rem,11rem)_4rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 md:grid">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-8 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor ?? 'var(--primary)' }}
            aria-hidden="true"
          />
          <CategoryGlyph icon={categoryIcon} color={categoryColor} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{categoryName}</p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">
              {txCount} transaction{txCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="min-w-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
          {formatCurrency(plannedAmount, budgetCurrency)}
        </div>
        <div className={cn('min-w-0 text-right font-mono text-xs font-semibold tabular-nums', overBudget && 'text-destructive')}>
          {formatCurrency(actualAmount, budgetCurrency)}
        </div>
        <div className={cn('min-w-0 text-right font-mono text-xs font-semibold tabular-nums', remainingClassName)}>
          {formatCurrency(lineRemaining, budgetCurrency)}
        </div>
        <div className="min-w-0">
          <div className="mb-1 grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2 text-[10.5px]">
            <span className={cn('font-bold tabular-nums', status.textClassName)}>
              {formatPercent(linePercent)}
            </span>
            <span className="truncate text-right text-muted-foreground">{status.label}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', status.barClassName)}
              style={
                !overBudget && status.label === 'On track' && categoryColor
                  ? { width: `${barWidth}%`, backgroundColor: categoryColor }
                  : { width: `${barWidth}%` }
              }
            />
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-center gap-1">
          {line.category_id ? (
            <Link
              href={editHref}
              className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
              aria-label={`Edit ${categoryName}`}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} ${categoryName} details`}
          >
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <div
        className={`grid transition-all duration-200 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="mx-3 mb-3 space-y-3 rounded-lg bg-muted/40 p-3 md:mx-4 md:mb-4">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={status.variant} className="text-xs">
                {status.label}
              </Badge>
              {line.category_is_archived ? (
                <Badge variant="outline" className="text-xs">
                  Archived
                </Badge>
              ) : null}
              {line.category_exclude_from_reports ? (
                <Badge variant="outline" className="text-xs">
                  Excluded from reports
                </Badge>
              ) : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border bg-background p-2.5">
                <p className="text-xs text-muted-foreground">Planned</p>
                <p className="mt-0.5 font-mono text-sm font-medium tabular-nums">
                  {formatCurrency(plannedAmount, budgetCurrency)}
                </p>
              </div>
              <div className="rounded-md border bg-background p-2.5">
                <p className="text-xs text-muted-foreground">Spent</p>
                <p className="mt-0.5 font-mono text-sm font-medium tabular-nums">
                  {formatCurrency(actualAmount, budgetCurrency)}
                </p>
              </div>
              <div className="rounded-md border bg-background p-2.5">
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className={cn('mt-0.5 font-mono text-sm font-medium tabular-nums', remainingClassName)}>
                  {formatCurrency(lineRemaining, budgetCurrency)}
                </p>
              </div>
              <div className="rounded-md border bg-background p-2.5">
                <p className="text-xs text-muted-foreground">Used</p>
                <p className="mt-0.5 text-sm font-medium tabular-nums">{formatPercent(linePercent)}</p>
              </div>
            </div>

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
                  View transactions
                </Link>
              ) : null}
              <form action={deleteBudgetLineAction}>
                <input type="hidden" name="month" value={selectedMonth} />
                <input type="hidden" name="line_id" value={line.line_id ?? ''} />
                <SubmitButton
                  type="submit"
                  variant="outline"
                  size="sm"
                  pendingText="Removing..."
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
