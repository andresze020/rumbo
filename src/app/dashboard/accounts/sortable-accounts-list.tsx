'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, GripVertical, Plus, Settings } from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AccountAvatar } from '@/components/account-avatar'
import { BalanceAmount } from '@/components/balance-amount'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'
import { Callout } from '@/components/callout'
import { useLanguage } from '@/components/language-provider'
import { groupAccountsByType } from '@/lib/accounts-view/group'
import { formatCurrency } from '@/lib/format'
import type { AccountsView } from '@/lib/accounts-view/server'
import { cn } from '@/lib/utils'
import { reorderAccountsAction } from './actions'
import { AccountCardDetails, type CardCycleView } from './account-card-details'

export type AccountRowVM = {
  id: string
  name: string
  accountType: string
  accountTypeLabel: string
  accountClass: 'asset' | 'liability'
  currencyCode: string
  isArchived: boolean
  includeInNetWorth: boolean
  /** BR-039: reporting-only "transfers in count as expense" opt-in. */
  treatTransfersAsExpense: boolean
  hasOpeningBalance: boolean
  institutionName: string | null
  lastFour: string | null
  icon: string | null
  color: string | null
  balanceLabel: string
  balanceAmount: number
  postedLabel: string
  pendingLabel: string
  projectedLabel: string
  balanceType: 'posted' | 'owed'
  /** Display amount in base currency (positive for assets, owed for liabilities). */
  baseAmount: number
  /** Pre-formatted base-currency equivalent — set when account currency ≠ household base currency. */
  baseCurrencyLabel: string | null
  /** BR-030: statement cycle, already formatted; null unless configured. */
  cardCycle: CardCycleView | null
  editHref: string
  openingBalanceHref: string
}

type SortableAccountsListProps = {
  rows: AccountRowVM[]
  view: AccountsView
  showArchived: boolean
  baseCurrency: string
}

function AccountRowBody({
  row,
  showTypeBadge,
  dragHandle,
}: {
  row: AccountRowVM
  showTypeBadge: boolean
  dragHandle?: ReactNode
}) {
  const { t } = useLanguage()

  return (
    <div className={cn('flex items-start gap-2 p-3', row.isArchived && 'bg-muted/30')}>
      {dragHandle}
      <div className="min-w-0 flex-1">
        <AccountCardDetails
          accountId={row.id}
          summaryLeft={
            <>
              <AccountAvatar
                accountType={row.accountType}
                emoji={row.icon}
                color={row.color}
                className={row.isArchived ? 'opacity-60 grayscale' : undefined}
              />
              <div className="min-w-0">
                <p
                  className={cn(
                    'truncate text-sm font-medium',
                    row.isArchived && 'text-muted-foreground'
                  )}
                >
                  {row.name}
                </p>
                {row.institutionName || row.lastFour ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {row.institutionName}
                    {row.institutionName && row.lastFour ? ' · ' : ''}
                    {row.lastFour ? `···· ${row.lastFour}` : ''}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {showTypeBadge ? (
                    <Badge variant="secondary" className="text-[11px]">
                      {row.accountTypeLabel}
                    </Badge>
                  ) : null}
                  {row.accountClass === 'liability' ? (
                    <Badge
                      variant="outline"
                      className="border-rose-200 text-[11px] text-rose-600 dark:border-rose-900 dark:text-rose-400"
                    >
                      {t('accounts.classLiability')}
                    </Badge>
                  ) : null}
                  {row.isArchived ? (
                    <Badge variant="outline" className="text-[11px]">
                      {t('common.archived')}
                    </Badge>
                  ) : null}
                  {/* BR-039: the flag silently changes what Reports call
                      "spent", so it has to be visible from the list. */}
                  {row.treatTransfersAsExpense ? (
                    <Badge
                      variant="outline"
                      className="border-sky-200 text-[11px] text-sky-700 dark:border-sky-900 dark:text-sky-400"
                    >
                      {t('accounts.transferAsExpenseBadge')}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </>
          }
          balanceLabel={row.balanceLabel}
          balanceAmount={row.balanceAmount}
          postedLabel={row.postedLabel}
          pendingLabel={row.pendingLabel}
          projectedLabel={row.projectedLabel}
          balanceType={row.balanceType}
          baseCurrencyLabel={row.baseCurrencyLabel}
          cardCycle={row.cardCycle}
        />
        {/* Row action icons */}
        <div className="-mx-2 mt-1 flex items-center justify-end gap-0.5 border-t pt-1">
          {!row.isArchived ? (
            <GlobalAddTransactionButton
              className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-7 w-7')}
              defaultAccountId={row.id}
              aria-label={`Add transaction for ${row.name}`}
            >
              <Plus className="size-3.5" aria-hidden="true" />
            </GlobalAddTransactionButton>
          ) : null}
          <Link
            href={`/dashboard/transactions?account_id=${row.id}`}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-7 w-7')}
            aria-label={`View transactions for ${row.name}`}
          >
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
          <Link
            href={row.editHref}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-7 w-7')}
            aria-label={`Edit ${row.name}`}
          >
            <Settings className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  )
}

function SortableRow({
  row,
  showTypeBadge,
}: {
  row: AccountRowVM
  showTypeBadge: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('bg-card', isDragging && 'relative z-10 opacity-80 shadow-lg')}
    >
      <AccountRowBody
        row={row}
        showTypeBadge={showTypeBadge}
        dragHandle={
          <button
            type="button"
            className="mt-0.5 cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
            aria-label={`Reorder ${row.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
        }
      />
    </div>
  )
}

function AccountCard({ row }: { row: AccountRowVM }) {
  const { t } = useLanguage()
  const isOwed = row.balanceType === 'owed'

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm shadow-black/[0.03]',
        row.isArchived && 'opacity-80'
      )}
    >
      <div className="flex items-start gap-3">
        <AccountAvatar
          accountType={row.accountType}
          emoji={row.icon}
          color={row.color}
          className={row.isArchived ? 'opacity-60 grayscale' : undefined}
        />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-medium', row.isArchived && 'text-muted-foreground')}>
            {row.name}
          </p>
          {row.institutionName || row.lastFour ? (
            <p className="truncate text-xs text-muted-foreground">
              {row.institutionName}
              {row.institutionName && row.lastFour ? ' · ' : ''}
              {row.lastFour ? `···· ${row.lastFour}` : ''}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {row.accountClass === 'liability' ? (
              <Badge
                variant="outline"
                className="border-rose-200 text-[11px] text-rose-600 dark:border-rose-900 dark:text-rose-400"
              >
                {t('accounts.classLiability')}
              </Badge>
            ) : null}
            {row.isArchived ? (
              <Badge variant="outline" className="text-[11px]">
                {t('common.archived')}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <BalanceAmount label={row.balanceLabel} amount={row.balanceAmount} className="text-sm font-semibold" />
          {row.baseCurrencyLabel ? (
            <p className="text-[11px] text-muted-foreground">≈ {row.baseCurrencyLabel}</p>
          ) : null}
          {/* BR-030: the grouped/card view gets the same payable figure as the
              list view — App B shows both numbers per card, and a card whose
              cycle is configured in one view but invisible in the other would
              just look broken. */}
          {row.cardCycle ? (
            <>
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {row.cardCycle.payableLabel}
                </span>{' '}
                {t('accounts.cyclePayableDueShort')} {row.cardCycle.closedDueLabel}
              </p>
              {row.cardCycle.isOverdue ? (
                <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                  {t('accounts.cycleOverdue')}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">{isOwed ? t('accounts.owed') : t('accounts.available')}</p>
          )}
        </div>
      </div>

      <div className="-mx-3 flex items-center justify-end gap-0.5 border-t px-2 pt-2">
        {!row.isArchived ? (
          <GlobalAddTransactionButton
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-7 w-7')}
            defaultAccountId={row.id}
            aria-label={`Add transaction for ${row.name}`}
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </GlobalAddTransactionButton>
        ) : null}
        <Link
          href={`/dashboard/transactions?account_id=${row.id}`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-7 w-7')}
          aria-label={`View transactions for ${row.name}`}
        >
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
        <Link
          href={row.editHref}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-7 w-7')}
          aria-label={`Edit ${row.name}`}
        >
          <Settings className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}

export function SortableAccountsList({
  rows,
  view,
  showArchived,
  baseCurrency,
}: SortableAccountsListProps) {
  const [items, setItems] = useState(rows)
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { t } = useLanguage()

  // Adopt a fresh server list when its set/order actually changes (archived
  // toggle, account created/archived) without an effect, so optimistic drag
  // updates are never clobbered by a same-order re-render. This is React's
  // recommended "adjust state during render" pattern.
  const serverSignature = rows.map((row) => row.id).join('|')
  const [syncedSignature, setSyncedSignature] = useState(serverSignature)
  if (serverSignature !== syncedSignature) {
    setItems(rows)
    setSyncedSignature(serverSignature)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Dragging only authors order in the (active) accounts view.
  const sortable = !showArchived

  function persist(next: AccountRowVM[]) {
    setItems(next)
    startTransition(async () => {
      const result = await reorderAccountsAction(next.map((row) => row.id))
      setError(result?.error ?? null)
    })
  }

  function handleListDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((row) => row.id === active.id)
    const newIndex = items.findIndex((row) => row.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    persist(arrayMove(items, oldIndex, newIndex))
  }

  const errorCallout = error ? (
    <Callout variant="error" className="mb-3">
      {error}
    </Callout>
  ) : null

  // ── Card-grid group view ─────────────────────────────────────────────────
  if (view === 'group') {
    const groups = groupAccountsByType(items, {
      getType: (row) => row.accountType,
      getBaseAmount: (row) => row.baseAmount,
    })

    return (
      <div>
        {errorCallout}
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.type}>
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}{' '}
                  <span className="font-normal">
                    · {group.count} {group.count === 1 ? t('accounts.account') : t('accounts.accountsPlural')}
                  </span>
                </span>
                <BalanceAmount
                  label={formatCurrency(group.subtotalBase, baseCurrency)}
                  amount={group.subtotalBase}
                  className="text-sm"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.rows.map((row) => (
                  <AccountCard key={row.id} row={row} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── List view ────────────────────────────────────────────────────────────
  const listBody = items.map((row) =>
    sortable ? (
      <SortableRow
        key={row.id}
        row={row}
        showTypeBadge
      />
    ) : (
      <AccountRowBody
        key={row.id}
        row={row}
        showTypeBadge
      />
    )
  )

  return (
    <div>
      {errorCallout}
      <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
        {sortable ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleListDragEnd}
          >
            <SortableContext
              items={items.map((row) => row.id)}
              strategy={verticalListSortingStrategy}
            >
              {listBody}
            </SortableContext>
          </DndContext>
        ) : (
          listBody
        )}
      </div>
    </div>
  )
}
