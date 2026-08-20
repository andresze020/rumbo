'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { buttonVariants } from '@/components/ui/button'
import { MultiSelectChip, type MultiSelectOption } from '@/components/multi-select-chip'
import { cn } from '@/lib/utils'
import { useBackDismiss } from '@/lib/use-back-dismiss'
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

/** A date range the user can stage in the form; applied only on submit. */
type PresetOption = {
  label: string
  dateFrom: string
  dateTo: string
}

type TransactionFiltersProps = {
  searchText: string
  selectedTypes: string[]
  selectedStatuses: string[]
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
  payeeOptions: MultiSelectOption[]
  selectedPayeeIds: string[]
  presetOptions: PresetOption[]
  /** URL that drops every filter — see CLEAR_FILTERS_HREF on the page. */
  clearHref: string
}

/**
 * Multi-select, so "income + transfer" is expressible. Nothing selected means
 * every type, which is why there is no explicit "All" entry — the segmented
 * control's first cell clears the selection instead.
 */
const TYPE_OPTIONS = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
] as const

const STATUS_OPTIONS: MultiSelectOption[] = [
  { id: 'posted', label: 'Posted' },
  { id: 'pending', label: 'Pending' },
  { id: 'voided', label: 'Voided' },
]

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

/** Repeated query params this bar owns. */
type FilterParam = 'type' | 'status' | 'account_id' | 'category_id' | 'tag_id' | 'payee_id'

/**
 * The option list a summary chip reopens. `type` has none — it is the segmented
 * toggle at the top of the sheet, which needs no panel to be visible.
 */
const CHIP_PANEL: Record<
  FilterParam,
  null | 'account' | 'category' | 'tag' | 'payee' | 'status'
> = {
  type: null,
  status: 'status',
  account_id: 'account',
  category_id: 'category',
  tag_id: 'tag',
  payee_id: 'payee',
}

const typeButtonCls =
  'flex-1 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:flex-none sm:rounded-md sm:py-1.5'

const typeButtonActiveCls = 'bg-primary text-primary-foreground shadow-sm hover:text-primary-foreground'

export function TransactionFilters({
  searchText,
  selectedTypes,
  selectedStatuses,
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
  payeeOptions,
  selectedPayeeIds,
  presetOptions,
  clearHref,
}: TransactionFiltersProps) {
  const ui = useUiTranslation()
  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)
  // Phones start with search collapsed behind its pill; it opens with a query
  // already typed so an active search is never invisible.
  const [searchOpen, setSearchOpen] = useState(false)
  // Only one option list at a time — their panels overlap otherwise.
  const [openChip, setOpenChip] = useState<
    null | 'account' | 'category' | 'tag' | 'payee' | 'status'
  >(null)
  // Nothing here reaches the list until Apply, so an edit the user has made but
  // not yet applied is invisible: the controls and the results below them
  // disagree with no way to tell. `dirty` is what puts that on screen.
  const [dirty, setDirty] = useState(false)

  // Every control is staged locally and only reaches the server on submit, so
  // "Apply filters" means what it says. Presets used to be links that navigated
  // on click, which applied a range the user had not confirmed — and dismissing
  // the sheet left it stuck on.
  const [types, setTypes] = useState<string[]>(selectedTypes)
  const [dateFrom, setDateFrom] = useState(resolvedDateFrom)
  const [dateTo, setDateTo] = useState(resolvedDateTo)

  // Applying used to reload the document, which reset the staged values for
  // free. Now that navigation is client-side this component survives it, so the
  // staging has to be re-seeded from whatever the server actually applied —
  // otherwise removing a chip would leave its type still lit in the toggle.
  // Adjusted during render rather than in an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect.
  // Every applied filter is in the key, not just the staged ones: removing a
  // chip or hitting Back is also a new applied state, and the "unapplied
  // changes" mark has to clear when it lands.
  const appliedScope = [
    selectedTypes.join(','),
    selectedStatuses.join(','),
    selectedAccountIds.join(','),
    selectedCategoryIds.join(','),
    selectedTagIds.join(','),
    selectedPayeeIds.join(','),
    selectedReview,
    searchText,
    resolvedDateFrom,
    resolvedDateTo,
  ].join('|')
  const [syncedScope, setSyncedScope] = useState(appliedScope)
  if (appliedScope !== syncedScope) {
    setSyncedScope(appliedScope)
    setTypes(selectedTypes)
    setDateFrom(resolvedDateFrom)
    setDateTo(resolvedDateTo)
    setDirty(false)
  }

  /**
   * The sheet and any option list opened inside it close together — a panel
   * left open would still be open the next time the sheet is pulled up.
   */
  function closeSheet() {
    setMoreOpen(false)
    setOpenChip(null)
  }

  // The sheet covers the screen; letting the list keep scrolling underneath it
  // is the clearest tell that this is a web page and not an app.
  useEffect(() => {
    if (!moreOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [moreOpen])

  // Android Back closes the sheet instead of leaving Transactions, matching the
  // picker sheets in the transaction form. Without it the only way out was the
  // X, and Back discarded the whole screen.
  useBackDismiss(moreOpen, closeSheet)

  // Escape is the desktop equivalent of the same escape hatch, and it unwinds
  // one layer at a time: an open option list dismisses itself (the chip owns
  // that), and only a second press closes the sheet around it.
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !openChip) setMoreOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [moreOpen, openChip])

  /**
   * Apply through the router instead of letting the browser submit the GET
   * form. A native form submit is a full document load — blank screen, fonts
   * and layout repainted, scroll position lost — for what is only a change of
   * query string. `router.push` keeps the shell mounted and streams the new
   * list in.
   */
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const params = new URLSearchParams()
    for (const [name, value] of new FormData(event.currentTarget).entries()) {
      const entry = String(value).trim()
      if (entry) params.append(name, entry)
    }

    // Collapse everything the bar can have open. Navigation is client-side,
    // so none of this unmounts on its own — an option list left open would
    // sit on top of the results the user just asked for.
    setMoreOpen(false)
    setSearchOpen(false)
    setOpenChip(null)
    setDirty(false)
    // Deliberately NOT wrapped in a transition. A transition keeps the current
    // page on screen until the next one is fully ready, which suppresses this
    // route's loading.tsx — Apply would close the sheet and leave the previous
    // chips, counts and totals sitting there as if nothing had happened. The
    // skeleton is the honest feedback here.
    router.push(`/dashboard/transactions?${params.toString()}`)
  }

  function toggleType(value: string) {
    setDirty(true)
    setTypes((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value]
    )
  }

  const moreFiltersCount =
    selectedAccountIds.length +
    selectedCategoryIds.length +
    selectedTagIds.length +
    selectedPayeeIds.length +
    selectedStatuses.length

  /**
   * The applied filter state as a URL, minus one whole dimension. Powers the
   * mobile summary chips: on phones the secondary controls are behind a sheet,
   * so without these you can see *that* something is filtered (the badge count)
   * but not what — and undoing one would mean opening the sheet.
   *
   * Built from the **applied** props, never the staged state: these are links,
   * so they must describe a view the server already knows about.
   */
  function hrefWithout(param: FilterParam) {
    const params = new URLSearchParams()
    if (selectedReview !== 'all') params.set('review', selectedReview)
    if (searchText) params.set('search', searchText)
    params.set('date_from', resolvedDateFrom)
    params.set('date_to', resolvedDateTo)

    const keep = (name: FilterParam, values: string[]) => {
      if (param === name) return
      for (const entry of values) params.append(name, entry)
    }
    keep('type', selectedTypes)
    keep('status', selectedStatuses)
    keep('account_id', selectedAccountIds)
    keep('category_id', selectedCategoryIds)
    keep('tag_id', selectedTagIds)
    keep('payee_id', selectedPayeeIds)

    return `/dashboard/transactions?${params.toString()}`
  }

  const labelOf = (options: MultiSelectOption[], id: string, fallback: string) =>
    options.find((option) => option.id === id)?.label ?? fallback

  /**
   * Multi-toggle segmented control, shared by the desktop toolbar and the
   * mobile sheet so both offer the same thing. "All" is not a fourth value —
   * it clears the selection, which is what an empty list already means.
   */
  const typeToggle = (
    <div
      role="group"
      aria-label={ui('Filter by type')}
      className="flex w-full rounded-xl border bg-background p-0.5 sm:w-auto sm:rounded-lg"
    >
      <button
        type="button"
        onClick={() => {
          setTypes([])
          setDirty(true)
        }}
        aria-pressed={types.length === 0}
        className={cn(typeButtonCls, types.length === 0 && typeButtonActiveCls)}
      >
        {ui('All')}
      </button>
      {TYPE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => toggleType(option.value)}
          aria-pressed={types.includes(option.value)}
          className={cn(
            typeButtonCls,
            types.includes(option.value) && typeButtonActiveCls
          )}
        >
          {ui(option.label)}
        </button>
      ))}
    </div>
  )

  /**
   * One chip per filter *dimension* rather than per value. Five ticked accounts
   * used to be five chips wrapping over three lines, pushing the totals this
   * screen exists for below the fold. A lone value still shows its own name —
   * that is the case where the detail earns the space.
   */
  function chipFor(
    param: FilterParam,
    values: string[],
    groupLabel: string,
    labelFor: (value: string) => string
  ) {
    if (values.length === 0) return null
    return {
      key: param,
      panel: CHIP_PANEL[param],
      label:
        values.length === 1
          ? labelFor(values[0])
          : `${groupLabel} · ${values.length}`,
      href: hrefWithout(param),
    }
  }

  const activeChips = [
    chipFor('type', selectedTypes, ui('Type'), (value) =>
      ui(TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value)
    ),
    chipFor('account_id', selectedAccountIds, ui('Accounts'), (id) =>
      labelOf(accountOptions, id, ui('Account'))
    ),
    chipFor('category_id', selectedCategoryIds, ui('Categories'), (id) =>
      labelOf(categoryOptions, id, ui('Category'))
    ),
    chipFor('payee_id', selectedPayeeIds, ui('Payees'), (id) =>
      labelOf(payeeOptions, id, ui('Payee'))
    ),
    chipFor('tag_id', selectedTagIds, ui('Tags'), (id) =>
      labelOf(tagOptions, id, ui('Tags'))
    ),
    chipFor('status', selectedStatuses, ui('Status'), (value) =>
      ui(labelOf(STATUS_OPTIONS, value, value))
    ),
  ].filter((chip) => chip !== null)

  return (
    <form
      method="get"
      action="/dashboard/transactions"
      onSubmit={applyFilters}
      // Checkboxes, date fields and the search box all bubble `change`, so one
      // handler here covers every control the bar does not drive by hand.
      onChange={() => setDirty(true)}
      className="space-y-2.5"
    >
      {/* Staged type selection travels as one hidden input per value, so it
          round-trips as repeated `type` params like every other multi-filter. */}
      {types.map((value) => (
        <input key={value} type="hidden" name="type" value={value} />
      ))}
      {selectedReview !== 'all' ? (
        <input type="hidden" name="review" value={selectedReview} />
      ) : null}

      {/* ── Mobile: one line of pills ───────────────────────────────────
          Phones get a native-style control strip instead of the desktop
          toolbar: search collapses to an icon, everything else lives in the
          sheet, and whatever is applied shows as a removable chip.
          Wraps rather than scrolls sideways: an off-screen filter is a filter
          you forget you set. */}
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

        <button
          type="button"
          onClick={() => (moreOpen ? closeSheet() : setMoreOpen(true))}
          aria-expanded={moreOpen}
          className={cn(pillCls, (moreFiltersCount > 0 || dirty) && activePillCls)}
        >
          <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
          {ui('Filters')}
          {moreFiltersCount > 0 ? (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {moreFiltersCount}
            </span>
          ) : null}
          {/* The sheet can be dismissed with edits still staged in it — this is
              the only thing left on screen that says so. */}
          {dirty ? (
            <>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
              <span className="sr-only">{ui('Unapplied changes')}</span>
            </>
          ) : null}
        </button>

        {/* Two targets per chip: the label reopens the sheet at the section
            that set it, the × drops that dimension outright. Undoing or
            adjusting a filter never means hunting for it. */}
        {activeChips.map((chip) => (
          <span key={chip.key} className={cn(pillCls, activePillCls, 'gap-0 pr-1')}>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(true)
                setOpenChip(chip.panel)
              }}
              className="max-w-[150px] truncate pr-1.5"
            >
              {chip.label}
            </button>
            <Link
              href={chip.href}
              onClick={closeSheet}
              aria-label={ui('Remove filter')}
              className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-primary/15"
            >
              <X className="size-3" aria-hidden="true" />
            </Link>
          </span>
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
        <div className="hidden shrink-0 sm:block">{typeToggle}</div>

        <div className="relative min-w-[140px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            // Uncontrolled, so re-key it on the applied query: a client-side
            // apply keeps this input mounted, and it would otherwise hold text
            // the list is no longer filtered by.
            key={searchText}
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
          onClick={closeSheet}
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
        {...(moreOpen
          ? { role: 'dialog' as const, 'aria-modal': true, 'aria-label': ui('Filters') }
          : {})}
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
              onClick={closeSheet}
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

            {/* The type toggle lives in the sheet on phones and in the toolbar
                on desktop — same control, rendered once per breakpoint. */}
            <div className="sm:hidden">{typeToggle}</div>

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

              {payeeOptions.length > 0 || selectedPayeeIds.length > 0 ? (
                <MultiSelectChip
                  label={ui('Payee')}
                  name="payee_id"
                  options={payeeOptions}
                  selectedIds={selectedPayeeIds}
                  open={openChip === 'payee'}
                  onOpenChange={(next) => setOpenChip(next ? 'payee' : null)}
                />
              ) : null}

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

              <MultiSelectChip
                label={ui('Status')}
                name="status"
                options={STATUS_OPTIONS.map((option) => ({
                  ...option,
                  label: ui(option.label),
                }))}
                selectedIds={selectedStatuses}
                open={openChip === 'status'}
                onOpenChange={(next) => setOpenChip(next ? 'status' : null)}
              />
            </div>
          </section>

          {/* ── Period ───────────────────────────────────────────────── */}
          <section className="space-y-2 sm:contents">
            <p className={sectionLabelCls}>{ui('Period')}</p>

            {/* Presets and the custom range share one row on desktop, as
                before, and stack on phones. */}
            <div className="space-y-2 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5 sm:space-y-0">
              {/* An even two-column grid on phones instead of a ragged wrap.
                  Buttons, not links: a preset stages the range in the From/To
                  fields and waits for Apply, like everything else here. */}
              <div className="grid grid-cols-2 gap-2 sm:contents">
                {presetOptions.map((preset) => {
                  const isActive =
                    dateFrom === preset.dateFrom && dateTo === preset.dateTo
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setDateFrom(preset.dateFrom)
                        setDateTo(preset.dateTo)
                        setDirty(true)
                      }}
                      aria-pressed={isActive}
                      className={cn(
                        buttonVariants({
                          // Solid primary fill for the staged preset (matching
                          // the type toggle) so the chosen range is obvious,
                          // not a faint tint.
                          variant: isActive ? 'default' : 'outline',
                          size: 'sm',
                        }),
                        'h-10 w-full rounded-xl sm:h-8 sm:w-auto sm:rounded-lg'
                      )}
                    >
                      {ui(preset.label)}
                    </button>
                  )
                })}
              </div>

              {/* Controlled, so a preset click is reflected here immediately and
                  the pair always submits exactly what the user sees. */}
              <div className="grid grid-cols-2 gap-2 sm:contents">
                <label className={fieldRowCls}>
                  <span className="text-xs font-medium text-muted-foreground">
                    {ui('From')}
                  </span>
                  <input
                    type="date"
                    name="date_from"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none sm:flex-none"
                    aria-label={ui('From date')}
                  />
                </label>

                <label className={fieldRowCls}>
                  <span className="text-xs font-medium text-muted-foreground">
                    {ui('To')}
                  </span>
                  <input
                    type="date"
                    name="date_to"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
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
              href={clearHref}
              onClick={closeSheet}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'h-11 flex-1 rounded-xl sm:h-8 sm:flex-none sm:rounded-lg'
              )}
            >
              {ui('Clear all')}
            </Link>
          ) : null}
          {/* Spelled out where there is room for it; the dot on the button
              carries the same message on a phone. */}
          {dirty ? (
            <span role="status" className="hidden text-xs text-muted-foreground sm:inline">
              {ui('Unapplied changes')}
            </span>
          ) : null}
          <button
            type="submit"
            className={cn(
              buttonVariants({ size: 'sm' }),
              'relative h-11 flex-1 rounded-xl text-sm font-semibold sm:h-8 sm:flex-none sm:rounded-lg sm:font-medium'
            )}
          >
            {ui('Apply filters')}
            {dirty ? (
              <span
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary-foreground sm:hidden"
              />
            ) : null}
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
