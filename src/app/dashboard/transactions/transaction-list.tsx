'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Pencil,
  Tag,
  X,
} from 'lucide-react'
import {
  bulkCategorizeAction,
  updateManualTransactionAction,
  updateReviewStatusAction,
} from './actions'
import { CategoryPicker } from './category-picker'
import { VoidTransactionForm } from './void-transaction-form'
import { AmountInput } from '@/components/amount-input'
import { SubmitButton } from '@/components/submit-button'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/status-badge'
import { cn } from '@/lib/utils'

export type ReviewStatus = 'unreviewed' | 'reviewed' | 'flagged'

export type TransactionListCategory = {
  id: string
  name: string
  category_type: string
  parent_category_id: string | null
  icon?: string | null
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
}

export type TransactionListGroup = {
  date: string
  label: string
  rows: TransactionListRow[]
}

type TransactionListProps = {
  groups: TransactionListGroup[]
  categories: TransactionListCategory[]
  merchantSuggestions: string[]
  returnTo: string
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
  categoriesById: Map<string, TransactionListCategory>
) {
  const parent = category.parent_category_id
    ? categoriesById.get(category.parent_category_id)
    : null
  const name = parent ? `${parent.name} / ${category.name}` : category.name
  return category.icon ? `${category.icon} ${name}` : name
}

export function TransactionList({
  groups,
  categories,
  merchantSuggestions,
  returnTo,
}: TransactionListProps) {
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
        .map((c) => ({ id: c.id, label: categoryLabel(c, categoriesById) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories, categoriesById]
  )
  const merchantListId = 'merchant-suggestions'

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
      <datalist id={merchantListId}>
        {merchantSuggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {/* ── Bulk action bar ───────────────────────────────────────────── */}
      {selectedIds.length > 0 ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-primary px-3 py-2 text-primary-foreground shadow-sm">
          <span className="text-sm font-semibold">
            {selectedIds.length} selected
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
              Mark reviewed
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
              aria-label="Categorize selected transactions"
              className="h-7 max-w-[180px] rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="" disabled>
                Categorize…
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
              Apply
            </SubmitButton>
          </form>

          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold opacity-90 hover:opacity-100"
          >
            <X className="size-3.5" aria-hidden="true" />
            Clear
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
            aria-label="Select all transactions"
          />
          <span>{allSelected ? 'Deselect all' : 'Select all'}</span>
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
                    merchantListId={merchantListId}
                    returnTo={returnTo}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <DisplayRow
                    key={row.id}
                    row={row}
                    selected={selected.has(row.id)}
                    expanded={expandedId === row.id}
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
  const style = reviewStyles[row.reviewStatus]
  return (
    <form action={updateReviewStatusAction}>
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="transaction_id" value={row.id} />
      <select
        name="review_status"
        value={row.reviewStatus}
        aria-label="Review status"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cn(
          'cursor-pointer appearance-none rounded-full border px-2 py-0.5 text-[10px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          style.className
        )}
      >
        {REVIEW_ORDER.map((value) => (
          <option key={value} value={value} className="text-foreground">
            {reviewStyles[value].label}
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
  returnTo,
  onToggle,
  onToggleExpand,
  onEdit,
}: {
  row: TransactionListRow
  selected: boolean
  expanded: boolean
  returnTo: string
  onToggle: () => void
  onToggleExpand: () => void
  onEdit: () => void
}) {
  return (
    <div
      className={cn(
        'p-3 transition-colors sm:p-4',
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
          aria-label={`Select ${row.title}`}
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
              'shrink-0 text-base font-semibold tabular-nums leading-snug',
              getAmountColorClass(row.transactionType)
            )}
          >
            {row.amountFormatted}
          </p>
        ) : null}

        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform sm:hidden',
            expanded && 'rotate-180'
          )}
        />
      </div>

      {/* ── Details: collapsed on mobile, always shown on desktop ─────── */}
      <div
        className={cn(
          'space-y-2 pl-7 pt-2 sm:block',
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
              Imported
            </Badge>
          ) : null}
          {row.currencyCode ? <span>{row.currencyCode}</span> : null}
          {row.merchantName ? <span>· {row.merchantName}</span> : null}
          {row.voidReason ? <span>· Voided: {row.voidReason}</span> : null}
        </div>

        {row.notes ? (
          <p className="text-xs italic text-muted-foreground/70">{row.notes}</p>
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
              Quick edit
            </button>
          ) : null}
          {row.canEdit || row.canEditTransfer ? (
            <Link
              href={row.editHref}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Edit
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
  merchantListId,
  returnTo,
  onCancel,
}: {
  row: TransactionListRow
  categories: TransactionListCategory[]
  merchantListId: string
  returnTo: string
  onCancel: () => void
}) {
  const transactionType = row.transactionType === 'income' ? 'income' : 'expense'
  return (
    <div className="bg-primary/5 p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-primary">
        Quick edit
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
          <div className="space-y-1 sm:col-span-1">
            <label
              htmlFor={`inline_merchant_${row.id}`}
              className="text-xs text-muted-foreground"
            >
              Merchant
            </label>
            <Input
              id={`inline_merchant_${row.id}`}
              name="merchant_name"
              list={merchantListId}
              defaultValue={row.merchantName ?? ''}
              placeholder="Merchant"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1 sm:col-span-1">
            <label
              htmlFor={`inline_amount_${row.id}`}
              className="text-xs text-muted-foreground"
            >
              Amount
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
            Save
          </SubmitButton>
          <button
            type="button"
            onClick={onCancel}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
