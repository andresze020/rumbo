'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { buttonVariants } from '@/components/ui/button'
import { MultiSelectChip } from '@/components/multi-select-chip'
import { cn } from '@/lib/utils'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'

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

type TagOption = {
  id: string
  label: string
  isArchived?: boolean
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
  tagOptions: TagOption[]
  selectedTagIds: string[]
  presetLinks: PresetLink[]
  /** Active payee focus filter, carried through the form so Apply keeps it. */
  payeeId?: string
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

/** Mobile control-strip pill: one compact, tappable, horizontally scrolling unit. */
const pillCls =
  'flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-background px-3 text-xs font-medium text-foreground'

const activePillCls = 'border-primary/40 bg-primary/10 text-primary'

const STATUS_LABELS: Record<string, string> = {
  posted: 'Posted',
  pending: 'Pending',
  voided: 'Voided',
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
  tagOptions,
  selectedTagIds,
  presetLinks,
  payeeId,
}: TransactionFiltersProps) {
  const ui = useUiTranslation()
  const typeRef = useRef<HTMLInputElement>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  // Phones start with search collapsed behind its pill; it opens with a query
  // already typed so an active search is never invisible.
  const [searchOpen, setSearchOpen] = useState(false)

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
    selectedTagIds.length +
    (selectedStatus !== 'all' ? 1 : 0)

  /**
   * The current filter state as a URL, minus one value. Powers the mobile
   * summary chips: on phones the secondary bar is collapsed, so without these
   * you can see *that* something is filtered (the badge count) but not what —
   * and you have to open the panel to undo it.
   */
  function hrefWithout(param: 'account_id' | 'category_id' | 'tag_id' | 'status', value?: string) {
    const params = new URLSearchParams()
    if (selectedType !== 'all') params.set('type', selectedType)
    if (selectedReview !== 'all') params.set('review', selectedReview)
    if (searchText) params.set('search', searchText)
    if (payeeId) params.set('payee_id', payeeId)
    params.set('date_from', resolvedDateFrom)
    params.set('date_to', resolvedDateTo)

    const keep = (name: 'account_id' | 'category_id' | 'tag_id', ids: string[]) => {
      for (const id of ids) {
        if (param === name && id === value) continue
        params.append(name, id)
      }
    }
    keep('account_id', selectedAccountIds)
    keep('category_id', selectedCategoryIds)
    keep('tag_id', selectedTagIds)
    if (selectedStatus !== 'all' && param !== 'status') {
      params.set('status', selectedStatus)
    }

    return `/dashboard/transactions?${params.toString()}`
  }

  const activeChips: { key: string; label: string; href: string }[] = [
    ...selectedAccountIds.map((id) => ({
      key: `account-${id}`,
      label: accountOptions.find((o) => o.id === id)?.label ?? ui('Account'),
      href: hrefWithout('account_id', id),
    })),
    ...selectedCategoryIds.map((id) => ({
      key: `category-${id}`,
      label: categoryOptions.find((o) => o.id === id)?.label ?? ui('Category'),
      href: hrefWithout('category_id', id),
    })),
    ...selectedTagIds.map((id) => ({
      key: `tag-${id}`,
      label: tagOptions.find((o) => o.id === id)?.label ?? ui('Tags'),
      href: hrefWithout('tag_id', id),
    })),
    ...(selectedStatus !== 'all'
      ? [
          {
            key: 'status',
            label: ui(STATUS_LABELS[selectedStatus] ?? selectedStatus),
            href: hrefWithout('status'),
          },
        ]
      : []),
  ]

  return (
    <form method="get" action="/dashboard/transactions" className="space-y-2.5">
      <input type="hidden" name="type" ref={typeRef} defaultValue={selectedType} />
      {selectedReview !== 'all' ? (
        <input type="hidden" name="review" value={selectedReview} />
      ) : null}
      {payeeId ? <input type="hidden" name="payee_id" value={payeeId} /> : null}

      {/* ── Mobile: one scrollable line of pills ────────────────────────
          Phones get a native-style control strip instead of the desktop
          toolbar: search collapses to an icon, the type toggle becomes a
          dropdown, and the active filters sit inline. Three stacked rows
          become one, so the list starts near the top of the screen. */}
      <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 sm:hidden">
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          aria-expanded={searchOpen}
          aria-label={ui('Search transactions')}
          className={cn(pillCls, searchText && activePillCls)}
        >
          <Search className="size-3.5 shrink-0" aria-hidden="true" />
          {searchText ? <span className="max-w-[90px] truncate">{searchText}</span> : null}
        </button>

        <label
          className={cn(pillCls, selectedType !== 'all' && activePillCls)}
          // The chevron sits inside the pill, so the whole thing reads as one
          // control rather than a bare native select.
        >
          <select
            value={selectedType}
            onChange={(e) => selectType(e.currentTarget.form, e.target.value)}
            aria-label={ui('Filter by type')}
            className="cursor-pointer appearance-none bg-transparent pr-1 text-xs font-medium outline-none"
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="text-foreground">
                {ui(option.label)}
              </option>
            ))}
          </select>
          <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden="true" />
        </label>

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className={cn(pillCls, moreFiltersCount > 0 && activePillCls)}
        >
          <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
          {ui('Filters')}
          {moreFiltersCount > 0 ? (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {moreFiltersCount}
            </span>
          ) : null}
        </button>

        {/* Each chip drops just its own filter, so undoing one never means
            opening the panel. */}
        {activeChips.map((chip) => (
          <Link key={chip.key} href={chip.href} className={cn(pillCls, activePillCls)}>
            <span className="max-w-[130px] truncate">{chip.label}</span>
            <X className="size-3 shrink-0" aria-hidden="true" />
            <span className="sr-only">{ui('Remove filter')}</span>
          </Link>
        ))}
      </div>

      {/* ── Type toggle (desktop) + search ──────────────────────────────
          One search input for both breakpoints — duplicating it would submit
          two `search` values. On phones it stays hidden until the pill above
          expands it. */}
      <div
        className={cn(
          'flex-wrap items-center gap-2',
          searchOpen ? 'flex' : 'hidden sm:flex'
        )}
      >
        <div className="hidden shrink-0 rounded-lg border bg-background p-0.5 sm:flex">
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
                {ui(option.label)}
              </button>
            )
          })}
        </div>

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
            autoFocus={searchOpen}
          />
        </div>
      </div>

      {/* ── Secondary bar: account/category/status + date range ─────────── */}
      <div className={cn('flex-col gap-2.5 sm:flex', moreOpen ? 'flex' : 'hidden')}>
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelectChip
            label={ui('Account')}
            name="account_id"
            options={accountOptions}
            selectedIds={selectedAccountIds}
          />

          <MultiSelectChip
            label={ui('Category')}
            name="category_id"
            options={categoryOptions}
            selectedIds={selectedCategoryIds}
          />

          {tagOptions.length > 0 || selectedTagIds.length > 0 ? (
            <MultiSelectChip
              label={ui('Tags')}
              name="tag_id"
              options={tagOptions}
              selectedIds={selectedTagIds}
            />
          ) : null}

          <label className={chipLabelClassName}>
            <span className="text-xs font-medium text-muted-foreground">{ui('Status')}</span>
            <select
              name="status"
              defaultValue={selectedStatus}
              className={chipSelectClassName}
              aria-label={ui('Filter by status')}
            >
              <option value="all">{ui('All')}</option>
              <option value="posted">{ui('Posted')}</option>
              <option value="pending">{ui('Pending')}</option>
              <option value="voided">{ui('Voided')}</option>
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
              {ui(link.label)}
            </Link>
          ))}

          {/* `key` ties each uncontrolled input to the server-resolved range so a
              client-side preset navigation remounts it with the new value. Without
              this, `defaultValue` is ignored on re-render and the field keeps its
              stale (e.g. this-month) value, which "Apply filters" would then
              re-submit and clobber the range the user just picked (BF-024). */}
          <label className={chipLabelClassName}>
            <span className="text-xs font-medium text-muted-foreground">{ui('From')}</span>
            <input
              key={resolvedDateFrom}
              type="date"
              name="date_from"
              defaultValue={resolvedDateFrom}
              className="bg-transparent text-sm text-foreground outline-none"
              aria-label={ui('From date')}
            />
          </label>

          <label className={chipLabelClassName}>
            <span className="text-xs font-medium text-muted-foreground">{ui('To')}</span>
            <input
              key={resolvedDateTo}
              type="date"
              name="date_to"
              defaultValue={resolvedDateTo}
              className="bg-transparent text-sm text-foreground outline-none"
              aria-label={ui('To date')}
            />
          </label>

          <div className="ml-auto flex items-center gap-1.5">
            {hasActiveFilters ? (
              <Link
                href="/dashboard/transactions"
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                {ui('Clear all')}
              </Link>
            ) : null}
            <button
              type="submit"
              className={buttonVariants({ size: 'sm' })}
            >
              {ui('Apply filters')}
            </button>
          </div>
        </div>
      </div>

      {/* Submit fallback for keyboard users editing the search field */}
      <button type="submit" className="sr-only">
        {ui('Apply filters')}
      </button>
    </form>
  )
}
