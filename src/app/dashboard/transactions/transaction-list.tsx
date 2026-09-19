'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  CheckSquare,
  ChevronDown,
  Copy,
  Flag,
  MoreHorizontal,
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
  /** Transfers and debt payments: the two ends, for the row's "A → B" line. */
  transferFromName: string | null
  transferToName: string | null
  /** The transaction's own date, spelled out — details panel only. */
  dateLabel: string
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
  /** Server-rendered counts for the whole filtered set. */
  meta?: ReactNode
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
 * One colour per direction of money, matching the avatar tints and the totals
 * above the list: green in, red out, blue sideways, neutral for everything that
 * is neither (opening balances, adjustments).
 *
 * The reds and greens are the 600/400 pair the rest of the app uses, not a
 * saturated alert red — a month of ordinary spending should read as a list,
 * not as a wall of alarms.
 */
function getAmountColorClass(transactionType: string) {
  if (transactionType === 'income') return 'text-emerald-600 dark:text-emerald-400'
  if (transactionType === 'expense') return 'text-rose-600 dark:text-rose-400'
  // BR-040: a refund is money coming back, so it reads green like an inflow —
  // but it is deliberately not the same green as income, because it did not
  // increase what the household earned, it reduced what it spent.
  if (transactionType === 'refund') return 'text-teal-600 dark:text-teal-400'
  // A transfer moves money without earning or spending it: its own colour, so
  // the eye can skip it when reading a month's income and expenses.
  if (transactionType === 'transfer') return 'text-sky-600 dark:text-sky-400'
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
        compact ? 'size-9' : 'size-10',
        row.isVoided ? 'bg-muted' : accent ? '' : tint.surface
      )}
      style={
        accent
          ? { backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)` }
          : undefined
      }
    >
      {showEmoji ? (
        <span className={cn('leading-none', compact ? 'text-base' : 'text-[1.0625rem]')}>
          {row.categoryIcon}
        </span>
      ) : (
        <RowTypeIcon
          transactionType={row.transactionType}
          className={cn(
            compact ? 'size-4' : 'size-[1.125rem]',
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
  meta,
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

  /** Long-press: enter selection mode with the pressed row already picked. */
  function beginSelection(id: string) {
    setSelectionMode(true)
    setExpandedId(null)
    setSelected(new Set([id]))
  }

  const selectedIds = Array.from(selected)

  return (
    <div className="space-y-1.5">
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
          viewport leaves the list about 740px wide. Keyed to the viewport the
          rows switched to columns exactly where they no longer fitted, and
          every description truncated to "Trans…".

          No card around it any more. The list *is* the screen here, and a
          bordered box holding date headers holding rows was three nested
          surfaces to say one thing. */}
      <div className="@container">
        {/* ── List strip ──────────────────────────────────────────────── */}
        {/* What used to be an "ACTIVITY" title bar, and then a permanent
            "Select" nobody needed on most visits. It carries the count; bulk
            selection is a long-press on a row, or the overflow menu. */}
        <div className="flex min-h-9 items-center gap-3 px-1">
          {selectionMode ? (
            <label className="relative flex cursor-pointer items-center gap-2.5 text-xs font-medium text-foreground before:absolute before:inset-x-0 before:-top-2 before:-bottom-2 before:content-['']">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="size-4 rounded border-input accent-primary"
                aria-label={ui('Select all transactions')}
              />
              <span>
                {selectedIds.length > 0
                  ? ui(`${selectedIds.length} selected`)
                  : t('transactionsList.selectAll')}
              </span>
            </label>
          ) : (
            <span className="truncate text-xs text-muted-foreground">{meta}</span>
          )}

          {selectionMode ? (
            <button
              type="button"
              onClick={exitSelectionMode}
              className="relative ml-auto shrink-0 rounded-md px-1 text-xs font-semibold text-muted-foreground transition-colors before:absolute before:inset-x-0 before:-top-2.5 before:-bottom-2.5 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {ui('Cancel')}
            </button>
          ) : (
            <ListMenu onSelectTransactions={() => setSelectionMode(true)} />
          )}
        </div>

        {groups.map((group) => (
          <section key={group.date} aria-labelledby={`group-${group.date}`}>
            {/* Sticky inside `#app-scroll` (the shell's middle row is the only
                scroller), so the date you are reading under stays named.
                Opaque, not a tint: rows scroll underneath it. */}
            <h3
              id={`group-${group.date}`}
              className="sticky top-0 z-10 bg-background px-1 py-1.5 text-xs font-semibold capitalize text-foreground/75"
            >
              {group.label}
            </h3>
            <ul className="divide-y divide-border/50">
              {group.rows.map((row) =>
                editingId === row.id && row.canEdit ? (
                  <li key={row.id}>
                    <InlineEditRow
                      row={row}
                      categories={categories}
                      payees={payeeOptions}
                      returnTo={returnTo}
                      onCancel={() => setEditingId(null)}
                    />
                  </li>
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
                      // While triaging, a tap picks the row rather than opening
                      // it — the native pattern, and the only one that does not
                      // ask for a 16px checkbox to be hit repeatedly.
                      selectionMode
                        ? toggleRow(row.id)
                        : setExpandedId((prev) => (prev === row.id ? null : row.id))
                    }
                    onLongPress={() => beginSelection(row.id)}
                    onEdit={() => setEditingId(row.id)}
                  />
                )
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

/**
 * The list's own overflow menu.
 *
 * Bulk selection used to be a "Select" button pinned beside the count on every
 * visit, for a job most visits never do. It is a long press on a row now, and
 * this is the discoverable way to the same thing — and where the next
 * list-level action will go rather than growing the strip again.
 */
function ListMenu({ onSelectTransactions }: { onSelectTransactions: () => void }) {
  const ui = useUiTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target && rootRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <details ref={rootRef} open={open} className="relative ml-auto shrink-0">
      <summary
        onClick={(event) => {
          event.preventDefault()
          setOpen((current) => !current)
        }}
        aria-label={ui('List options')}
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border bg-popover p-1 shadow-md">
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            onSelectTransactions()
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors hover:bg-accent"
        >
          <CheckSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {ui('Select transactions')}
        </button>
      </div>
    </details>
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
  onLongPress,
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
  onLongPress: () => void
  onEdit: () => void
}) {
  const ui = useUiTranslation()
  const { openDialog } = useTransactionDialog()
  const longPress = useLongPress(onLongPress)
  const showCheckbox = selectionMode || selected
  const amountClass = row.isVoided
    ? 'text-muted-foreground line-through'
    : getAmountColorClass(row.transactionType)
  // Read out here, not inline in the JSX: these compare against stored codes,
  // and the i18n audit treats a bare string inside a JSX expression as visible
  // copy that needs translating.
  const isPending = row.status === 'pending' && !row.isVoided
  // The payee is often all an untitled row has, in which case it is already
  // the title and repeating it beside itself just looks like a bug.
  const showPayee = Boolean(row.merchantName) && row.merchantName !== row.title
  const hasRoute = Boolean(row.transferFromName && row.transferToName)

  return (
    <li
      className={cn(
        'group/row relative rounded-lg transition-colors',
        row.isVoided
          ? 'text-muted-foreground'
          : selected
          ? 'bg-primary/[0.06]'
          : expanded
          ? 'bg-muted/40'
          : 'hover:bg-muted/40'
      )}
    >
      {selected ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px] rounded-full bg-primary"
        />
      ) : null}

      {/* -- The collapsed row -----------------------------------------------
          Financial information only: what it was, where it came from or went,
          and how much. No review state — that is behind the chevron now, where
          the user has asked for the detail. The whole line is the tap target,
          so nobody has to hit a 16px chevron. */}
      <div
        role="button"
        tabIndex={0}
        {...longPress.handlers}
        onClick={() => {
          // A long press already did something; the click that follows it is
          // the finger lifting, not a second intent.
          if (longPress.consumeFired()) return
          onToggleExpand()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggleExpand()
          }
        }}
        aria-expanded={expanded}
        aria-label={ui(`Toggle details for ${row.title}`)}
        className={cn(
          'grid cursor-pointer select-none items-center gap-x-3 rounded-lg px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:px-2',
          // Every column is a fixed width except the description, which takes
          // the slack. An `auto` amount column made each row size itself to
          // its own figure, so "COP 122,342" pushed its category left and
          // "$2.94" pushed it right - no two rows lined up.
          'grid-cols-[2.5rem_minmax(0,1fr)_auto] @min-[60rem]:grid-cols-[2.5rem_minmax(0,1fr)_8rem_9.5rem_auto]',
          // 44px minimum on the tap target even at the tightest density.
          compact ? 'min-h-11 py-1.5' : 'min-h-14 py-2'
        )}
      >
        {/* Leading slot: the avatar, or a checkbox once you are selecting. */}
        <span
          className={cn(
            'relative flex shrink-0 items-center justify-center',
            compact ? 'size-9' : 'size-10'
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
                compact ? 'text-sm' : 'text-[0.9375rem]',
                row.isVoided && 'line-through'
              )}
            >
              {row.title}
            </span>
            {/* The strike-through and the muted colour carry this visually;
                a screen reader gets nothing from either. */}
            {row.isVoided ? <span className="sr-only">{ui('Voided')}</span> : null}
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
              <span className="hidden shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold text-amber-700 @min-[60rem]:inline dark:text-amber-400">
                {ui('Pending')}
              </span>
            ) : null}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground/90 @min-[60rem]:hidden">
            {/* On the second line, not beside the title: a six-figure COP
                amount leaves a 320px row barely 60px for its description, and
                a badge up there took the last of it. */}
            {isPending ? (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                {ui('Pending')}
              </span>
            ) : null}
            <span className="min-w-0 truncate">
            {/* BR-045 put the time here to tell two same-day entries apart. It
                is gone from the row on purpose: the create form cannot record
                one, so it is empty on everything the user enters by hand and
                only imports carry it. It survives in the details panel. */}
            {/* A transfer is one linked operation, never two rows — so it reads
                as a route, "from → to", not as a category it does not have. */}
            {hasRoute ? (
              <>
                {row.transferFromName}
                <span aria-hidden="true"> → </span>
                {row.transferToName}
              </>
            ) : (
              <>
                {row.accountName}
                {/* No emoji here: the avatar to the left already shows it. */}
                {row.isTransfer ? null : <>{' · '}{row.categoryLeafName}</>}
              </>
            )}
            </span>
          </span>
        </span>

        {/* Category / Account: their own columns from `lg` up. */}
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
          {hasRoute ? (
            <>
              {row.transferFromName}
              <span aria-hidden="true"> → </span>
              {row.transferToName}
            </>
          ) : (
            row.accountName
          )}
        </span>

        {/* Amount + chevron share one cell. The chevron is a fixed width, so
            the figures still line up in one column down the list. */}
        <span className="flex shrink-0 items-center justify-end gap-1.5">
          <span
            className={cn(
              'whitespace-nowrap text-right font-semibold tabular-nums leading-snug',
              compact ? 'text-sm' : 'text-[0.9375rem]',
              amountClass
            )}
          >
            {row.amountFormatted}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-4 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover/row:text-muted-foreground motion-reduce:transition-none',
              expanded && 'rotate-180'
            )}
          />
        </span>
      </div>

      {/* -- Details: behind the chevron on every breakpoint ------------ */}
      {/* Desktop used to render this inline for every row, which is what made
          a long list read like a settings screen instead of a statement. */}
      {expanded ? (
        <div className="px-1 pb-3 pl-[3.25rem] duration-200 animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none sm:px-2 sm:pl-[3.5rem]">
          <div className="space-y-2.5 border-t border-border/60 pt-2.5">
            <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              <DetailRow label={ui('Date')}>
                <span className="tabular-nums">{row.dateLabel}</span>
                {row.timeFormatted ? (
                  <span className="tabular-nums text-muted-foreground">
                    {' · '}
                    {row.timeFormatted}
                  </span>
                ) : null}
              </DetailRow>

              <DetailRow label={ui('Type')}>{row.typeBadgeLabel}</DetailRow>

              {row.amountFormatted ? (
                <DetailRow label={ui('Amount')}>
                  <span className={cn('font-semibold tabular-nums', amountClass)}>
                    {row.amountFormatted}
                  </span>
                  {row.currencyCode ? (
                    <span className="text-muted-foreground"> {row.currencyCode}</span>
                  ) : null}
                </DetailRow>
              ) : null}

              {hasRoute ? (
                <>
                  <DetailRow label={ui('From account')}>
                    {row.transferFromName}
                  </DetailRow>
                  <DetailRow label={ui('To account')}>{row.transferToName}</DetailRow>
                </>
              ) : (
                <DetailRow label={ui('Account')}>{row.accountName}</DetailRow>
              )}

              {row.isTransfer ? null : (
                <DetailRow label={ui('Category')}>{row.categoryName}</DetailRow>
              )}

              {showPayee ? (
                <DetailRow label={ui('Payee')}>{row.merchantName}</DetailRow>
              ) : null}

              {/* Cross-currency transfers carry their cost (FX spread + fee) as
                  an expense allocation — it belongs on the transfer it came
                  from, not only in reports. */}
              {row.transferCostFormatted ? (
                <DetailRow label={ui('Transfer cost')}>
                  <span className="tabular-nums text-amber-600 dark:text-amber-400">
                    {row.transferCostFormatted}
                  </span>
                </DetailRow>
              ) : null}

              {row.notes ? (
                <DetailRow label={ui('Notes')}>
                  <span className="whitespace-pre-line">{row.notes}</span>
                </DetailRow>
              ) : null}

              {row.voidReason ? (
                <DetailRow label={ui('Void reason')}>{row.voidReason}</DetailRow>
              ) : null}
            </dl>

            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={row.status} />
              {row.isImported ? (
                <Badge variant="outline" className="text-xs">
                  {ui('Imported')}
                </Badge>
              ) : null}
              {/* BR-011: the review state lives here, not on the collapsed row.
                  The column, the filter and the bulk actions are untouched —
                  only the place it is shown moved. */}
              {row.isVoided ? (
                <Badge
                  variant="outline"
                  className={cn('text-xs', reviewStyles[row.reviewStatus].className)}
                >
                  {ui(reviewStyles[row.reviewStatus].label)}
                </Badge>
              ) : (
                <ReviewControl row={row} returnTo={returnTo} />
              )}
            </div>

            {row.tags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                {row.tags.map((tag) => (
                  <TagChip key={tag.id} name={tag.name} color={tag.color} size="sm" />
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-1.5">
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
              {/* BR-040: a refund goes in the *same category* as a negative
                  amount, so the category nets to what the purchase really cost.
                  Booking it as income would inflate both sides instead. */}
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
      ) : null}
    </li>
  )
}

/**
 * Press and hold to start selecting.
 *
 * Touch only: on a pointer device the row already reveals a checkbox on hover,
 * and a mouse held still over a list is not a gesture. The press is abandoned
 * the moment the finger travels — otherwise every flick-scroll that started on
 * a row would drop the user into selection mode.
 */
function useLongPress(onLongPress: () => void, delayMs = 500) {
  const state = useRef({
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    x: 0,
    y: 0,
    fired: false,
  })

  function cancel() {
    if (state.current.timer) clearTimeout(state.current.timer)
    state.current.timer = undefined
  }

  useEffect(() => cancel, [])

  return {
    handlers: {
      onPointerDown(event: React.PointerEvent) {
        if (event.pointerType === 'mouse') return
        cancel()
        state.current.x = event.clientX
        state.current.y = event.clientY
        state.current.fired = false
        state.current.timer = setTimeout(() => {
          state.current.fired = true
          onLongPress()
        }, delayMs)
      },
      onPointerMove(event: React.PointerEvent) {
        if (!state.current.timer) return
        const moved =
          Math.abs(event.clientX - state.current.x) > 8 ||
          Math.abs(event.clientY - state.current.y) > 8
        if (moved) cancel()
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onContextMenu(event: React.MouseEvent) {
        // Android fires the context menu at the same moment the press fires;
        // letting it through would put a text-selection menu over the sheet.
        if (state.current.fired) event.preventDefault()
      },
    },
    /** True once per long press, for the click that follows it. */
    consumeFired() {
      if (!state.current.fired) return false
      state.current.fired = false
      return true
    },
  }
}

/** One `label: value` pair in the expanded panel. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="whitespace-nowrap text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </>
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
