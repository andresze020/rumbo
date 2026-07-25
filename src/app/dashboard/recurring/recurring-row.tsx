'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { SubmitButton } from '@/components/submit-button'
import { StatusBadge } from '@/components/status-badge'
import { formatCurrency, formatIsoDate } from '@/lib/format'
import type { Locale } from '@/lib/i18n/dictionaries'
import { toggleRecurringActiveAction, deleteRecurringAction } from './actions'

export type RecurringRowVM = {
  id: string
  name: string
  transaction_type: string
  amount: number
  currency_code: string
  frequencyLabel: string
  next_run_date: string | null
  start_date: string
  end_date: string | null
  is_active: boolean
  isDue: boolean
  autoPost: boolean
  lastError: string | null
  accountName: string
  categoryName: string
  categoryIcon: string | null
  editHref: string
  postHref: string
}

export function RecurringRow({ vm, locale }: { vm: RecurringRowVM; locale: Locale }) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className={vm.is_active ? '' : 'bg-muted/20'}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={open}
      >
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            {vm.categoryIcon ? (
              <span className="shrink-0 text-sm leading-none" aria-hidden="true">
                {vm.categoryIcon}
              </span>
            ) : null}
            <span
              className={`text-sm font-medium ${vm.is_active ? '' : 'text-muted-foreground'}`}
            >
              {vm.name}
            </span>
            <Badge
              variant="outline"
              className={
                vm.transaction_type === 'income'
                  ? 'text-xs text-emerald-600 dark:text-emerald-400'
                  : 'text-xs text-muted-foreground'
              }
            >
              {vm.transaction_type === 'income' ? 'Income' : 'Expense'}
            </Badge>
            {vm.is_active && vm.isDue ? (
              <Badge
                variant="outline"
                className="text-xs text-amber-600 dark:text-amber-400"
              >
                Due
              </Badge>
            ) : null}
            {vm.autoPost ? (
              <Badge
                variant="outline"
                className="text-xs text-sky-600 dark:text-sky-400"
              >
                Auto
              </Badge>
            ) : null}
            {vm.lastError ? (
              <Badge
                variant="outline"
                className="text-xs text-red-600 dark:text-red-400"
              >
                Auto-post failed
              </Badge>
            ) : null}
            {!vm.is_active ? <StatusBadge status="inactive" /> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {vm.frequencyLabel} · next {formatIsoDate(vm.next_run_date, locale)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <p className="text-sm font-semibold tabular-nums">
            {formatCurrency(vm.amount, vm.currency_code, locale)}
          </p>
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
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Account: <span className="text-foreground">{vm.accountName}</span>
              </span>
              <span>
                Category: <span className="text-foreground">{vm.categoryName}</span>
              </span>
              <span>
                Starts: <span className="text-foreground">{formatIsoDate(vm.start_date, locale)}</span>
              </span>
              <span>
                Ends:{' '}
                <span className="text-foreground">
                  {vm.end_date ? formatIsoDate(vm.end_date, locale) : 'No end'}
                </span>
              </span>
            </div>

            {vm.lastError ? (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                Last auto-post failed: {vm.lastError}. Fix the issue (or post
                manually), then it will retry on the next run.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {vm.is_active ? (
                <Link
                  href={vm.postHref}
                  className={buttonVariants({ size: 'sm' })}
                >
                  Post now
                </Link>
              ) : null}
              <Link
                href={vm.editHref}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Edit
              </Link>

              <form action={toggleRecurringActiveAction}>
                <input type="hidden" name="recurring_id" value={vm.id} />
                <input
                  type="hidden"
                  name="activate"
                  value={vm.is_active ? 'false' : 'true'}
                />
                <SubmitButton
                  type="submit"
                  size="sm"
                  variant="secondary"
                  pendingText={vm.is_active ? 'Pausing…' : 'Resuming…'}
                >
                  {vm.is_active ? 'Deactivate' : 'Reactivate'}
                </SubmitButton>
              </form>

              {confirmDelete ? (
                <form action={deleteRecurringAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="recurring_id" value={vm.id} />
                  <span className="self-center text-xs text-muted-foreground">
                    Delete permanently?
                  </span>
                  <SubmitButton
                    type="submit"
                    size="sm"
                    variant="destructive"
                    pendingText="Deleting…"
                  >
                    Yes, delete
                  </SubmitButton>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
