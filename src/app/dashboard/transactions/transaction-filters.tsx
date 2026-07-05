'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Search, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AccountOption = {
  id: string
  label: string
  isArchived: boolean
}

type CategoryOption = {
  id: string
  label: string
  isArchived: boolean
}

type PresetLink = {
  label: string
  href: string
  isActive: boolean
}

type TransactionFiltersProps = {
  searchText: string
  selectedType: string
  selectedStatus: string
  selectedReview: string
  selectedAccountIds: string[]
  selectedCategoryIds: string[]
  resolvedDateFrom: string
  resolvedDateTo: string
  hasActiveFilters: boolean
  accountOptions: AccountOption[]
  categoryOptions: CategoryOption[]
  presetLinks: PresetLink[]
}

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
] as const

const chipSelectClassName =
  'max-w-[150px] cursor-pointer truncate bg-transparent text-sm font-medium text-foreground outline-none'

const chipLabelClassName =
  'flex h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-2.5'

function MultiSelectChip({
  label,
  name,
  options,
  selectedIds,
}: {
  label: string
  name: string
  options: { id: string; label: string; isArchived?: boolean }[]
  selectedIds: string[]
}) {
  // Track draft selections locally so the user can tick several options without
  // the page reloading after each click. Changes apply only on "Apply filters".
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selectedIds))

  function toggle(id: string, isChecked: boolean) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (isChecked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const summary =
    checked.size === 0
      ? 'All'
      : checked.size === 1
        ? options.find((o) => o.id === [...checked][0])?.label ?? '1 selected'
        : `${checked.size} selected`

  return (
    <details className="relative shrink-0">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border bg-background px-2.5 [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="max-w-[120px] truncate text-sm font-medium text-foreground">
          {summary}
        </span>
      </summary>
      <div className="absolute z-20 mt-1 max-h-60 w-56 overflow-auto rounded-lg border bg-popover p-1 shadow-md">
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No options</p>
        ) : (
          options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <input
                type="checkbox"
                name={name}
                value={option.id}
                checked={checked.has(option.id)}
                onChange={(e) => toggle(option.id, e.currentTarget.checked)}
                className="size-3.5 accent-primary"
              />
              <span className="truncate">
                {option.label}
                {option.isArchived ? ' (archived)' : ''}
              </span>
            </label>
          ))
        )}
      </div>
    </details>
  )
}

export function TransactionFilters({
  searchText,
  selectedType,
  selectedStatus,
  selectedReview,
  selectedAccountIds,
  selectedCategoryIds,
  resolvedDateFrom,
  resolvedDateTo,
  hasActiveFilters,
  accountOptions,
  categoryOptions,
  presetLinks,
}: TransactionFiltersProps) {
  const typeRef = useRef<HTMLInputElement>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  function selectType(form: HTMLFormElement | null, value: string) {
    if (!form) return
    // The chip selects auto-submit without a submitter, so `type` is carried by
    // this single hidden input rather than per-button submit values.
    if (typeRef.current) typeRef.current.value = value
    form.requestSubmit()
  }

  const moreFiltersCount =
    selectedAccountIds.length +
    selectedCategoryIds.length +
    (selectedStatus !== 'all' ? 1 : 0)

  return (
    <form method="get" action="/dashboard/transactions" className="space-y-2.5">
      <input type="hidden" name="type" ref={typeRef} defaultValue={selectedType} />
      {selectedReview !== 'all' ? (
        <input type="hidden" name="review" value={selectedReview} />
      ) : null}

      {/* ── Primary bar: type toggle · search · mobile filters toggle ──── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Type segmented control */}
        <div className="flex shrink-0 rounded-lg border bg-background p-0.5">
          {TYPE_OPTIONS.map((option) => {
            const isActive = selectedType === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={(e) => selectType(e.currentTarget.form, option.value)}
                aria-pressed={isActive}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative min-w-[140px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="search"
            defaultValue={searchText}
            placeholder="Search transactions…"
            className="pl-9"
            aria-label="Search transactions"
          />
        </div>

        {/* Mobile-only toggle for the secondary filter row */}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className={cn(
            buttonVariants({ variant: moreFiltersCount > 0 ? 'secondary' : 'outline', size: 'sm' }),
            'gap-1.5 sm:hidden'
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filters
          {moreFiltersCount > 0 ? (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {moreFiltersCount}
            </span>
          ) : null}
        </button>
      </div>

      {/* ── Secondary bar: account/category/status + date range ─────────── */}
      <div className={cn('flex-col gap-2.5 sm:flex', moreOpen ? 'flex' : 'hidden')}>
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelectChip
            label="Account"
            name="account_id"
            options={accountOptions}
            selectedIds={selectedAccountIds}
          />

          <MultiSelectChip
            label="Category"
            name="category_id"
            options={categoryOptions}
            selectedIds={selectedCategoryIds}
          />

          <label className={chipLabelClassName}>
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            <select
              name="status"
              defaultValue={selectedStatus}
              className={chipSelectClassName}
              aria-label="Filter by status"
            >
              <option value="all">All</option>
              <option value="posted">Posted</option>
              <option value="pending">Pending</option>
              <option value="voided">Voided</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {presetLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              aria-current={link.isActive ? 'true' : undefined}
              className={buttonVariants({
                // Solid primary fill for the active preset (matching the type
                // toggle) so the selected range is obvious, not a faint tint.
                variant: link.isActive ? 'default' : 'outline',
                size: 'sm',
              })}
            >
              {link.label}
            </Link>
          ))}

          {/* `key` ties each uncontrolled input to the server-resolved range so a
              client-side preset navigation remounts it with the new value. Without
              this, `defaultValue` is ignored on re-render and the field keeps its
              stale (e.g. this-month) value, which "Apply filters" would then
              re-submit and clobber the range the user just picked (BF-024). */}
          <label className={chipLabelClassName}>
            <span className="text-xs font-medium text-muted-foreground">From</span>
            <input
              key={resolvedDateFrom}
              type="date"
              name="date_from"
              defaultValue={resolvedDateFrom}
              className="bg-transparent text-sm text-foreground outline-none"
              aria-label="From date"
            />
          </label>

          <label className={chipLabelClassName}>
            <span className="text-xs font-medium text-muted-foreground">To</span>
            <input
              key={resolvedDateTo}
              type="date"
              name="date_to"
              defaultValue={resolvedDateTo}
              className="bg-transparent text-sm text-foreground outline-none"
              aria-label="To date"
            />
          </label>

          <div className="ml-auto flex items-center gap-1.5">
            {hasActiveFilters ? (
              <Link
                href="/dashboard/transactions"
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                Clear all
              </Link>
            ) : null}
            <button
              type="submit"
              className={buttonVariants({ size: 'sm' })}
            >
              Apply filters
            </button>
          </div>
        </div>
      </div>

      {/* Submit fallback for keyboard users editing the search field */}
      <button type="submit" className="sr-only">
        Apply filters
      </button>
    </form>
  )
}
