'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Flag,
  Pencil,
  RotateCcw,
  Tag,
  Undo2,
  X,
} from 'lucide-react'
import { PayeePicker, type PayeeOption } from './payee-picker'
import {
  bulkCategorizeAction,
  updateManualTransactionAction,
  updateReviewStatusAction,
} from './actions'
import { CategoryPicker } from './category-picker'
import { VoidTransactionForm } from './void-transaction-form'
import { AmountInput } from '@/components/amount-input'
import { SubmitButton } from '@/components/submit-button'
import { TagChip } from '@/components/tag-chip'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { useTransactionDialog } from '@/components/transaction-dialog-provider'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/components/language-provider'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import { localizeSystemCategoryName } from '@/lib/i18n/system-category-names'
import type { Locale } from '@/lib/i18n/dictionaries'

export type ReviewStatus = 'unreviewed' | 'reviewed' | 'flagged'

export type TransactionListCategory = {
  id: string
  name: string
  category_type: string
  parent_category_id: string | null
  icon?: string | null
  is_system?: boolean
}

/**
 * BR-034 — a snapshot of an existing transaction, enough to open the create
 * form pre-filled with it. Deliberately has no date: a copy defaults to today.
 */
export type TransactionCopyPayload = {
  type: 'income' | 'expense' | 'transfer'
  /** Absolute amount in the source account's currency, e.g. "42.50". */
  amount: string
  /** Transfers only: the amount that arrived, in the destination's currency. */
  toAmount?: string
  accountId?: string
  fromAccountId?: string
  toAccountId?: string
  /** Empty when the source is a split — the user picks a category instead. */
  categoryId?: string
  description?: string
  payeeName?: string
  notes?: string
  tagIds: string[]
}

export type TransactionListRow = {
  id: string
  title: string
  transactionType: string
  status: string
  reviewStatus: ReviewStatus
  isVoided: boolean
  isImported: boolean
  isOpeningBalance: boolean
  isTransfer: boolean
  isDebtPayment: boolean
  typeBadgeLabel: string
  accountName: string
  /** Full path, e.g. "Investment / Time Deposit" — details panel only. */
  categoryName: string
  /** Just the leaf, e.g. "Time Deposit" — what the row itself shows. */
  categoryLeafName: string
  categoryIcon: string | null
  categoryColor: string | null
  merchantName: string | null
  /** BR-045 — locale-formatted time of day, or null when none was recorded. */
  timeFormatted: string | null
  notes: string | null
  voidReason: string | null
  currencyCode: string | null
  amountFormatted: string | null
  transferCostFormatted: string | null
  tags: { id: string; name: string; color: string | null }[]
  canEdit: boolean
  canEditTransfer: boolean
  canVoid: boolean
  editHref: string
  /** BR-040 — set only on a posted expense that can still be refunded. */
  refundHref: string | null
  // Inline quick-edit source values (income/expense manual rows only).
  transactionDate: string
  accountId: string | null
  categoryId: string | null
  amountRaw: string | null
  description: string | null
  /** BR-034: null when the row can't be recreated by the create form. */
  copy: TransactionCopyPayload | null
}

export type TransactionListGroup = {
  date: string
  label: string
  rows: TransactionListRow[]
}

type TransactionListProps = {
  groups: TransactionListGroup[]
  categories: TransactionListCategory[]
  payeeSuggestions: string[]
  returnTo: string
  /** BR-038: tighter rows, so more transactions fit on screen. */
  compact?: boolean
}

const reviewStyles: Record<ReviewStatus, { label: string; className: string }> = {
  unreviewed: {
    label: 'To review',
    className:
      'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400',
  },
  reviewed: {
    label: 'Reviewed',
    className:
      'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400',
  },
  flagged: {
    label: 'Flagged',
    className:
      'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400',
  },
}

const REVIEW_ORDER: ReviewStatus[] = ['unreviewed', 'reviewed', 'flagged']

/**
 * Only inflows are tinted. Painting every expense red turned an ordinary month
 * into a wall of alarms; the leading minus sign already says which way the
 * money went, so outflows read in the plain foreground.
 */
function getAmountColorClass(transactionType: string) {
  if (transactionType === 'income') return 'text-emerald-600 dark:text-emerald-400'
  // BR-040: a refund is money coming back, so it reads green like an inflow —
  // but it is deliberately not the same green as income, because it did not
  // increase what the household earned, it reduced what it spent.
  if (transactionType === 'refund') return 'text-teal-600 dark:text-teal-400'
  return 'text-foreground'
}

/** Softly tinted avatar surfaces, one per direction of money. */
const typeTints: Record<string, { surface: string; icon: string }> = {
  income: {
    surface: 'bg-emerald-500/10',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  expense: {
    surface: 'bg-rose-500/10',
    icon: 'text-rose-600 dark:text-rose-400',
  },
  refund: {
    surface: 'bg-teal-500/10',
    icon: 'text-teal-600 dark:text-teal-400',
  },
  transfer: {
    surface: 'bg-sky-500/10',
    icon: 'text-sky-600 dark:text-sky-400',
  },
}

function tintFor(transactionType: string) {
  return typeTints[transactionType] ?? typeTints.transfer
}

function RowTypeIcon({
  transactionType,
  className,
  style,
}: {
  transactionType: string
  className?: string
  style?: CSSProperties
}) {
  const props = { className, style, 'aria-hidden': true } as const
  if (transactionType === 'income') return <ArrowDownLeft {...props} />
  if (transactionType === 'expense') return <ArrowUpRight {...props} />
  if (transactionType === 'refund') return <Undo2 {...props} />
  return <ArrowLeftRight {...props} />
}

/**
 * Leading tile for a row: the category's own emoji when it has one, otherwise
 * the direction arrow. Same visual language as `AccountAvatar` so the list and
 * the accounts screen feel like one app.
 */
function RowAvatar({ row, compact }: { row: TransactionListRow; compact: boolean }) {
  const tint = tintFor(row.transactionType)
  const showEmoji = Boolean(row.categoryIcon) && !row.isTransfer
  // A category that carries its own colour tints its own tile, so a long list
  // becomes scannable by category the way it already is by direction.
  const accent = row.isVoided ? null : row.categoryColor
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]',
        compact ? 'size-8' : 'size-9',
        row.isVoided ? 'bg-muted' : accent ? '' : tint.surface
      )}
      style={
        accent
          ? { backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)` }
          : undefined
      }
    >
      {showEmoji ? (
        <span className={cn('leading-none', compact ? 'text-sm' : 'text-base')}>
          {row.categoryIcon}
        </span>
      ) : (
        <RowTypeIcon
          transactionType={row.transactionType}
          className={cn(
            compact ? 'size-3.5' : 'size-4',
            !accent && (row.isVoided ? 'text-muted-foreground' : tint.icon)
          )}
          style={accent ? { color: accent } : undefined}
        />
      )}
    </span>
  )
}

function categoryLabel(
  category: TransactionListCategory,
  categoriesById: Map<string, TransactionListCategory>,
  locale: Locale
) {
  const parent = category.parent_category_id
    ? categoriesById.get(category.parent_category_id)
    : null
  const ownName = localizeSystemCategoryName(
    category.name,
    Boolean(category.is_system),
    locale
  )
  const parentName = parent
    ? localizeSystemCategoryName(parent.name, Boolean(parent.is_system), locale)
    : null
  const name = parentName ? `${parentName} / ${ownName}` : ownName
  return category.icon ? `${category.icon} ${name}` : name
}

export function TransactionList({
  groups,
  categories,
  payeeSuggestions,
  returnTo,
  compact = false,
}: TransactionListProps) {
  const { t, locale } = useLanguage()
  const ui = useUiTranslation()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  // Every row is one slim line on every breakpoint; the badges, tags and
  // actions live behind the chevron. Showing them all inline turned a page of
  // 4.000 transactions into a page of 4.000 toolbars.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Checkboxes are chrome you only need while triaging, so they stay out of
  // the way: hover reveals one per row on pointer devices, and "Select" pins
  // them for touch. Anything already selected keeps its box visible.
  const [selectionMode, setSelectionMode] = useState(false)

  const allRows = useMemo(() => groups.flatMap((g) => g.rows), [groups])
  const allIds = useMemo(() => allRows.map((r) => r.id), [allRows])
  const allSelected = allIds.length > 0 && selected.size === allIds.length

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  )
  const categoryOptions = useMemo(
    () =>
      categories
        .map((c) => ({ id: c.id, label: categoryLabel(c, categoriesById, locale) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories, categoriesById, locale]
  )
  // Unique payee names → options for the inline quick-edit combobox. (Names are
  // unique per household, so the name doubles as a stable key.)
  const payeeOptions: PayeeOption[] = payeeSuggestions.map((name) => ({
    id: name,
    name,
  }))

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)))
  }

  function exitSelectionMode() {
    setSelectionMode(false)
    setSelected(new Set())
  }

  const selectedIds = Array.from(selected)

  return (
    <div className="space-y-2">
      {/* ── Bulk action bar ───────────────────────────────────────────── */}
      {selectedIds.length > 0 ? (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl bg-primary px-3 py-2 text-primary-foreground shadow-lg shadow-primary/25">
          <span className="text-sm font-semibold">
            {selectedIds.length} {ui('selected')}
          </span>
          <span className="hidden h-4 w-px bg-primary-foreground/30 sm:block" />

          <form action={updateReviewStatusAction} className="contents">
            <input type="hidden" name="return_to" value={returnTo} />
            <input type="hidden" name="review_status" value="reviewed" />
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="transaction_id" value={id} />
            ))}
            <SubmitButton
              type="submit"
              size="sm"
              variant="secondary"
              className="h-7 gap-1.5"
              pendingText="Saving…"
            >
              <Check className="size-3.5" aria-hidden="true" />
              {ui('Mark reviewed')}
            </SubmitButton>
          </form>

          <form action={updateReviewStatusAction} className="contents">
            <input type="hidden" name="return_to" value={returnTo} />
            <input type="hidden" name="review_status" value="flagged" />
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="transaction_id" value={id} />
            ))}
            <SubmitButton
              type="submit"
              size="sm"
              variant="secondary"
              className="h-7 gap-1.5"
              pendingText="Saving…"
            >
              <Flag className="size-3.5" aria-hidden="true" />
              {ui('Flag')}
            </SubmitButton>
          </form>

          <form action={updateReviewStatusAction} className="contents">
            <input type="hidden" name="return_to" value={returnTo} />
            <input type="hidden" name="review_status" value="unreviewed" />
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="transaction_id" value={id} />
            ))}
            <SubmitButton
              type="submit"
              size="sm"
              variant="secondary"
              className="h-7 gap-1.5"
              pendingText="Saving…"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              {ui('Mark unreviewed')}
            </SubmitButton>
          </form>

          <form action={bulkCategorizeAction} className="flex items-center gap-1.5">
            <input type="hidden" name="return_to" value={returnTo} />
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="transaction_id" value={id} />
            ))}
            <Tag className="size-3.5" aria-hidden="true" />
            <select
              name="category_id"
              defaultValue=""
              required
              aria-label={ui('Categorize selected transactions')}
              className="h-7 max-w-[180px] rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="" disabled>
                {ui('Categorize…')}
              </option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <SubmitButton
              type="submit"
              size="sm"
              variant="secondary"
              className="h-7"
              pendingText="Saving…"
            >
              {ui('Apply')}
            </SubmitButton>
          </form>

          <button
            type="button"
            onClick={exitSelectionMode}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold opacity-90 hover:opacity-100"
          >
            <X className="size-3.5" aria-hidden="true" />
            {ui('Clear')}
          </button>
        </div>
      ) : null}

      {/* @container, not `lg:`: on a tablet the sidebar eats 256px, so a 1024px
          viewport leaves the card about 740px wide. Keyed to the viewport the
          rows switched to columns exactly where they no longer fitted, and
          every description truncated to "Trans…". */}
      <div className="@container overflow-hidden rounded-2xl border bg-card shadow-sm shadow-black/[0.03]">
        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        {/* Deliberately not a column header: each row is its own grid, so
            labels could never line up with the amounts underneath, and a
            list this self-describing does not need them. */}
        <div className="flex items-center gap-3 bg-muted/30 px-3 py-2 sm:px-4">
          {selectionMode ? (
            <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="size-4 rounded border-input accent-primary"
                aria-label={ui('Select all transactions')}
              />
              <span>
                {allSelected
                  ? t('transactionsList.deselectAll')
                  : t('transactionsList.selectAll')}
              </span>
            </label>
          ) : (
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {ui('Activity')}
            </span>
          )}
          <button
            type="button"
            onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
            className="ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {selectionMode ? ui('Done') : ui('Select')}
          </button>
        </div>

        {groups.map((group) => (
          <div key={group.date}>
            <div className="flex items-center gap-2 border-y bg-muted/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:px-4">
              <span className="capitalize">{group.label}</span>
              <span className="h-px flex-1 bg-border/70" aria-hidden="true" />
            </div>
            <div className="divide-y divide-border/60">
              {group.rows.map((row) =>
                editingId === row.id && row.canEdit ? (
                  <InlineEditRow
                    key={row.id}
                    row={row}
                    categories={categories}
                    payees={payeeOptions}
                    returnTo={returnTo}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <DisplayRow
                    key={row.id}
                    row={row}
                    selected={selected.has(row.id)}
                    selectionMode={selectionMode}
                    expanded={expandedId === row.id}
                    compact={compact}
                    returnTo={returnTo}
                    onToggle={() => toggleRow(row.id)}
                    onToggleExpand={() =>
                      setExpandedId((prev) => (prev === row.id ? null : row.id))
                    }
                    onEdit={() => setEditingId(row.id)}
                  />
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReviewControl({ row, returnTo }: { row: TransactionListRow; returnTo: string }) {
  const ui = useUiTranslation()
  const style = reviewStyles[row.reviewStatus]
  return (
    <form action={updateReviewStatusAction}>
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="transaction_id" value={row.id} />
      <select
        name="review_status"
        value={row.reviewStatus}
        aria-label={ui('Review status')}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cn(
          'cursor-pointer appearance-none rounded-full border px-2 py-0.5 text-[10px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          style.className
        )}
      >
        {REVIEW_ORDER.map((value) => (
          <option key={value} value={value} className="text-foreground">
            {ui(reviewStyles[value].label)}
          </option>
        ))}
      </select>
    </form>
  )
}

function DisplayRow({
  row,
  selected,
  selectionMode,
  expanded,
  compact,
  returnTo,
  onToggle,
  onToggleExpand,
  onEdit,
}: {
  row: TransactionListRow
  selected: boolean
  selectionMode: boolean
  expanded: boolean
  compact: boolean
  returnTo: string
  onToggle: () => void
  onToggleExpand: () => void
  onEdit: () => void
}) {
  const ui = useUiTranslation()
  const { openDialog } = useTransactionDialog()
  const showCheckbox = selectionMode || selected
  const amountClass = row.isVoided
    ? 'text-muted-foreground line-through'
    : getAmountColorClass(row.transactionType)
  // Read out here, not inline in the JSX: these compare against stored codes,
  // and the i18n audit treats a bare string inside a JSX expression as visible
  // copy that needs translating.
  const isPending = row.status === 'pending' && !row.isVoided
  const needsReview = row.reviewStatus === 'unreviewed' && !row.isVoided
  const isFlagged = row.reviewStatus === 'flagged'
  // The payee is often all an untitled row has, in which case it is already
  // the title and repeating it beside itself just looks like a bug.
  const showPayee = Boolean(row.merchantName) && row.merchantName !== row.title

  return (
    <div
      className={cn(
        'group/row relative transition-colors',
        row.isVoided
          ? 'text-muted-foreground'
          : selected
          ? 'bg-primary/[0.06]'
          : expanded
          ? 'bg-muted/30'
          : 'hover:bg-muted/40'
      )}
    >
      {selected ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px] bg-primary"
        />
      ) : null}

      {/* -- The row: one line, every breakpoint ----------------------- */}
      {/* The whole line toggles the details - the amount and the chevron are
          part of the tap target, not just the title. The checkbox stops the
          click/keydown from bubbling so selecting a row never expands it. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggleExpand()
          }
        }}
        aria-expanded={expanded}
        aria-label={ui(`Toggle details for ${row.title}`)}
        className={cn(
          'grid cursor-pointer select-none items-center gap-x-3 px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-4',
          // Every column is a fixed width except the description, which takes
          // the slack. An `auto` amount column made each row size itself to
          // its own figure, so "COP 122,342" pushed its category left and
          // "$2.94" pushed it right - no two rows lined up.
          'grid-cols-[auto_minmax(0,1fr)_auto_auto] @min-[60rem]:grid-cols-[auto_minmax(0,1fr)_8rem_9.5rem_10rem_auto]',
          compact ? 'py-1.5' : 'py-2.5'
        )}
      >
        {/* Leading slot: the avatar, or a checkbox once you are selecting. */}
        <span
          className={cn(
            'relative flex shrink-0 items-center justify-center',
            compact ? 'size-8' : 'size-9'
          )}
        >
          {showCheckbox ? null : (
            <span className="transition-opacity @min-[60rem]:group-hover/row:opacity-0">
              <RowAvatar row={row} compact={compact} />
            </span>
          )}
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            className={cn(
              'size-4 cursor-pointer rounded border-input accent-primary',
              showCheckbox
                ? ''
                : 'absolute inset-0 m-auto hidden opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100 @min-[60rem]:block'
            )}
            aria-label={ui(`Select ${row.title}`)}
          />
        </span>

        {/* Description (+ everything the narrow layout has no column for). */}
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                'min-w-0 shrink-[1] truncate font-medium leading-snug',
                row.isVoided && 'line-through'
              )}
            >
              {row.title}
            </span>
            {/* Wide rows have space for the payee beside the title; narrow ones
                already spend their second line on account + category. It gives
                up room three times faster than the title, so a tight row
                clips "Yenifer Murillo" long before it clips what happened. */}
            {showPayee ? (
              <span className="hidden min-w-0 shrink-[3] truncate text-xs text-muted-foreground @min-[60rem]:inline">
                {row.merchantName}
              </span>
            ) : null}
            {isPending ? (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                {ui('Pending')}
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground @min-[60rem]:hidden">
            {/* BR-045 put the time here to tell two same-day entries apart. It
                is gone from the row on purpose: the create form cannot record
                one, so it is empty on everything the user enters by hand and
                only imports carry it. It survives in the details panel. */}
            {row.accountName}
            {/* A transfer's "category" is the literal word Transfer, which the
                arrow icon and the "from -> to" route already say. */}
            {/* No emoji here: the avatar to the left already shows it. */}
            {row.isTransfer ? null : <>{' · '}{row.categoryLeafName}</>}
          </span>
        </span>

        {/* Category / Account / Time: their own columns from `lg` up. */}
        <span className="hidden min-w-0 items-center gap-1.5 @min-[60rem]:flex">
          {row.isTransfer ? (
            <span className="truncate text-sm text-muted-foreground/70">
              {ui('Transfer')}
            </span>
          ) : (
            <span className="truncate text-sm text-muted-foreground">
              {row.categoryLeafName}
            </span>
          )}
        </span>
        <span className="hidden truncate text-sm text-muted-foreground @min-[60rem]:block">
          {row.accountName}
        </span>
        <span
          className={cn(
            'justify-self-end whitespace-nowrap text-right font-semibold tabular-nums leading-snug @min-[60rem]:w-full',
            compact ? 'text-sm' : 'text-[0.9375rem]',
            amountClass
          )}
        >
          {row.amountFormatted}
        </span>

        {/* Review state as a dot rather than a badge in the text: on a page of
            4.000 rows the badge was the loudest thing on screen and the amount
            was not. The slot keeps its width either way so the amounts above
            and below it stay in one column. */}
        <span className="flex shrink-0 items-center gap-2">
          <span className="flex w-1.5 justify-center">
            {needsReview ? (
              <span title={ui('To review')} className="size-1.5 rounded-full bg-amber-500">
                <span className="sr-only">{ui('To review')}</span>
              </span>
            ) : null}
            {isFlagged ? (
              <span title={ui('Flagged')} className="size-1.5 rounded-full bg-red-500">
                <span className="sr-only">{ui('Flagged')}</span>
              </span>
            ) : null}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-4 text-muted-foreground/50 transition-transform group-hover/row:text-muted-foreground',
              expanded && 'rotate-180'
            )}
          />
        </span>
      </div>

      {/* -- Details: behind the chevron on every breakpoint ------------ */}
      {/* Desktop used to render this inline for every row, which is what made
          a long list read like a settings screen instead of a statement. */}
      <div
        className={cn(
          'space-y-2.5 px-3 pb-3 pl-15 sm:px-4 sm:pl-16',
          expanded ? 'block' : 'hidden'
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-xs">
            {row.typeBadgeLabel}
          </Badge>
          <StatusBadge status={row.status} />
          {row.isImported ? (
            <Badge variant="outline" className="text-xs">
              {ui('Imported')}
            </Badge>
          ) : null}
          {row.currencyCode ? <span>{row.currencyCode}</span> : null}
          {row.merchantName ? <span>· {row.merchantName}</span> : null}
          {/* The row only had room for the leaf, so this is where you find out
              which parent it hangs from. */}
          {row.isTransfer ? null : <span>· {row.categoryName}</span>}
          {row.timeFormatted ? (
            <span className="tabular-nums">· {row.timeFormatted}</span>
          ) : null}
          {row.transferCostFormatted ? (
            <span className="text-amber-600 dark:text-amber-400">
              {ui('· incl.')} {row.transferCostFormatted} {ui('cost')}
            </span>
          ) : null}
          {row.voidReason ? <span>{ui('· Voided:')} {row.voidReason}</span> : null}
        </div>

        {row.notes ? (
          <p className="text-xs italic text-muted-foreground/70">{row.notes}</p>
        ) : null}

        {row.tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {row.tags.map((tag) => (
              <TagChip key={tag.id} name={tag.name} color={tag.color} size="sm" />
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          {!row.isVoided ? <ReviewControl row={row} returnTo={returnTo} /> : null}
          {row.canEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              {ui('Quick edit')}
            </button>
          ) : null}
          {row.canEdit || row.canEditTransfer ? (
            <Link
              href={row.editHref}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {ui('Edit')}
            </Link>
          ) : null}
          {/* BR-034: opens the create form pre-filled from this row, dated
              today. Nothing is written until the user saves. */}
          {row.copy ? (
            <button
              type="button"
              onClick={() => openDialog({ copy: row.copy ?? undefined })}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
            >
              <Copy className="size-3.5" aria-hidden="true" />
              {ui('Copy')}
            </button>
          ) : null}
          {/* BR-040: a refund goes in the *same category* as a negative amount,
              so the category nets to what the purchase really cost. Booking it
              as income would inflate both sides instead. */}
          {row.refundHref ? (
            <Link
              href={row.refundHref}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
            >
              <Undo2 className="size-3.5" aria-hidden="true" />
              {ui('Refund')}
            </Link>
          ) : null}
          {row.canVoid ? <VoidTransactionForm transactionId={row.id} /> : null}
        </div>
      </div>
    </div>
  )
}

function InlineEditRow({
  row,
  categories,
  payees,
  returnTo,
  onCancel,
}: {
  row: TransactionListRow
  categories: TransactionListCategory[]
  payees: PayeeOption[]
  returnTo: string
  onCancel: () => void
}) {
  const ui = useUiTranslation()
  const transactionType = row.transactionType === 'income' ? 'income' : 'expense'
  return (
    <div className="bg-primary/5 p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-primary">
        {ui('Quick edit')}
      </p>
      <form action={updateManualTransactionAction} className="space-y-3">
        <input type="hidden" name="transaction_id" value={row.id} />
        <input type="hidden" name="return_to" value={returnTo} />
        <input type="hidden" name="transaction_date" value={row.transactionDate} />
        <input type="hidden" name="account_id" value={row.accountId ?? ''} />
        <input type="hidden" name="status" value={row.status} />
        <input type="hidden" name="description" value={row.description ?? ''} />
        <input type="hidden" name="notes" value={row.notes ?? ''} />

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <PayeePicker
              payees={payees}
              defaultValue={row.merchantName ?? ''}
              label={ui(row.transactionType === 'income' ? 'Payer' : 'Payee')}
              labelClassName="text-xs font-normal text-muted-foreground"
              inputId={`inline_payee_${row.id}`}
            />
          </div>

          <div className="space-y-1 sm:col-span-1">
            <label
              htmlFor={`inline_amount_${row.id}`}
              className="text-xs text-muted-foreground"
            >
              {ui('Amount')}
            </label>
            <AmountInput
              id={`inline_amount_${row.id}`}
              name="amount"
              currencyCode={row.currencyCode ?? 'USD'}
              defaultValue={row.amountRaw ?? ''}
              required
            />
          </div>

          <div className="sm:col-span-1">
            <CategoryPicker
              categories={categories}
              transactionType={transactionType}
              defaultCategoryId={row.categoryId ?? undefined}
              onCategoryChange={() => undefined}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <SubmitButton type="submit" size="sm" pendingText="Saving…">
            {ui('Save')}
          </SubmitButton>
          <button
            type="button"
            onClick={onCancel}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {ui('Cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}
