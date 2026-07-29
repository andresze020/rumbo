'use client'

import { useMemo, useState } from 'react'
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
  categoryName: string
  categoryIcon: string | null
  categoryColor: string | null
  merchantName: string | null
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

function getAmountColorClass(transactionType: string) {
  if (transactionType === 'income') return 'text-emerald-600 dark:text-emerald-400'
  if (transactionType === 'expense') return 'text-red-600 dark:text-red-400'
  return ''
}

function RowTypeIcon({
  transactionType,
  className,
}: {
  transactionType: string
  className?: string
}) {
  if (transactionType === 'income') {
    return <ArrowDownLeft className={className} aria-hidden="true" />
  }
  if (transactionType === 'expense') {
    return <ArrowUpRight className={className} aria-hidden="true" />
  }
  return <ArrowLeftRight className={className} aria-hidden="true" />
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
  // On mobile each row collapses to a single compact line; tapping it expands
  // the badges/details/actions. Desktop always shows the full row.
  const [expandedId, setExpandedId] = useState<string | null>(null)

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

  const selectedIds = Array.from(selected)

  return (
    <div className="space-y-2">
      {/* ── Bulk action bar ───────────────────────────────────────────── */}
      {selectedIds.length > 0 ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-primary px-3 py-2 text-primary-foreground shadow-sm">
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
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold opacity-90 hover:opacity-100"
          >
            <X className="size-3.5" aria-hidden="true" />
            {ui('Clear')}
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
        {/* ── Select-all toolbar ──────────────────────────────────────── */}
        <label className="flex cursor-pointer items-center gap-2.5 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
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

        {groups.map((group) => (
          <div key={group.date}>
            <div className="border-b bg-muted/40 px-4 py-1.5 text-xs font-medium capitalize text-muted-foreground">
              {group.label}
            </div>
            <div className="divide-y">
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
  expanded,
  compact,
  returnTo,
  onToggle,
  onToggleExpand,
  onEdit,
}: {
  row: TransactionListRow
  selected: boolean
  expanded: boolean
  compact: boolean
  returnTo: string
  onToggle: () => void
  onToggleExpand: () => void
  onEdit: () => void
}) {
  const ui = useUiTranslation()
  const { openDialog } = useTransactionDialog()
  return (
    <div
      className={cn(
        'transition-colors',
        compact ? 'px-3 py-2 sm:px-4' : 'p-3 sm:p-4',
        row.isVoided
          ? 'bg-muted/30 text-muted-foreground'
          : selected
          ? 'bg-primary/5'
          : 'hover:bg-muted/30'
      )}
    >
      {/* ── Compact summary line (single row on mobile) ───────────────── */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="size-4 shrink-0 rounded border-input accent-primary"
          aria-label={ui(`Select ${row.title}`)}
        />

        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <RowTypeIcon
            transactionType={row.transactionType}
            className={cn('size-4 shrink-0', getAmountColorClass(row.transactionType))}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium leading-snug">{row.title}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {row.accountName}
              {' · '}
              {row.categoryIcon ? `${row.categoryIcon} ` : ''}
              {row.categoryName}
            </span>
          </span>
        </button>

        {row.amountFormatted ? (
          <p
            className={cn(
              'shrink-0 font-semibold tabular-nums leading-snug',
              compact ? 'text-sm' : 'text-base',
              getAmountColorClass(row.transactionType)
            )}
          >
            {row.amountFormatted}
          </p>
        ) : null}

        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            compact ? '' : 'sm:hidden',
            expanded && 'rotate-180'
          )}
        />
      </div>

      {/* ── Details: collapsed on mobile, always shown on desktop ─────── */}
      {/* Compact mode keeps the details behind the row toggle on every
          breakpoint — that collapse is where the vertical space comes from. */}
      <div
        className={cn(
          'space-y-2 pl-7 pt-2',
          compact ? '' : 'sm:block',
          expanded ? 'block' : 'hidden'
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
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
