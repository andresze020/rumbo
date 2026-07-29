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

/**
 * A labelled control that fills the width as a tappable row on phones and
 * shrinks back to a toolbar chip from `sm` up — matching MultiSelectChip, so
 * the sheet reads as one set of controls rather than several shapes.
 */
const fieldRowCls =
  'flex h-11 w-full items-center gap-1.5 rounded-xl border bg-background px-3 sm:h-9 sm:w-auto sm:shrink-0 sm:rounded-lg sm:px-2.5'

/** Section heading inside the mobile sheet; the desktop toolbar has no sections. */
const sectionLabelCls =
  'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:hidden'

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
  // Only one option list at a time — their panels overlap otherwise.
  const [openChip, setOpenChip] = useState<null | 'account' | 'category' | 'tag'>(null)

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
      {/* Wraps rather than scrolls sideways: an off-screen filter is a filter
          you forget you set. With one or two active it stays a single line. */}
      <div className="flex flex-wrap items-center gap-1.5 sm:hidden">
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

      {/* ── Backdrop for the mobile filter sheet ───────────────────────── */}
      {/* Above the bottom nav (z-40) and the assistant button (z-50), which
          would otherwise punch through the sheet. */}
      {moreOpen ? (
        <div
          aria-hidden="true"
          onClick={() => setMoreOpen(false)}
          className="fixed inset-0 z-[60] bg-black/50 duration-200 animate-in fade-in-0 sm:hidden"
        />
      ) : null}

      {/* ── Secondary controls: inline on desktop, bottom sheet on phones ─
          One DOM node, styled two ways, rather than two copies: these are real
          form controls, and a second copy would submit a second value for every
          filter. Kept inside the <form> (no portal) for the same reason.
          `sm:contents` unwraps the phone-only structure so the desktop toolbar
          keeps its original flat rows. */}
      <div
        className={cn(
          'flex-col',
          moreOpen
            ? 'fixed inset-x-0 bottom-0 z-[61] flex max-h-[88dvh] rounded-t-2xl border-t bg-background shadow-2xl duration-300 animate-in slide-in-from-bottom-8'
            : 'hidden',
          'sm:static sm:z-auto sm:flex sm:max-h-none sm:gap-2.5 sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none sm:animate-none'
        )}
      >
        {/* Grab handle + title: the affordance that says "this is a sheet". */}
        <div className="shrink-0 sm:hidden">
          <div
            aria-hidden="true"
            className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-muted-foreground/30"
          />
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              {ui('Filters')}
            </h2>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              aria-label={ui('Close')}
              className="-mr-2 flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-4 sm:contents sm:space-y-0 sm:overflow-visible sm:p-0">
          {/* ── Narrow down ──────────────────────────────────────────── */}
          <section className="space-y-2 sm:contents">
            <p className={sectionLabelCls}>{ui('Narrow down')}</p>
            <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
              <MultiSelectChip
                label={ui('Account')}
                name="account_id"
                options={accountOptions}
                selectedIds={selectedAccountIds}
                open={openChip === 'account'}
                onOpenChange={(next) => setOpenChip(next ? 'account' : null)}
              />

              <MultiSelectChip
                label={ui('Category')}
                name="category_id"
                options={categoryOptions}
                selectedIds={selectedCategoryIds}
                open={openChip === 'category'}
                onOpenChange={(next) => setOpenChip(next ? 'category' : null)}
              />

              {tagOptions.length > 0 || selectedTagIds.length > 0 ? (
                <MultiSelectChip
                  label={ui('Tags')}
                  name="tag_id"
                  options={tagOptions}
                  selectedIds={selectedTagIds}
                  open={openChip === 'tag'}
                  onOpenChange={(next) => setOpenChip(next ? 'tag' : null)}
                />
              ) : null}

              <label className={fieldRowCls}>
                <span className="text-xs font-medium text-muted-foreground">
                  {ui('Status')}
                </span>
                <select
                  name="status"
                  defaultValue={selectedStatus}
                  className={cn(chipSelectClassName, 'min-w-0 flex-1 sm:flex-none')}
                  aria-label={ui('Filter by status')}
                >
                  <option value="all">{ui('All')}</option>
                  <option value="posted">{ui('Posted')}</option>
                  <option value="pending">{ui('Pending')}</option>
                  <option value="voided">{ui('Voided')}</option>
                </select>
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground sm:hidden"
                  aria-hidden="true"
                />
              </label>
            </div>
          </section>

          {/* ── Period ───────────────────────────────────────────────── */}
          <section className="space-y-2 sm:contents">
            <p className={sectionLabelCls}>{ui('Period')}</p>

            {/* Presets and the custom range share one row on desktop, as
                before, and stack on phones. */}
            <div className="space-y-2 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5 sm:space-y-0">
              {/* An even two-column grid on phones instead of a ragged wrap. */}
              <div className="grid grid-cols-2 gap-2 sm:contents">
                {presetLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    aria-current={link.isActive ? 'true' : undefined}
                    className={cn(
                      buttonVariants({
                        // Solid primary fill for the active preset (matching the
                        // type toggle) so the selected range is obvious, not a
                        // faint tint.
                        variant: link.isActive ? 'default' : 'outline',
                        size: 'sm',
                      }),
                      'h-10 w-full rounded-xl sm:h-8 sm:w-auto sm:rounded-lg'
                    )}
                  >
                    {ui(link.label)}
                  </Link>
                ))}
              </div>

              {/* `key` ties each uncontrolled input to the server-resolved range so a
                  client-side preset navigation remounts it with the new value. Without
                  this, `defaultValue` is ignored on re-render and the field keeps its
                  stale (e.g. this-month) value, which "Apply filters" would then
                  re-submit and clobber the range the user just picked (BF-024). */}
              <div className="grid grid-cols-2 gap-2 sm:contents">
                <label className={fieldRowCls}>
                  <span className="text-xs font-medium text-muted-foreground">
                    {ui('From')}
                  </span>
                  <input
                    key={resolvedDateFrom}
                    type="date"
                    name="date_from"
                    defaultValue={resolvedDateFrom}
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none sm:flex-none"
                    aria-label={ui('From date')}
                  />
                </label>

                <label className={fieldRowCls}>
                  <span className="text-xs font-medium text-muted-foreground">
                    {ui('To')}
                  </span>
                  <input
                    key={resolvedDateTo}
                    type="date"
                    name="date_to"
                    defaultValue={resolvedDateTo}
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none sm:flex-none"
                    aria-label={ui('To date')}
                  />
                </label>
              </div>
            </div>
          </section>
        </div>

        {/* ── Actions ────────────────────────────────────────────────────
            Pinned footer on phones so Apply stays in thumb reach no matter how
            far the body has scrolled. */}
        <div className="flex shrink-0 items-center gap-2 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:ml-auto sm:border-0 sm:p-0">
          {hasActiveFilters ? (
            <Link
              href="/dashboard/transactions"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'h-11 flex-1 rounded-xl sm:h-8 sm:flex-none sm:rounded-lg'
              )}
            >
              {ui('Clear all')}
            </Link>
          ) : null}
          <button
            type="submit"
            className={cn(
              buttonVariants({ size: 'sm' }),
              'h-11 flex-1 rounded-xl text-sm font-semibold sm:h-8 sm:flex-none sm:rounded-lg sm:font-medium'
            )}
          >
            {ui('Apply filters')}
          </button>
        </div>
      </div>

      {/* Submit fallback for keyboard users editing the search field */}
      <button type="submit" className="sr-only">
        {ui('Apply filters')}
      </button>
    </form>
  )
}
