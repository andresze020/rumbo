'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { GripVertical } from 'lucide-react'
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
import { AccountGroup } from '@/components/account-group'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'
import { SubmitButton } from '@/components/submit-button'
import { Callout } from '@/components/callout'
import { groupAccountsByType } from '@/lib/accounts-view/group'
import { formatCurrency } from '@/lib/format'
import type { AccountsView } from '@/lib/accounts-view/server'
import { cn } from '@/lib/utils'
import { archiveAccountAction, reorderAccountsAction } from './actions'
import { AccountCardDetails } from './account-card-details'

export type AccountRowVM = {
  id: string
  name: string
  accountType: string
  accountTypeLabel: string
  accountClass: 'asset' | 'liability'
  currencyCode: string
  isArchived: boolean
  includeInNetWorth: boolean
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
  editHref: string
  openingBalanceHref: string
}

type SortableAccountsListProps = {
  rows: AccountRowVM[]
  view: AccountsView
  showArchived: boolean
  baseCurrency: string
}

function RowActions({
  row,
  showArchived,
}: {
  row: AccountRowVM
  showArchived: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={row.editHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        Edit
      </Link>

      {!row.isArchived ? (
        <GlobalAddTransactionButton
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          defaultAccountId={row.id}
        >
          Add transaction
        </GlobalAddTransactionButton>
      ) : null}

      {!row.isArchived && !row.hasOpeningBalance ? (
        <Link
          href={row.openingBalanceHref}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Set opening balance
        </Link>
      ) : null}

      <form action={archiveAccountAction}>
        <input type="hidden" name="account_id" value={row.id} />
        <input type="hidden" name="is_archived" value={row.isArchived ? 'false' : 'true'} />
        <input type="hidden" name="show_archived" value={showArchived ? 'true' : 'false'} />
        <SubmitButton
          type="submit"
          size="sm"
          variant={row.isArchived ? 'outline' : 'secondary'}
          pendingText={row.isArchived ? 'Restoring' : 'Archiving'}
        >
          {row.isArchived ? 'Restore account' : 'Archive account'}
        </SubmitButton>
      </form>
    </div>
  )
}

function AccountRowBody({
  row,
  showArchived,
  showTypeBadge,
  dragHandle,
}: {
  row: AccountRowVM
  showArchived: boolean
  showTypeBadge: boolean
  dragHandle?: ReactNode
}) {
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
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {showTypeBadge ? (
                    <Badge variant="secondary" className="text-[11px]">
                      {row.accountTypeLabel}
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="text-[11px]">
                    {row.currencyCode}
                  </Badge>
                  {row.accountClass === 'liability' ? (
                    <Badge
                      variant="outline"
                      className="border-rose-200 text-[11px] text-rose-600 dark:border-rose-900 dark:text-rose-400"
                    >
                      Liability
                    </Badge>
                  ) : null}
                  {row.isArchived ? (
                    <Badge variant="outline" className="text-[11px]">
                      Archived
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
          institutionName={row.institutionName}
          lastFour={row.lastFour}
          includeInNetWorth={row.includeInNetWorth}
          hasOpeningBalance={row.hasOpeningBalance}
        >
          <RowActions row={row} showArchived={showArchived} />
        </AccountCardDetails>
      </div>
    </div>
  )
}

function SortableRow({
  row,
  showArchived,
  showTypeBadge,
}: {
  row: AccountRowVM
  showArchived: boolean
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
        showArchived={showArchived}
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

export function SortableAccountsList({
  rows,
  view,
  showArchived,
  baseCurrency,
}: SortableAccountsListProps) {
  const [items, setItems] = useState(rows)
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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

  function reorderWithinGroup(groupType: string, activeId: string, overId: string) {
    const groupIndexes = items
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.accountType === groupType)
    const groupRows = groupIndexes.map(({ row }) => row)
    const oldIndex = groupRows.findIndex((row) => row.id === activeId)
    const newIndex = groupRows.findIndex((row) => row.id === overId)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(groupRows, oldIndex, newIndex)
    const next = [...items]
    groupIndexes.forEach(({ index }, position) => {
      next[index] = reordered[position]
    })
    persist(next)
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

  // ── Group view ───────────────────────────────────────────────────────────
  if (view === 'group') {
    const groups = groupAccountsByType(items, {
      getType: (row) => row.accountType,
      getBaseAmount: (row) => row.baseAmount,
    })

    return (
      <div>
        {errorCallout}
        <div className="divide-y rounded-lg border">
          {groups.map((group) => {
            const groupBody = group.rows.map((row) =>
              sortable ? (
                <SortableRow
                  key={row.id}
                  row={row}
                  showArchived={showArchived}
                  showTypeBadge={false}
                />
              ) : (
                <AccountRowBody
                  key={row.id}
                  row={row}
                  showArchived={showArchived}
                  showTypeBadge={false}
                />
              )
            )

            return (
              <AccountGroup
                key={group.type}
                label={group.label}
                count={group.count}
                subtotalLabel={formatCurrency(group.subtotalBase, baseCurrency)}
                subtotalAmount={group.subtotalBase}
              >
                {sortable ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => {
                      const { active, over } = event
                      if (!over || active.id === over.id) return
                      reorderWithinGroup(
                        group.type,
                        String(active.id),
                        String(over.id)
                      )
                    }}
                  >
                    <SortableContext
                      items={group.rows.map((row) => row.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {groupBody}
                    </SortableContext>
                  </DndContext>
                ) : (
                  groupBody
                )}
              </AccountGroup>
            )
          })}
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
        showArchived={showArchived}
        showTypeBadge
      />
    ) : (
      <AccountRowBody
        key={row.id}
        row={row}
        showArchived={showArchived}
        showTypeBadge
      />
    )
  )

  return (
    <div>
      {errorCallout}
      <div className="divide-y rounded-lg border">
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
