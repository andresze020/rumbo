'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { ChevronDown, GripVertical } from 'lucide-react'
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
import { Callout } from '@/components/callout'
import { useLanguage } from '@/components/language-provider'
import { groupAccountsByType } from '@/lib/accounts-view/group'
import { formatCurrency } from '@/lib/format'
import type { AccountsView } from '@/lib/accounts-view/server'
import { cn } from '@/lib/utils'
import { reorderAccountsAction } from './actions'
import { AccountDetailsPanel, type CardCycleView } from './account-card-details'

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

/**
 * One account, one line. The name and the balance are the only things a row
 * shows at rest; the type badge, the liability badge and the "Available" caption
 * that used to repeat under every figure are all things the avatar, the group
 * header or the sign of the number already say. Everything else lives behind the
 * chevron.
 */
function AccountRow({
  row,
  showType,
  dragHandle,
}: {
  row: AccountRowVM
  /** Flat list has no group header, so the row carries its own type label. */
  showType: boolean
  dragHandle?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { t } = useLanguage()
  const cycle = row.cardCycle

  const subtitle = [
    showType ? row.accountTypeLabel : null,
    row.institutionName,
    row.lastFour ? `···· ${row.lastFour}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    // An open row tints, so its detail panel reads as part of that account and
    // not as a section of the card it sits in.
    <div className={cn(open && 'bg-muted/20')}>
      <div className="flex items-center">
        {dragHandle}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 sm:pr-4',
            dragHandle ? 'pl-1' : 'pl-3 sm:pl-4'
          )}
        >
          <AccountAvatar
            accountType={row.accountType}
            emoji={row.icon}
            color={row.color}
            size="sm"
            className={cn('size-9', row.isArchived && 'opacity-60 grayscale')}
          />

          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'block truncate text-sm font-medium',
                row.isArchived && 'text-muted-foreground'
              )}
            >
              {row.name}
            </span>
            {subtitle || row.treatTransfersAsExpense ? (
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                {subtitle ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {subtitle}
                  </span>
                ) : null}
                {/* BR-039: the flag silently changes what Reports call "spent",
                    so it has to be visible from the list. */}
                {row.treatTransfersAsExpense ? (
                  <span className="shrink-0 rounded-full border border-sky-500/40 px-1.5 py-px text-[10px] font-medium text-sky-700 dark:text-sky-400">
                    {t('accounts.transferAsExpenseBadge')}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>

          <span className="flex shrink-0 flex-col items-end leading-tight">
            <BalanceAmount
              label={row.balanceLabel}
              amount={row.balanceAmount}
              className="text-sm sm:text-[15px]"
            />
            {row.baseCurrencyLabel ? (
              <span className="text-[11px] text-muted-foreground">
                ≈ {row.baseCurrencyLabel}
              </span>
            ) : null}
            {/* BR-030: on a card with a cycle, the running balance alone cannot
                answer "what do I owe next" — so the payable figure and its due
                date stay on the row even though the plain balance caption went. */}
            {cycle ? (
              <span
                className={cn(
                  'text-[11px]',
                  cycle.isOverdue
                    ? 'font-semibold text-rose-600 dark:text-rose-400'
                    : 'text-muted-foreground'
                )}
              >
                <span className="font-medium text-foreground">
                  {cycle.payableLabel}
                </span>{' '}
                {t('accounts.cyclePayableDueShort')} {cycle.closedDueLabel}
                {cycle.isOverdue ? ` · ${t('accounts.cycleOverdue')}` : ''}
              </span>
            ) : null}
          </span>

          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground/60 transition-transform duration-200',
              open && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        className={cn(
          'grid transition-all duration-200 ease-in-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        {/* `inert` while collapsed: the panel stays mounted for the animation,
            and without it every row would leave three hidden buttons in the tab
            order. */}
        <div className="overflow-hidden" inert={!open}>
          <AccountDetailsPanel
            accountId={row.id}
            accountName={row.name}
            editHref={row.editHref}
            isArchived={row.isArchived}
            postedLabel={row.postedLabel}
            pendingLabel={row.pendingLabel}
            projectedLabel={row.projectedLabel}
            balanceType={row.balanceType}
            cardCycle={row.cardCycle}
          />
        </div>
      </div>
    </div>
  )
}

function SortableRow({ row }: { row: AccountRowVM }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('bg-card', isDragging && 'relative z-10 opacity-90 shadow-lg')}
    >
      <AccountRow
        row={row}
        showType
        dragHandle={
          <button
            type="button"
            // Faint at rest so a column of grips never competes with the
            // balances, but still a full touch target for reordering.
            className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:text-foreground active:cursor-grabbing"
            aria-label={`Reorder ${row.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" aria-hidden="true" />
          </button>
        }
      />
    </div>
  )
}

const CARD_CLASS =
  'overflow-hidden rounded-2xl border bg-card shadow-sm shadow-black/[0.03]'

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

  // ── Grouped view ─────────────────────────────────────────────────────────
  // Same rows as the flat list, one card per account type. The type label and
  // its subtotal are stated once in the header instead of once per row, which
  // is what makes a grouped row leaner than a flat one.
  if (view === 'group') {
    const groups = groupAccountsByType(items, {
      getType: (row) => row.accountType,
      getBaseAmount: (row) => row.baseAmount,
    })

    return (
      <div>
        {errorCallout}
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.type} className={CARD_CLASS}>
              <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2 sm:px-4">
                <span className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {/* Localized on the server, unlike the grouper's fallback. */}
                  {group.rows[0]?.accountTypeLabel ?? group.label}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/60">
                  {group.count}
                </span>
                <BalanceAmount
                  label={formatCurrency(group.subtotalBase, baseCurrency)}
                  amount={group.subtotalBase}
                  className="ml-auto text-xs"
                />
              </div>
              <div className="divide-y divide-border/60">
                {group.rows.map((row) => (
                  <AccountRow key={row.id} row={row} showType={false} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Flat list view ───────────────────────────────────────────────────────
  const listBody = items.map((row) =>
    sortable ? (
      <SortableRow key={row.id} row={row} />
    ) : (
      <AccountRow key={row.id} row={row} showType />
    )
  )

  return (
    <div>
      {errorCallout}
      <div className={cn(CARD_CLASS, 'divide-y divide-border/60')}>
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
