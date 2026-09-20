'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { buttonVariants } from '@/components/ui/button'
import { MultiSelectChip, type MultiSelectOption } from '@/components/multi-select-chip'
import { cn } from '@/lib/utils'
import { useBackDismiss } from '@/lib/use-back-dismiss'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'

type AccountOption = { id: string; label: string; isArchived: boolean }
type CategoryOption = { id: string; label: string; isArchived: boolean }
type TagOption = { id: string; label: string; isArchived?: boolean }

type TransactionFiltersProps = {
  searchText: string
  selectedTypes: string[]
  selectedStatuses: string[]
  selectedReview: string
  selectedAccountIds: string[]
  selectedCategoryIds: string[]
  accountOptions: AccountOption[]
  categoryOptions: CategoryOption[]
  tagOptions: TagOption[]
  selectedTagIds: string[]
  payeeOptions: MultiSelectOption[]
  selectedPayeeIds: string[]
  /**
   * The applied period, already serialized. This bar never reads it and never
   * changes it — it only carries it through, so applying a filter cannot move
   * the period and the header's period control cannot drop a filter.
   */
  periodQuery: string
  /** Drops every general filter and the search. Keeps the period. */
  clearHref: string
}

const TYPE_OPTIONS = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
] as const

/**
 * BR-008 — the transaction's own lifecycle, which is a financial fact: a
 * pending charge has not settled, a voided one has been reversed. Deliberately
 * *not* the review state, which is a bookkeeping note about whether a human
 * has looked at the row. Two different questions, two different controls.
 */
const STATUS_OPTIONS: MultiSelectOption[] = [
  { id: 'posted', label: 'Posted' },
  { id: 'pending', label: 'Pending' },
  { id: 'voided', label: 'Voided' },
]

/**
 * BR-011 — the review states, as an advanced filter rather than navigation.
 * They used to be a permanent segmented control above the list; they live
 * behind "More filters" now, and the data, the column and the bulk actions are
 * untouched.
 */
const REVIEW_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'unreviewed', label: 'To review' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'flagged', label: 'Flagged' },
] as const

/** Mobile control-strip pill: one compact, tappable unit. */
const pillCls =
  'flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-background px-3 text-xs font-medium text-foreground'

const activePillCls = 'border-primary/40 bg-primary/10 text-primary'

const typeButtonCls =
  'flex h-10 items-center justify-center rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:h-8 sm:px-3'

const typeButtonActiveCls =
  'bg-primary text-primary-foreground shadow-sm hover:text-primary-foreground'

/** Repeated query params this bar owns. */
type FilterParam =
  | 'type'
  | 'status'
  | 'account_id'
  | 'category_id'
  | 'tag_id'
  | 'payee_id'
  | 'review'

/** The multi-selects the chips drive, in the order they reach the query. */
const DRAFT_PARAMS = [
  'account_id',
  'category_id',
  'payee_id',
  'tag_id',
  'status',
] as const

type DraftParam = (typeof DRAFT_PARAMS)[number]
type Drafts = Record<DraftParam, string[]>

/** The option list a summary chip reopens. */
const CHIP_PANEL: Record<
  FilterParam,
  null | 'account' | 'category' | 'tag' | 'payee' | 'status'
> = {
  type: null,
  review: null,
  status: 'status',
  account_id: 'account',
  category_id: 'category',
  tag_id: 'tag',
  payee_id: 'payee',
}

export function TransactionFilters({
  searchText,
  selectedTypes,
  selectedStatuses,
  selectedReview,
  selectedAccountIds,
  selectedCategoryIds,
  accountOptions,
  categoryOptions,
  tagOptions,
  selectedTagIds,
  payeeOptions,
  selectedPayeeIds,
  periodQuery,
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
  // Review is secondary: the section starts closed unless it is doing something.
  const [advancedOpen, setAdvancedOpen] = useState(selectedReview !== 'all')

  const appliedDrafts: Drafts = {
    account_id: selectedAccountIds,
    category_id: selectedCategoryIds,
    payee_id: selectedPayeeIds,
    tag_id: selectedTagIds,
    status: selectedStatuses,
  }

  // Every control in the sheet is staged locally and only reaches the server on
  // Apply, so "Apply filters" means what it says — and dismissing the sheet
  // means what *that* says: the draft goes back to whatever is applied.
  const [types, setTypes] = useState<string[]>(selectedTypes)
  const [review, setReview] = useState(selectedReview)
  const [search, setSearch] = useState(searchText)
  const [drafts, setDrafts] = useState<Drafts>(appliedDrafts)
  // Nothing here reaches the list until Apply, so an edit the user has made but
  // not yet applied is invisible. `dirty` is what puts that on screen.
  const [dirty, setDirty] = useState(false)

  // Applying used to reload the document, which reset the staged values for
  // free. Navigation is client-side now, so this component survives it and the
  // staging has to be re-seeded from whatever the server actually applied.
  // Adjusted during render rather than in an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect.
  const appliedScope = [
    selectedTypes.join(','),
    selectedStatuses.join(','),
    selectedAccountIds.join(','),
    selectedCategoryIds.join(','),
    selectedTagIds.join(','),
    selectedPayeeIds.join(','),
    selectedReview,
    searchText,
    periodQuery,
  ].join('|')
  const [syncedScope, setSyncedScope] = useState(appliedScope)
  if (appliedScope !== syncedScope) {
    setSyncedScope(appliedScope)
    setTypes(selectedTypes)
    setReview(selectedReview)
    setSearch(searchText)
    setDrafts({
      account_id: selectedAccountIds,
      category_id: selectedCategoryIds,
      payee_id: selectedPayeeIds,
      tag_id: selectedTagIds,
      status: selectedStatuses,
    })
    setAdvancedOpen(selectedReview !== 'all')
    setDirty(false)
  }

  /**
   * The query string for a set of filters.
   *
   * It always starts from the applied period and never writes one, which is
   * what keeps the two contexts from fighting: this bar can express any
   * combination of filters and none of them is a date.
   */
  function buildQuery(source: {
    types: string[]
    review: string
    drafts: Drafts
    search: string
  }) {
    const params = new URLSearchParams(periodQuery)
    for (const value of source.types) params.append('type', value)
    for (const param of DRAFT_PARAMS) {
      for (const value of source.drafts[param]) params.append(param, value)
    }
    if (source.review !== 'all') params.set('review', source.review)
    const trimmed = source.search.trim()
    if (trimmed) params.set('search', trimmed)
    return params.toString()
  }

  const appliedQuery = buildQuery({
    types: selectedTypes,
    review: selectedReview,
    drafts: appliedDrafts,
    search: searchText,
  })

  // Applying is a round trip, and the chips and the badge are drawn from what
  // the *server* says is applied — so they sat on the previous filters for as
  // long as the query took, which reads as "Apply did nothing". While a set is
  // in flight they show that set instead.
  const [pending, setPending] = useState<null | {
    query: string
    from: string
    types: string[]
    review: string
    drafts: Drafts
  }>(null)
  // Any move by the server ends the optimism, not just the answer we were
  // waiting for: removing a chip mid-flight is a different navigation.
  if (pending && appliedQuery !== pending.from) setPending(null)

  /** What the user should read as applied: the server's answer, or ours. */
  const shownTypes = pending?.types ?? selectedTypes
  const shownReview = pending?.review ?? selectedReview
  const shownDrafts = pending?.drafts ?? appliedDrafts

  /** Every staged edit runs through here, so nothing can change unmarked. */
  function stageDraft(param: DraftParam, values: string[]) {
    setDrafts((current) => ({ ...current, [param]: values }))
    setDirty(true)
  }

  /** Throw away anything staged and go back to what is applied. */
  function resetDraft() {
    setTypes(selectedTypes)
    setReview(selectedReview)
    setDrafts({
      account_id: selectedAccountIds,
      category_id: selectedCategoryIds,
      payee_id: selectedPayeeIds,
      tag_id: selectedTagIds,
      status: selectedStatuses,
    })
    setAdvancedOpen(selectedReview !== 'all')
    setDirty(false)
  }

  function openSheet() {
    // Open on the applied set, never on a draft left over from a dismissal.
    resetDraft()
    setMoreOpen(true)
  }

  /**
   * Dismissing discards. The X, the backdrop, Escape and Android Back all land
   * here, and all of them mean "I did not want that" — the alternative, where
   * half-made edits survive out of sight and land on the next Apply, is the
   * thing that makes a filter panel untrustworthy.
   *
   * The search box is deliberately not part of this: it lives on the strip
   * outside the sheet, and wiping what someone typed there because they closed
   * a different panel would be its own bug.
   */
  function closeSheet() {
    setMoreOpen(false)
    setOpenChip(null)
    resetDraft()
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

  // Android Back closes the sheet instead of leaving Transactions.
  const releaseSheetEntry = useBackDismiss(moreOpen, closeSheet)

  // Escape unwinds one layer at a time: an open option list dismisses itself
  // (the chip owns that), and only a second press closes the sheet around it.
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !openChip) closeSheet()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moreOpen, openChip])

  /**
   * Everything Apply does, whatever triggered it.
   *
   * Navigation goes through the router rather than a native GET submit: a form
   * submit is a full document load — blank screen, fonts and layout repainted,
   * scroll position lost — for what is only a change of query string.
   */
  function apply() {
    const query = buildQuery({ types, review, drafts, search })

    // Nothing to wait for when the staged set is already the applied one.
    if (query !== appliedQuery) {
      setPending({ query, from: appliedQuery, types, review, drafts })
    }

    // The mobile sheet owns a history entry so Android Back closes it, and it
    // reclaims that entry with history.back() when it closes. Hand the entry
    // over first, and take it as the entry to navigate into.
    const replacingSheetEntry = releaseSheetEntry()

    setMoreOpen(false)
    setSearchOpen(false)
    setOpenChip(null)
    setDirty(false)

    // Deliberately NOT wrapped in a transition: that would suppress this
    // route's loading.tsx, and Apply would close the sheet leaving the previous
    // chips, counts and totals sitting there as if nothing had happened.
    const href = `/dashboard/transactions?${query}`
    if (replacingSheetEntry) router.replace(href)
    else router.push(href)
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    apply()
  }

  function toggleType(value: string) {
    setDirty(true)
    setTypes((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value]
    )
  }

  /**
   * How many *general* filters are on. Dimensions, not values: five ticked
   * accounts is one filter, not five.
   *
   * The period is not counted — it is its own context, and "Filters 1" that
   * silently meant "September" was the thing that made the badge useless. Nor
   * is the search, which has its own pill, nor any dimension sitting on All.
   */
  const generalFilterCount =
    (shownTypes.length > 0 ? 1 : 0) +
    (shownReview !== 'all' ? 1 : 0) +
    DRAFT_PARAMS.reduce(
      (total, param) => total + (shownDrafts[param].length > 0 ? 1 : 0),
      0
    )
  const hasAnythingToClear = generalFilterCount > 0 || searchText.length > 0

  /** Same, for the draft the sheet is showing. */
  const draftReviewLabel =
    REVIEW_OPTIONS.find((option) => option.value === review)?.label ?? 'All'

  /**
   * The applied filter state as a URL, minus one whole dimension. Powers the
   * mobile summary chips: without these you can see *that* something is
   * filtered but not what, and undoing one would mean opening the sheet.
   */
  function hrefWithout(param: FilterParam) {
    const isDraftParam = param !== 'type' && param !== 'review'
    const query = buildQuery({
      types: param === 'type' ? [] : shownTypes,
      review: param === 'review' ? 'all' : shownReview,
      drafts: { ...shownDrafts, ...(isDraftParam ? { [param]: [] } : {}) },
      search: searchText,
    })
    return `/dashboard/transactions?${query}`
  }

  const labelOf = (options: MultiSelectOption[], id: string, fallback: string) =>
    options.find((option) => option.id === id)?.label ?? fallback

  /**
   * One chip per filter *dimension* rather than per value. Five ticked accounts
   * used to be five chips wrapping over three lines. A lone value still shows
   * its own name — that is the case where the detail earns the space.
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
        values.length === 1 ? labelFor(values[0]) : `${groupLabel} · ${values.length}`,
      href: hrefWithout(param),
    }
  }

  const activeChips = [
    chipFor('type', shownTypes, ui('Type'), (value) =>
      ui(TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value)
    ),
    chipFor('account_id', shownDrafts.account_id, ui('Accounts'), (id) =>
      labelOf(accountOptions, id, ui('Account'))
    ),
    chipFor('category_id', shownDrafts.category_id, ui('Categories'), (id) =>
      labelOf(categoryOptions, id, ui('Category'))
    ),
    chipFor('payee_id', shownDrafts.payee_id, ui('Payees'), (id) =>
      labelOf(payeeOptions, id, ui('Payee'))
    ),
    chipFor('tag_id', shownDrafts.tag_id, ui('Tags'), (id) =>
      labelOf(tagOptions, id, ui('Tags'))
    ),
    chipFor('status', shownDrafts.status, ui('Transaction status'), (value) =>
      ui(labelOf(STATUS_OPTIONS, value, value))
    ),
    chipFor('review', shownReview === 'all' ? [] : [shownReview], ui('Review'), (value) =>
      ui(REVIEW_OPTIONS.find((option) => option.value === value)?.label ?? value)
    ),
  ].filter((chip) => chip !== null)

  /**
   * Multi-toggle segmented control. "All" is not a fourth value — it clears the
   * selection, which is what an empty list already means.
   *
   * Two columns on a phone: four cells on a 320px line truncate "Transfer" to
   * nothing, and a horizontally scrolling segmented control hides options the
   * user has no reason to suspect exist.
   */
  const typeToggle = (
    <div
      role="group"
      aria-label={ui('Filter by type')}
      className="grid w-full grid-cols-2 gap-1 rounded-xl border bg-background p-1 sm:flex sm:w-auto sm:gap-0.5 sm:rounded-lg sm:p-0.5"
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

  return (
    <form
      method="get"
      action="/dashboard/transactions"
      onSubmit={applyFilters}
      className="space-y-2"
    >
      {/* The no-JS GET fallback has to carry the period too, or submitting the
          form would silently reset it to the default month. */}
      {Array.from(new URLSearchParams(periodQuery).entries()).map(([key, value]) => (
        <input key={`${key}=${value}`} type="hidden" name={key} value={value} />
      ))}
      {types.map((value) => (
        <input key={value} type="hidden" name="type" value={value} />
      ))}
      {review !== 'all' ? <input type="hidden" name="review" value={review} /> : null}

      {/* ── Mobile: one line of pills ─────────────────────────────────── */}
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
          onClick={() => (moreOpen ? closeSheet() : openSheet())}
          aria-expanded={moreOpen}
          className={cn(pillCls, generalFilterCount > 0 && activePillCls)}
        >
          <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
          {pending ? ui('Applying…') : ui('Filters')}
          {generalFilterCount > 0 ? (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {generalFilterCount}
            </span>
          ) : null}
        </button>

        {/* Only when there is something to clear, and it never touches the
            period — that is the header control's business. */}
        {hasAnythingToClear ? (
          <Link
            href={clearHref}
            className={cn(pillCls, 'gap-1 text-muted-foreground')}
          >
            <X className="size-3.5 shrink-0" aria-hidden="true" />
            {ui('Clear')}
          </Link>
        ) : null}

        {/* Two targets per chip: the label reopens the sheet at the section
            that set it, the × drops that dimension outright. */}
        {activeChips.map((chip) => (
          <span key={chip.key} className={cn(pillCls, activePillCls, 'gap-0 pr-1')}>
            <button
              type="button"
              onClick={() => {
                openSheet()
                setOpenChip(chip.panel)
                if (chip.key === 'review') setAdvancedOpen(true)
              }}
              className="max-w-[150px] truncate pr-1.5"
            >
              {chip.label}
            </button>
            <Link
              href={chip.href}
              aria-label={ui('Remove filter')}
              className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-primary/15"
            >
              <X className="size-3" aria-hidden="true" />
            </Link>
          </span>
        ))}
      </div>

      {/* ── Type toggle (desktop) + search ─────────────────────────────
          One search input for both breakpoints — duplicating it would submit
          two `search` values. */}
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
            name="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setDirty(true)
            }}
            placeholder="Search transactions…"
            className="pl-9"
            aria-label="Search transactions"
            autoFocus={searchOpen}
          />
        </div>
      </div>

      {/* ── Backdrop for the mobile filter sheet ───────────────────────── */}
      {moreOpen ? (
        <div
          aria-hidden="true"
          onClick={closeSheet}
          className="vv-pin-screen fixed inset-0 z-[60] bg-black/50 duration-200 animate-in fade-in-0 sm:hidden"
        />
      ) : null}

      {/* ── Secondary controls: inline on desktop, bottom sheet on phones ─
          One DOM node, styled two ways, rather than two copies: these are real
          form controls, and a second copy would submit a second value for every
          filter. `sm:contents` unwraps the phone-only structure so the desktop
          toolbar keeps its flat rows. */}
      <div
        {...(moreOpen
          ? {
              role: 'dialog' as const,
              'aria-modal': true,
              'aria-label': ui('Filters'),
              'data-side': 'bottom' as const,
            }
          : {})}
        className={cn(
          'flex-col',
          moreOpen
            ? 'vv-pin-screen-edge fixed inset-x-0 bottom-0 z-[61] flex max-h-[88dvh] rounded-t-2xl border-t bg-background shadow-2xl duration-300 animate-in slide-in-from-bottom-8'
            : 'hidden',
          // A sheet on phones and a plain static toolbar row from `sm:` up, so
          // the zoom pin has to be switched off there.
          'sm:static sm:z-auto sm:flex sm:max-h-none sm:gap-2.5 sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none sm:animate-none sm:[--vv-height:none] sm:[--vv-width:auto]'
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
              className="-mr-2 flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* The scroll area ends above the footer rather than behind it: the
            padding is the footer's height plus the safe area. */}
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-1 sm:contents sm:space-y-0 sm:overflow-visible sm:p-0">
          {/* No "NARROW DOWN" heading: with the period gone there is only one
              group of controls here, and a label over the only section labels
              nothing. */}
          <div className="sm:hidden">{typeToggle}</div>

          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            <MultiSelectChip
              label={ui('Account')}
              name="account_id"
              options={accountOptions}
              selected={drafts.account_id}
              onSelectedChange={(next) => stageDraft('account_id', next)}
              open={openChip === 'account'}
              onOpenChange={(next) => setOpenChip(next ? 'account' : null)}
            />

            <MultiSelectChip
              label={ui('Category')}
              name="category_id"
              options={categoryOptions}
              selected={drafts.category_id}
              onSelectedChange={(next) => stageDraft('category_id', next)}
              open={openChip === 'category'}
              onOpenChange={(next) => setOpenChip(next ? 'category' : null)}
            />

            {payeeOptions.length > 0 || selectedPayeeIds.length > 0 ? (
              <MultiSelectChip
                label={ui('Payee')}
                name="payee_id"
                options={payeeOptions}
                selected={drafts.payee_id}
                onSelectedChange={(next) => stageDraft('payee_id', next)}
                open={openChip === 'payee'}
                onOpenChange={(next) => setOpenChip(next ? 'payee' : null)}
              />
            ) : null}

            {tagOptions.length > 0 || selectedTagIds.length > 0 ? (
              <MultiSelectChip
                label={ui('Tags')}
                name="tag_id"
                options={tagOptions}
                selected={drafts.tag_id}
                onSelectedChange={(next) => stageDraft('tag_id', next)}
                open={openChip === 'tag'}
                onOpenChange={(next) => setOpenChip(next ? 'tag' : null)}
              />
            ) : null}

            {/* Named in full: "Status" next to a review filter read as the same
                thing, and they are not. */}
            <MultiSelectChip
              label={ui('Transaction status')}
              name="status"
              options={STATUS_OPTIONS.map((option) => ({
                ...option,
                label: ui(option.label),
              }))}
              selected={drafts.status}
              onSelectedChange={(next) => stageDraft('status', next)}
              open={openChip === 'status'}
              onOpenChange={(next) => setOpenChip(next ? 'status' : null)}
            />
          </div>

          {/* ── More filters ─────────────────────────────────────────────
              Closed by default. Review state is something you go looking for,
              not something the panel should open on. */}
          <div className="rounded-xl border sm:hidden">
            <button
              type="button"
              onClick={() => setAdvancedOpen((current) => !current)}
              aria-expanded={advancedOpen}
              className="flex h-13 w-full items-center gap-2 px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
            >
              <span className="text-sm font-medium">{ui('More filters')}</span>
              {/* The summary is what makes a closed section safe: a review
                  filter can never be on without the row that hides it saying so. */}
              {review !== 'all' ? (
                <span className="truncate text-sm text-primary">
                  · {ui(draftReviewLabel)}
                </span>
              ) : null}
              <ChevronDown
                className={cn(
                  'ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                  advancedOpen && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </button>

            {advancedOpen ? (
              <div className="space-y-2 border-t px-3 py-3 duration-200 animate-in fade-in-0 motion-reduce:animate-none">
                <p className="text-xs text-muted-foreground">{ui('Review status')}</p>
                <div
                  role="group"
                  aria-label={ui('Filter by review status')}
                  className="grid grid-cols-2 gap-1 rounded-xl border bg-background p-1"
                >
                  {REVIEW_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setReview(option.value)
                        setDirty(true)
                      }}
                      aria-pressed={review === option.value}
                      className={cn(
                        typeButtonCls,
                        review === option.value && typeButtonActiveCls
                      )}
                    >
                      {ui(option.label)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Desktop keeps review as one more field among the others: a
              segmented strip up there would read as tabs over the list, which
              is exactly what this screen stopped having. */}
          <label className="hidden h-9 w-auto shrink-0 items-center gap-1.5 self-start rounded-lg border bg-background px-2.5 sm:flex">
            <span className="text-xs font-medium text-muted-foreground">
              {ui('Review')}
            </span>
            <select
              value={review}
              onChange={(event) => {
                setReview(event.target.value)
                setDirty(true)
              }}
              aria-label={ui('Filter by review status')}
              className="min-w-0 bg-transparent text-sm font-medium text-foreground outline-none"
            >
              {REVIEW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {ui(option.label)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* ── Actions ────────────────────────────────────────────────────
            Pinned footer on phones so Apply stays in thumb reach no matter how
            far the body has scrolled. */}
        <div className="absolute inset-x-0 bottom-0 flex shrink-0 items-center gap-2 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:ml-auto sm:border-0 sm:p-0">
          {/* Resets the draft, not the URL: this is a control inside a
              provisional panel, so like every other one it waits for Apply —
              and closing without applying puts it back. It never touches the
              period, which is not this panel's to change. */}
          <button
            type="button"
            onClick={resetDraft}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'h-11 flex-1 rounded-xl sm:h-8 sm:flex-none sm:rounded-lg'
            )}
          >
            {ui('Clear all')}
          </button>
          {dirty ? (
            <span role="status" className="hidden text-xs text-muted-foreground sm:inline">
              {ui('Unapplied changes')}
            </span>
          ) : null}
          <button
            type="button"
            onClick={apply}
            className={cn(
              buttonVariants({ size: 'sm' }),
              'relative h-11 flex-1 rounded-xl text-sm font-semibold sm:h-8 sm:flex-none sm:rounded-lg sm:font-medium'
            )}
          >
            {pending ? ui('Applying…') : ui('Apply filters')}
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
