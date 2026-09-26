import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Store, X } from 'lucide-react'
import { TransactionEditForm } from './transaction-edit-form'
import { RefundForm } from './refund-form'
import { TransferEditForm } from './transfer-edit-form'
import { TransactionFilters } from './transaction-filters'
import {
  TransactionList,
  type TransactionCopyPayload,
  type TransactionListCategory,
  type TransactionListGroup,
  type ReviewStatus,
} from './transaction-list'
import { TransactionToasts } from './transaction-toasts'
import { RememberTransactionScope } from './remember-scope'
import { SyncScopeUrl } from './sync-scope-url'
import { TransactionsHeader } from './transactions-header'
import { TransactionsSummary } from './transactions-summary'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { Callout } from '@/components/callout'
import { createClient } from '@/lib/supabase/server'
import { getRequestProfile, getRequestUser } from '@/lib/supabase/request'
import { getUiPreferences } from '@/lib/preferences/server'
import {
  TRANSACTION_SCOPE_COOKIE,
  isTransactionScopeKey,
  parseTransactionScope,
} from '@/lib/filters/transaction-scope-memory'
import {
  hasDefaultTransactionScope,
  type UiPreferences,
} from '@/lib/preferences/shared'
import {
  ALL_TIME_FROM,
  ALL_TIME_TO,
  appendPeriodParams,
  currentMonth,
  formatPeriodLabel,
  hasPeriodParam,
  offsetDate,
  parseTransactionPeriod,
  todayIsoDate,
  type TransactionPeriod,
} from '@/lib/periods/transaction-period'
import { getLocale } from '@/lib/i18n/server'
import { translate, type TranslationKey } from '@/lib/i18n/translate'
import { createUiTranslator } from '@/lib/i18n/ui'
import { localizeSystemCategoryName } from '@/lib/i18n/system-category-names'
import type { Locale } from '@/lib/i18n/dictionaries'
import {
  formatCurrency,
  formatIsoDate,
  formatIsoTime,
  formatLabel as formatValue,
  localeToBcp47,
} from '@/lib/format'
import { cn } from '@/lib/utils'

type TransactionsPageProps = {
  searchParams: Promise<{
    created?: string
    error?: string
    voided?: string
    updated?: string
    period?: string
    month?: string
    date_from?: string
    date_to?: string
    type?: string
    status?: string
    review?: string
    account_id?: string | string[]
    category_id?: string | string[]
    search?: string
    payee_id?: string
    tag_id?: string
    mode?: string
    edit?: string
    /** BR-040 — id of the expense being refunded. */
    refund?: string
    refunded?: string
    page?: string
  }>
}

type Account = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
  is_archived: boolean
  icon: string | null
  /** Soft-deleted accounts stay out of the pickers but still name their rows. */
  deleted_at: string | null
}

type Category = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
  is_system: boolean
  is_archived: boolean
  icon: string | null
  color: string | null
  /** Same as accounts: hidden from pickers, still names its rows. */
  deleted_at: string | null
}

type Transaction = {
  id: string
  transaction_date: string
  /** BR-045 — optional wall-clock time; null for every untimed transaction. */
  transaction_time: string | null
  transaction_type: string
  status: string
  review_status: string
  description: string | null
  merchant_name: string | null
  notes: string | null
  source: string
  void_reason: string | null
}

// Row shape returned by the search_household_transactions RPC (BR-008): each row
// is a page transaction plus the full-filtered-set aggregates repeated on every
// row (count, income/expense base totals, pending/imported counts).
type SearchTransactionRow = {
  id: string
  transaction_date: string
  transaction_time: string | null
  created_at: string
  transaction_type: string
  status: string
  review_status: string
  description: string | null
  merchant_name: string | null
  notes: string | null
  source: string
  void_reason: string | null
  total_count: number | string
  total_income_base: number | string
  total_expense_base: number | string
  total_pending: number | string
  total_imported: number | string
}

type TransactionEntry = {
  transaction_id: string
  account_id: string
  amount_account_currency: number | string
  currency_code: string
  exchange_rate_to_base: number | string
}

type TransactionAllocation = {
  transaction_id: string
  category_id: string
  amount_base_currency?: number | string
}

type AccountLookup = { id: string; name: string }
type CategoryLookup = {
  id: string
  name: string
  parent_category_id: string | null
  icon?: string | null
  color?: string | null
  is_system?: boolean
}

type TransactionFilters = {
  accountIds: string[]
  categoryIds: string[]
  /**
   * The one period this screen is showing. Not a month *and* a range that can
   * disagree — see `lib/periods/transaction-period`.
   */
  period: TransactionPeriod
  search: string
  statuses: string[]
  review: string
  types: string[]
  payeeIds: string[]
  tagIds: string[]
}

type TransactionRow = {
  accountName: string
  allocation?: TransactionAllocation
  amountEntry?: TransactionEntry
  canEdit: boolean
  canEditTransfer: boolean
  /** BR-040: a posted expense with an entry and an allocation can be refunded. */
  canRefund: boolean
  canVoid: boolean
  categoryColor: string | null
  categoryIcon: string | null
  /** Full path, e.g. "Investment / Time Deposit". Shown when a row expands. */
  categoryName: string
  /** Just the leaf, e.g. "Time Deposit" — what the slim row can actually fit. */
  categoryLeafName: string
  displayAmount?: number | string
  entry?: TransactionEntry
  entries: TransactionEntry[]
  isBalanceMovement: boolean
  isDebtPayment: boolean
  isImported: boolean
  isOpeningBalance: boolean
  isTransfer: boolean
  isVoided: boolean
  title: string
  transaction: Transaction
  transferFromAccountName: string
  transferInEntry?: TransactionEntry
  transferOutEntry?: TransactionEntry
  transferToAccountName: string
}

function normalizeOption(value: string | undefined, allowedValues: string[]) {
  return value && allowedValues.includes(value) ? value : 'all'
}

/** Repeated query params → a trimmed, de-duplicated id list. */
function toIdList(raw: string | string[] | undefined): string[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : []
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

/** Same, but keeping only values the column actually allows. */
function normalizeOptions(
  raw: string | string[] | undefined,
  allowedValues: readonly string[]
): string[] {
  return toIdList(raw).filter((value) => allowedValues.includes(value))
}

const TRANSACTION_TYPE_VALUES = [
  'income',
  'expense',
  'transfer',
  // BR-040: filterable in its own right — "show me what came back" is a real
  // question, and lumping refunds in with income was the thing BR-040 fixes.
  'refund',
  'opening_balance',
  'debt_payment',
  'adjustment',
] as const

const STATUS_VALUES = ['posted', 'pending', 'voided'] as const

type TransactionGroup = {
  date: string
  label: string
  rows: TransactionRow[]
}

function formatGroupDateLabel(date: string, locale: Locale) {
  const [yr, mo, dy] = date.split('-').map(Number)
  // timeZone:'UTC' pairs with the Date.UTC construction so the label matches the
  // stored calendar date on any runtime timezone (a behind-UTC server would
  // otherwise render the previous day).
  return new Intl.DateTimeFormat(localeToBcp47(locale), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(yr, mo - 1, dy)))
}

function groupRowsByDate(
  rows: TransactionRow[],
  locale: Locale,
  t: (key: 'transactionsList.today' | 'transactionsList.yesterday') => string
): TransactionGroup[] {
  const todayStr = todayIsoDate()
  const yesterdayStr = offsetDate(todayStr, -1)
  const groups: TransactionGroup[] = []

  for (const row of rows) {
    const date = row.transaction.transaction_date
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup.date === date) {
      lastGroup.rows.push(row)
      continue
    }
    const label =
      date === todayStr
        ? t('transactionsList.today')
        : date === yesterdayStr
        ? t('transactionsList.yesterday')
        : formatGroupDateLabel(date, locale)
    groups.push({ date, label, rows: [row] })
  }

  return groups
}

function getCategoryPath(
  category: { name: string; parent_category_id: string | null; is_system?: boolean },
  categoriesById: Map<string, { name: string; is_system?: boolean }>,
  locale: Locale
) {
  const parent = category.parent_category_id
    ? categoriesById.get(category.parent_category_id)
    : null
  const name = localizeSystemCategoryName(category.name, Boolean(category.is_system), locale)
  const parentName = parent
    ? localizeSystemCategoryName(parent.name, Boolean(parent.is_system), locale)
    : null
  return parentName ? `${parentName} / ${name}` : name
}

/**
 * The category's own value for `pick`, or the nearest ancestor's. The depth
 * guard is belt-and-braces: the schema forbids cycles, but a bad row must not
 * hang a page render.
 */
function inheritCategoryVisual(
  category: CategoryLookup,
  categoriesById: Map<string, CategoryLookup>,
  pick: (node: CategoryLookup) => string | null
) {
  let node: CategoryLookup | undefined = category
  for (let depth = 0; node && depth < 5; depth += 1) {
    const value = pick(node)
    if (value) return value
    node = node.parent_category_id
      ? categoriesById.get(node.parent_category_id)
      : undefined
  }
  return null
}

/**
 * The URL for a set of filters. One writer, and the period goes through
 * `appendPeriodParams` — the same function `parseTransactionPeriod` reads back
 * — so a link this builds and a link a user pastes resolve identically.
 */
function transactionsPath(
  filters: TransactionFilters,
  panel?: { edit?: string; mode?: 'create'; refund?: string }
) {
  const params = new URLSearchParams()

  appendPeriodParams(params, filters.period)

  for (const value of filters.types) params.append('type', value)
  for (const value of filters.statuses) params.append('status', value)
  if (filters.review !== 'all') params.set('review', filters.review)
  for (const id of filters.accountIds) params.append('account_id', id)
  for (const id of filters.categoryIds) params.append('category_id', id)
  if (filters.search) params.set('search', filters.search)
  for (const id of filters.payeeIds) params.append('payee_id', id)
  for (const id of filters.tagIds) params.append('tag_id', id)
  if (panel?.mode) params.set('mode', panel.mode)
  if (panel?.edit) params.set('edit', panel.edit)
  if (panel?.refund) params.set('refund', panel.refund)

  return `/dashboard/transactions?${params.toString()}`
}

/**
 * "Show me everything" — every account, every date.
 *
 * A bare `/dashboard/transactions` will not do: that is exactly the URL the
 * BR-038 landing preferences claim, so clearing would bounce straight back to
 * the user's default period and account. Naming the period explicitly both
 * keeps the redirect out of the way and says what it means.
 *
 * Note this is *not* what the filter sheet's "Clear all" uses any more: the
 * period is its own context now, and clearing a category should not silently
 * widen the months you were looking at.
 */
const CLEAR_FILTERS_HREF = '/dashboard/transactions?period=all-time'

const FILTER_PARAM_KEYS = [
  'period',
  'month',
  'date_from',
  'date_to',
  'account_id',
  'category_id',
  'tag_id',
  'payee_id',
  'type',
  'status',
  'review',
  'search',
  'page',
] as const

/**
 * The URL for the filters the user last applied, restored from the cookie the
 * page writes on every filtered render.
 *
 * Takes precedence over the BR-038 landing preferences: those describe where to
 * *start*, and a remembered scope means the user has already moved on from
 * there. Returns null when nothing usable was remembered, which drops through
 * to the preferences as before.
 *
 * Non-scope params (`created`, `edit`, `mode`…) ride along, so the toast or
 * dialog a redirect asked for still shows after the restore.
 */
function rememberedScopeHref(
  rawCookieValue: string,
  currentParams: Record<string, string | string[] | undefined>
) {
  const scope = parseTransactionScope(rawCookieValue)
  if ([...scope.keys()].length === 0) return null

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(currentParams)) {
    if (value === undefined || isTransactionScopeKey(key)) continue
    for (const entry of Array.isArray(value) ? value : [value]) {
      params.append(key, entry)
    }
  }
  for (const [key, value] of scope) params.append(key, value)

  return `/dashboard/transactions?${params.toString()}`
}

/** A same-page href back into the searchParams shape the page reads. */
function paramsFromHref(href: string): Awaited<TransactionsPageProps['searchParams']> {
  const query = new URLSearchParams(href.split('?')[1] ?? '')
  const out: Record<string, string | string[]> = {}
  for (const key of new Set(query.keys())) {
    const values = query.getAll(key)
    out[key] = values.length > 1 ? values : values[0]
  }
  return out as Awaited<TransactionsPageProps['searchParams']>
}

/**
 * The explicit URL that represents this user's preferred landing view.
 *
 * Non-filter params ride along: a server action that redirects back here with
 * `?created=1` (or `voided`, `undo_id`, `edit`…) must still show its toast or
 * dialog after the landing preferences are applied.
 */
function preferredScopeHref(
  preferences: UiPreferences,
  currentParams: Record<string, string | string[] | undefined>
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(currentParams)) {
    if (value === undefined) continue
    for (const entry of Array.isArray(value) ? value : [value]) {
      params.append(key, entry)
    }
  }
  const { defaultPeriod, defaultAccountIds } = preferences.transactions

  if (defaultPeriod === 'last_30_days') {
    const today = todayIsoDate()
    params.set('date_from', offsetDate(today, -29))
    params.set('date_to', today)
  } else if (defaultPeriod === 'all_time') {
    params.set('date_from', ALL_TIME_FROM)
    params.set('date_to', ALL_TIME_TO)
  } else {
    params.set('month', currentMonth())
  }

  for (const id of defaultAccountIds) params.append('account_id', id)

  return `/dashboard/transactions?${params.toString()}`
}

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  let params = await searchParams
  const locale = await getLocale()
  const ui = createUiTranslator(locale)
  const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars)
  const errorMessage = typeof params.error === 'string' ? params.error : null

  // ── BR-038: display preferences ───────────────────────────────────────────
  // The landing scope/period only apply to a *bare* URL — the moment any filter
  // param is present, the URL wins (a shared link, a "view transactions" button,
  // or the user clearing a filter must never be silently overridden). When they
  // do apply, the page renders that scope and writes the explicit URL (see
  // below), so every later navigation carries real params and this branch is
  // not re-entered.
  const preferences = await getUiPreferences()
  const hasAnyFilterParam = FILTER_PARAM_KEYS.some((key) => params[key] !== undefined)

  // Filters the user applied earlier in the session win over the landing
  // preferences: switching screens, or being redirected back here after
  // creating a transaction, should return to the view they were working in.
  //
  // Both used to be a server `redirect()`. On a cold open that was the "black
  // screen": the loading shell had already streamed, so the redirect could only
  // happen client-side, after a flash of Next's "This page couldn't load" and a
  // second full document load (~0.4–1.2 s). Now the page renders the scoped
  // view directly and <SyncScopeUrl> writes the URL with history.replaceState,
  // which the App Router picks up without a navigation.
  let canonicalHref: string | null = null
  if (!hasAnyFilterParam) {
    const rememberedScope = (await cookies()).get(TRANSACTION_SCOPE_COOKIE)?.value
    canonicalHref = rememberedScope ? rememberedScopeHref(rememberedScope, params) : null
  }

  if (!canonicalHref && !hasAnyFilterParam && !hasDefaultTransactionScope(preferences)) {
    canonicalHref = preferredScopeHref(preferences, params)
  }

  if (canonicalHref) params = paramsFromHref(canonicalHref)

  // Type, status and payee are multi-value like account/category/tag: an empty
  // list means "all", so "no filter" and "every option ticked" stay the same
  // query. Unknown values are dropped rather than passed through to the RPC.
  const selectedTypes = normalizeOptions(params.type, TRANSACTION_TYPE_VALUES)
  const selectedStatuses = normalizeOptions(params.status, STATUS_VALUES)
  const selectedReview = normalizeOption(params.review, [
    'unreviewed',
    'reviewed',
    'flagged',
  ])
  const selectedAccountIds = toIdList(params.account_id)
  const selectedCategoryIds = toIdList(params.category_id)
  const searchText = typeof params.search === 'string' ? params.search.trim() : ''
  const selectedPayeeIds = toIdList(params.payee_id)
  const selectedTagIds = toIdList(params.tag_id)

  // ── The period, resolved exactly once ─────────────────────────────────────
  // Everything below reads `period`: the RPC's date bounds, the totals, the
  // count, the date headers and the control's own label. There is no second
  // month or range living anywhere else for it to disagree with.
  //
  // A payee- or tag-only URL says nothing about a period, and those views are
  // all of history by design — so that is what it resolves to, rather than
  // being labelled with a month the results do not have.
  const period = parseTransactionPeriod(params, {
    unboundedFallback:
      (selectedPayeeIds.length > 0 || selectedTagIds.length > 0) &&
      !hasPeriodParam(params),
  })
  const resolvedDateFrom = period.dateFrom
  const resolvedDateTo = period.dateTo

  const filters: TransactionFilters = {
    accountIds: selectedAccountIds,
    categoryIds: selectedCategoryIds,
    period,
    search: searchText,
    statuses: selectedStatuses,
    review: selectedReview,
    types: selectedTypes,
    payeeIds: selectedPayeeIds,
    tagIds: selectedTagIds,
  }

  /**
   * The filters the sheet owns — everything except the period.
   *
   * This is what the "Filters" badge counts and what "Clear" and "Clear all"
   * reset. The period is deliberately not in it: it is a context of its own
   * now, so "2 filters" never means "and also September", and clearing a
   * category never silently widens the months you were reading.
   */
  const generalFilterCount =
    (selectedTypes.length > 0 ? 1 : 0) +
    (selectedStatuses.length > 0 ? 1 : 0) +
    (selectedReview !== 'all' ? 1 : 0) +
    (selectedAccountIds.length > 0 ? 1 : 0) +
    (selectedCategoryIds.length > 0 ? 1 : 0) +
    (selectedPayeeIds.length > 0 ? 1 : 0) +
    (selectedTagIds.length > 0 ? 1 : 0)
  const hasGeneralFilters = generalFilterCount > 0
  // Whether the *view* is narrowed at all, period included. Drives the empty
  // states and what gets remembered for the next bare landing.
  const hasActiveFilters =
    hasGeneralFilters || searchText.length > 0 || hasPeriodParam(params)

  const editTransactionId =
    typeof params.edit === 'string' ? params.edit : null
  const returnTo = transactionsPath(filters)

  // What a bare `/dashboard/transactions` should be restored to. Only recorded
  // once the user has actually narrowed something down — remembering the
  // untouched default view would pin them to whichever month they first opened.
  const rememberedScopeQuery = hasActiveFilters ? returnTo.split('?')[1] ?? '' : ''

  const supabase = await createClient()
  // Shared with the layout's reads in this request (lib/supabase/request).
  const user = await getRequestUser()
  if (!user) redirect('/login')

  const profile = await getRequestProfile()
  if (!profile?.default_household_id) redirect('/onboarding')

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()
  if (householdError || !household) redirect('/onboarding')

  // Four independent lookups, one round trip. Accounts and categories come back
  // unfiltered by `deleted_at`: the pickers drop the deleted ones in JS below,
  // and keeping them here means the row-level name lookups further down need no
  // queries of their own.
  const [
    { data: accountRows, error: accountsError },
    { data: categoryRows, error: categoriesError },
    { data: payeeRows },
    { data: tagRows },
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select(
        'id, name, currency_code, institution_name, is_archived, icon, deleted_at'
      )
      .eq('household_id', household.id)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
    supabase
      .from('categories')
      .select(
        'id, name, category_type, reporting_type, parent_category_id, is_system, is_archived, icon, color, deleted_at'
      )
      .eq('household_id', household.id)
      .order('parent_category_id', { ascending: true, nullsFirst: true })
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
    // BR-009: household payees power the transaction form's payee combobox.
    supabase
      .from('payees')
      .select('id, name')
      .eq('household_id', household.id)
      .order('name', { ascending: true }),
    // BR-023: household tags for the edit picker + list chips. Load all (incl.
    // archived) so a transaction tagged with a since-archived tag still renders
    // and isn't silently dropped when editing.
    supabase
      .from('tags')
      .select('id, name, color, is_archived')
      .eq('household_id', household.id)
      .order('name', { ascending: true }),
  ])
  if (accountsError) throw new Error('Could not load accounts.')
  if (categoriesError) throw new Error('Could not load categories.')

  const allAccountRows = (accountRows ?? []) as Account[]
  const allCategoryRows = (categoryRows ?? []) as Category[]
  const accounts = allAccountRows.filter((a) => a.deleted_at === null)
  const categories = allCategoryRows.filter((c) => c.deleted_at === null)
  const payeeOptions = (payeeRows ?? []) as { id: string; name: string }[]
  // The focus banner only makes sense for a single payee — it's what the
  // Payees page's "View transactions" button produces. With several picked,
  // the filter chips carry the story instead.
  const selectedPayeeName =
    selectedPayeeIds.length === 1
      ? payeeOptions.find((p) => p.id === selectedPayeeIds[0])?.name ?? null
      : null
  const clearPayeeHref = transactionsPath({ ...filters, payeeIds: [] })
  const payeeFilterOptions = payeeOptions.map((payee) => ({
    id: payee.id,
    label: payee.name,
  }))

  const householdTags = (tagRows ?? []) as {
    id: string
    name: string
    color: string | null
    is_archived: boolean
  }[]
  const tagsById = new Map(householdTags.map((tg) => [tg.id, tg]))
  const activeTagOptions = householdTags
    .filter((tg) => !tg.is_archived)
    .map((tg) => ({ id: tg.id, name: tg.name, color: tg.color }))
  // Options for the filter panel's tag facet (active tags whose id is either
  // active or currently selected, so a since-archived selected tag still shows).
  const tagFilterOptions = [
    ...activeTagOptions.map((tg) => ({ id: tg.id, label: tg.name })),
    ...selectedTagIds
      .filter((id) => !activeTagOptions.some((tg) => tg.id === id))
      .map((id) => ({ id, label: tagsById.get(id)?.name ?? 'Unknown tag', isArchived: true })),
  ]

  // ── BR-008: server-side filtering + pagination ────────────────────────────
  // Every filter (date/type/status/review/search/payee/account/category/tag)
  // plus pagination runs in a single RPC round trip. Account/category/tag
  // filters used to be applied in JS after loading the entire date window; they
  // now live in SQL (search_household_transactions), which also returns the
  // whole-set aggregates so the header + totals stay correct across pages.
  const allAccounts = accounts
  const allCategories = categories
  const activeAccounts = allAccounts.filter((a) => !a.is_archived)
  const activeCategories = allCategories.filter(
    (c) =>
      !c.is_archived &&
      (c.category_type === 'income' || c.category_type === 'expense')
  )
  // Active expense categories (path-labelled) for the transfer-cost picker.
  const allCategoriesById = new Map(allCategories.map((c) => [c.id, c]))
  const costCategoryOptions = allCategories
    .filter((c) => !c.is_archived && c.category_type === 'expense')
    .map((c) => {
      const parent = c.parent_category_id
        ? allCategoriesById.get(c.parent_category_id)
        : null
      const name = parent ? `${parent.name} / ${c.name}` : c.name
      return { id: c.id, label: c.icon ? `${c.icon} ${name}` : name }
    })

  // Selecting a parent category should also match transactions filed under any
  // of its child categories (e.g. "Transport" matches "Transport / Subway").
  const selectedCategoryIdSet = new Set(selectedCategoryIds)
  const effectiveCategoryIds = new Set(selectedCategoryIds)
  if (selectedCategoryIds.length > 0) {
    for (const category of allCategories) {
      if (
        category.parent_category_id &&
        selectedCategoryIdSet.has(category.parent_category_id)
      ) {
        effectiveCategoryIds.add(category.id)
      }
    }
  }

  const PAGE_SIZE = 50
  const rawPage = Number(params.page)
  const currentPage =
    Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const pageOffset = (currentPage - 1) * PAGE_SIZE

  const { data: rpcRows, error: transactionsError } = await supabase.rpc(
    'search_household_transactions',
    {
      p_household_id: household.id,
      // `bounded` is false only for All time, where null bounds mean "no
      // window" rather than a range that merely looks wide.
      p_date_from: period.bounded ? resolvedDateFrom : null,
      p_date_to: period.bounded ? resolvedDateTo : null,
      p_types: selectedTypes.length ? selectedTypes : null,
      p_statuses: selectedStatuses.length ? selectedStatuses : null,
      p_review: selectedReview !== 'all' ? selectedReview : null,
      p_search: searchText || null,
      p_payee_ids: selectedPayeeIds.length ? selectedPayeeIds : null,
      p_account_ids: selectedAccountIds.length ? selectedAccountIds : null,
      p_category_ids: effectiveCategoryIds.size
        ? Array.from(effectiveCategoryIds)
        : null,
      p_tag_ids: selectedTagIds.length ? selectedTagIds : null,
      p_limit: PAGE_SIZE,
      p_offset: pageOffset,
    }
  )
  if (transactionsError) throw new Error('Could not load transactions.')

  const rpcData = (rpcRows ?? []) as SearchTransactionRow[]
  const transactions: Transaction[] = rpcData.map((r) => ({
    id: r.id,
    transaction_date: r.transaction_date,
    transaction_time: r.transaction_time,
    transaction_type: r.transaction_type,
    status: r.status,
    review_status: r.review_status,
    description: r.description,
    merchant_name: r.merchant_name,
    notes: r.notes,
    source: r.source,
    void_reason: r.void_reason,
  }))
  const totalCount = rpcData.length ? Number(rpcData[0].total_count) : 0
  const totalIncomeBase = rpcData.length
    ? Number(rpcData[0].total_income_base)
    : 0
  const totalExpenseBase = rpcData.length
    ? Number(rpcData[0].total_expense_base)
    : 0
  const totalPending = rpcData.length ? Number(rpcData[0].total_pending) : 0
  const totalImported = rpcData.length ? Number(rpcData[0].total_imported) : 0
  const transactionIds = transactions.map((t) => t.id)

  // BR-023: tag links for the loaded transactions → chips on each row + the
  // edit form's current selection.
  const tagIdsByTransaction = new Map<string, string[]>()

  function tagsForTransaction(id: string) {
    return (tagIdsByTransaction.get(id) ?? [])
      .map((tid) => tagsById.get(tid))
      .filter((tg): tg is NonNullable<typeof tg> => Boolean(tg))
      .map((tg) => ({ id: tg.id, name: tg.name, color: tg.color }))
  }

  let transactionEntries: TransactionEntry[] = []
  let transactionAllocations: TransactionAllocation[] = []
  let transactionDetailsError = false

  // Everything the loaded page of transactions needs, in one round trip. The
  // account and category names used to be two more sequential queries; both
  // re-read rows the household lookups above already carry.
  if (transactionIds.length) {
    const [
      { data: tagLinks },
      { data: entries, error: entriesError },
      { data: allocations, error: allocationsError },
    ] = await Promise.all([
      supabase
        .from('transaction_tags')
        .select('transaction_id, tag_id')
        .eq('household_id', household.id)
        .in('transaction_id', transactionIds),
      supabase
        .from('transaction_entries')
        .select('transaction_id, account_id, amount_account_currency, currency_code, exchange_rate_to_base')
        .eq('household_id', household.id)
        .in('transaction_id', transactionIds),
      supabase
        .from('transaction_allocations')
        .select('transaction_id, category_id, amount_base_currency')
        .eq('household_id', household.id)
        .in('transaction_id', transactionIds),
    ])

    for (const link of tagLinks ?? []) {
      const list = tagIdsByTransaction.get(link.transaction_id) ?? []
      list.push(link.tag_id as string)
      tagIdsByTransaction.set(link.transaction_id, list)
    }

    transactionDetailsError = Boolean(entriesError || allocationsError)
    transactionEntries = (entries ?? []) as TransactionEntry[]
    transactionAllocations = (allocations ?? []) as TransactionAllocation[]
  }

  // Soft-deleted rows are included on purpose: a transaction on an account or
  // category that was later deleted still has to render with its name.
  const accountLookupRows: AccountLookup[] = allAccountRows
  const categoryLookupRows: CategoryLookup[] = allCategoryRows

  const entriesByTransactionId = new Map<string, TransactionEntry[]>()
  for (const entry of transactionEntries) {
    const existing = entriesByTransactionId.get(entry.transaction_id)
    if (existing) existing.push(entry)
    else entriesByTransactionId.set(entry.transaction_id, [entry])
  }

  const allocationsByTransactionId = new Map(
    transactionAllocations.map((a) => [a.transaction_id, a])
  )
  // BR-034: a transaction with more than one allocation (a split) can't be
  // represented by the single-category create form, so a copy of one leaves the
  // category blank rather than silently picking one of the splits.
  const allocationCountByTransactionId = new Map<string, number>()
  for (const allocation of transactionAllocations) {
    allocationCountByTransactionId.set(
      allocation.transaction_id,
      (allocationCountByTransactionId.get(allocation.transaction_id) ?? 0) + 1
    )
  }
  const accountNamesById = new Map([
    ...allAccounts.map((a) => [a.id, a.name] as const),
    ...accountLookupRows.map((a) => [a.id, a.name] as const),
  ])
  const categoryLookupRowsById = new Map(categoryLookupRows.map((c) => [c.id, c]))
  const categoryNamesById = new Map(
    categoryLookupRows.map((c) => [c.id, getCategoryPath(c, categoryLookupRowsById, locale)])
  )
  const categoryLeafNamesById = new Map(
    categoryLookupRows.map((c) => [
      c.id,
      localizeSystemCategoryName(c.name, Boolean(c.is_system), locale),
    ])
  )
  // System categories ship with an icon (migration 20260612180000 kept the
  // icons and dropped the seeded colours). Sub-categories are the user's own
  // and usually have neither, so a row for "Investments / Time Deposit" would
  // fall back to a bare arrow. Walking up the tree gives the leaf whatever its
  // nearest ancestor defines, which is what the emoji meant all along.
  const categoryIconsById = new Map(
    categoryLookupRows.map((c) => [
      c.id,
      inheritCategoryVisual(c, categoryLookupRowsById, (node) => node.icon ?? null),
    ])
  )
  const categoryColorsById = new Map(
    categoryLookupRows.map((c) => [
      c.id,
      inheritCategoryVisual(c, categoryLookupRowsById, (node) => node.color ?? null),
    ])
  )
  const categoryOptionsById = new Map(allCategories.map((c) => [c.id, c]))

  function buildTransactionRow(transaction: Transaction): TransactionRow {
    const isOpeningBalance = transaction.transaction_type === 'opening_balance'
    const isTransfer = transaction.transaction_type === 'transfer'
    const isDebtPayment = transaction.transaction_type === 'debt_payment'
    const isBalanceMovement = isTransfer || isDebtPayment
    const isVoided = transaction.status === 'voided'
    const entries = entriesByTransactionId.get(transaction.id) ?? []
    const entry = entries[0]
    const transferOutEntry =
      entries.find((e) => Number(e.amount_account_currency) < 0) ?? entry
    const transferInEntry =
      entries.find((e) => Number(e.amount_account_currency) > 0) ??
      entries.find((e) => e !== transferOutEntry)
    const allocation = allocationsByTransactionId.get(transaction.id)
    const canEdit =
      transaction.source === 'manual' &&
      (transaction.transaction_type === 'income' ||
        transaction.transaction_type === 'expense') &&
      (transaction.status === 'posted' || transaction.status === 'pending') &&
      Boolean(entry && allocation)
    // BR-040: an imported expense is refundable too — the refund is a new
    // transaction, so nothing about the original is edited. A voided or pending
    // expense is not: there is no settled cost to reduce yet.
    const canRefund =
      transaction.transaction_type === 'expense' &&
      transaction.status === 'posted' &&
      Boolean(entry && allocation)
    const canEditTransfer =
      transaction.source === 'manual' &&
      transaction.transaction_type === 'transfer' &&
      (transaction.status === 'posted' || transaction.status === 'pending') &&
      Boolean(
        transferOutEntry &&
          transferInEntry &&
          activeAccounts.some((a) => a.id === transferOutEntry.account_id) &&
          activeAccounts.some((a) => a.id === transferInEntry.account_id)
      )
    const transferFromAccountName = transferOutEntry
      ? (accountNamesById.get(transferOutEntry.account_id) ?? 'Unknown account')
      : 'Unknown account'
    const transferToAccountName = transferInEntry
      ? (accountNamesById.get(transferInEntry.account_id) ?? 'Unknown account')
      : 'Unknown account'
    const title = isOpeningBalance
      ? 'Opening balance'
      : isTransfer
      ? // Show the user's description when present; the from → to route already
        // shows in the row subtitle, so fall back to a plain "Transfer".
        transaction.description || 'Transfer'
      : isDebtPayment
      ? transaction.description || `Debt payment: ${transferFromAccountName} -> ${transferToAccountName}`
      : transaction.description || ''
    const accountName = isBalanceMovement
      ? `${transferFromAccountName} → ${transferToAccountName}`
      : entry
      ? (accountNamesById.get(entry.account_id) ?? 'Unknown account')
      : 'Unknown account'
    const categoryName = isTransfer
      ? 'Transfer'
      : isOpeningBalance
      ? 'Opening balance'
      : isDebtPayment
      ? 'Debt principal'
      : allocation
      ? (categoryNamesById.get(allocation.category_id) ?? 'Unknown category')
      : 'Not categorized'
    // A parent/child path is too long for one line at list density, so the row
    // shows the leaf and the expanded panel shows where it hangs from.
    const categoryLeafName = allocation && !isTransfer && !isOpeningBalance && !isDebtPayment
      ? (categoryLeafNamesById.get(allocation.category_id) ?? categoryName)
      : categoryName
    // A row with no description used to read "Transaction", which says nothing
    // when four rows in a row are called "Transaction". Fall back to who the
    // money moved with, then to what it was for.
    const resolvedTitle =
      title || transaction.merchant_name?.trim() || categoryLeafName || 'Transaction'
    const categoryIcon =
      !isTransfer && !isOpeningBalance && !isDebtPayment && allocation
        ? (categoryIconsById.get(allocation.category_id) ?? null)
        : null
    const categoryColor =
      !isTransfer && !isOpeningBalance && !isDebtPayment && allocation
        ? (categoryColorsById.get(allocation.category_id) ?? null)
        : null
    const amountEntry = isBalanceMovement ? transferInEntry ?? transferOutEntry : entry
    const displayAmount =
      isBalanceMovement && amountEntry
        ? Math.abs(Number(amountEntry.amount_account_currency))
        : amountEntry?.amount_account_currency

    return {
      accountName,
      allocation,
      amountEntry,
      canEdit,
      canEditTransfer,
      canRefund,
      canVoid: !['voided', 'deleted_soft'].includes(transaction.status),
      categoryColor,
      categoryIcon,
      categoryName,
      categoryLeafName,
      displayAmount,
      entry,
      entries,
      isBalanceMovement,
      isDebtPayment,
      isImported: transaction.source === 'csv_import',
      isOpeningBalance,
      isTransfer,
      isVoided,
      title: resolvedTitle,
      transaction,
      transferFromAccountName,
      transferInEntry,
      transferOutEntry,
      transferToAccountName,
    }
  }

  // BR-038: hiding balance adjustments is visibility only — the rows are still
  // fetched, still counted in the header totals, and still part of every
  // balance. They are simply not listed. (Filtering after the page query means
  // a page can render fewer than PAGE_SIZE rows; that is the honest trade for
  // not touching the search RPC's signature.)
  const transactionRows = transactions
    .filter(
      (transaction) =>
        preferences.transactions.showBalanceAdjustments ||
        transaction.transaction_type !== 'adjustment'
    )
    .map(buildTransactionRow)

  // Totals for the WHOLE filtered set (every page), converted to the household
  // base currency by the RPC. Transfers, debt payments, opening balances and
  // voided rows are excluded server-side so the figures stay aligned with
  // income/expense reporting; refunds reduce expenses (B-8), as on the
  // Dashboard. A refunds-only filter therefore reads as a negative expense,
  // which still deserves the summary — hence `!== 0`, not `> 0`.
  const filteredIncomeBase = totalIncomeBase
  const filteredExpenseBase = totalExpenseBase
  const hasFilteredTotals = filteredIncomeBase !== 0 || filteredExpenseBase !== 0

  const selectedEditRow = transactionRows.find(
    (row) => row.transaction.id === editTransactionId
  )

  // BR-040: the expense being refunded, and how much of it is still refundable.
  // The remaining amount is derived here so the form can default to it; the RPC
  // re-checks it, since this page only ever sees the current result set.
  const refundTransactionId = String(params.refund ?? '').trim()
  const selectedRefundRow = refundTransactionId
    ? transactionRows.find(
        (row) => row.transaction.id === refundTransactionId && row.canRefund
      )
    : undefined
  let refundedAlreadyBase = 0
  if (selectedRefundRow) {
    // Refunds are stored as negative allocations, so this sum is negative or 0.
    const { data: priorRefunds } = await supabase
      .from('transactions')
      .select('transaction_allocations(amount_base_currency)')
      .eq('household_id', household.id)
      .eq('refunded_transaction_id', selectedRefundRow.transaction.id)
      .eq('status', 'posted')
      .is('deleted_at', null)
    for (const refund of priorRefunds ?? []) {
      const allocations =
        (refund as { transaction_allocations?: { amount_base_currency: number | string }[] })
          .transaction_allocations ?? []
      for (const allocation of allocations) {
        refundedAlreadyBase += Number(allocation.amount_base_currency)
      }
    }
  }
  // Tags currently on the edited transaction, plus a picker list that includes
  // any archived tag already on it (so editing never silently drops it).
  const selectedEditTagIds = selectedEditRow
    ? tagIdsByTransaction.get(selectedEditRow.transaction.id) ?? []
    : []
  const editFormTags = (() => {
    const list = [...activeTagOptions]
    const known = new Set(list.map((tag) => tag.id))
    for (const tid of selectedEditTagIds) {
      if (!known.has(tid)) {
        const tg = tagsById.get(tid)
        if (tg) list.push({ id: tg.id, name: tg.name, color: tg.color })
      }
    }
    return list
  })()
  const transactionGroups = groupRowsByDate(transactionRows, locale, t)
  // Header/summary counts reflect the whole filtered set (from the RPC), not
  // just the current page.
  const visibleCount = totalCount
  const pendingCount = totalPending
  const importedCount = totalImported

  // What used to be a full header row of its own, and before that the
  // "ACTIVITY" title bar: how many rows the filters matched. It rides along
  // the list's own strip now. Counts cover the whole filtered set (from the
  // RPC), not just the current page.
  const listMeta = (
    <>
      {t(
        visibleCount === 1
          ? 'transactionsList.countOne'
          : 'transactionsList.countOther',
        { count: visibleCount }
      )}
      {pendingCount > 0 ? (
        <>
          {' · '}
          <span className="text-amber-600 dark:text-amber-400">
            {t('transactionsList.pendingCount', { count: pendingCount })}
          </span>
        </>
      ) : null}
      {importedCount > 0 ? (
        <>
          {' · '}
          {t('transactionsList.importedCount', { count: importedCount })}
        </>
      ) : null}
    </>
  )

  // BR-008 pagination: page links reuse the current filters and append ?page.
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const pageStart = totalCount === 0 ? 0 : pageOffset + 1
  const pageEnd = Math.min(pageOffset + transactionRows.length, totalCount)
  const listBasePath = transactionsPath(filters)
  const pageHref = (page: number) =>
    page <= 1
      ? listBasePath
      : `${listBasePath}${listBasePath.includes('?') ? '&' : '?'}page=${page}`

  // ── The period control ───────────────────────────────────────────────────
  // It owns the period and nothing else, so it navigates by rewriting only the
  // period params on top of everything else that is applied. `baseQuery` is
  // that everything-else; `appendPeriodParams` on the client writes the period
  // back in the exact shape `parseTransactionPeriod` reads here.
  const periodBaseParams = new URLSearchParams(listBasePath.split('?')[1] ?? '')
  for (const key of ['period', 'month', 'date_from', 'date_to', 'page']) {
    periodBaseParams.delete(key)
  }
  const periodBaseQuery = periodBaseParams.toString()
  const periodLabel = formatPeriodLabel(period, locale, ui)

  // The mirror image, for the filter bar: the period params on their own. It
  // rebuilds the query from its own staged filters and this, so applying a
  // filter can no more change the period than picking a period can drop a
  // filter.
  const periodQuery = appendPeriodParams(new URLSearchParams(), period).toString()

  // "Clear" and "Clear all" drop the general filters and the search, and leave
  // the period exactly where it is.
  const clearGeneralFiltersHref = transactionsPath({
    ...filters,
    types: [],
    statuses: [],
    review: 'all',
    accountIds: [],
    categoryIds: [],
    payeeIds: [],
    tagIds: [],
    search: '',
  })

  const accountOptions = allAccounts.map((a) => {
    const label = [a.name, a.institution_name, a.currency_code, a.is_archived ? 'archived' : null]
      .filter(Boolean)
      .join(' · ')
    return {
      id: a.id,
      label: a.icon ? `${a.icon} ${label}` : label,
      isArchived: a.is_archived,
    }
  })

  const categoryOpts = allCategories.map((c) => ({
    id: c.id,
    label: (() => {
      const parent = c.parent_category_id ? categoryOptionsById.get(c.parent_category_id) : null
      const name = parent ? `${parent.name} / ${c.name}` : c.name
      return c.icon ? `${c.icon} ${name}` : name
    })(),
    isArchived: c.is_archived,
  }))

  // ── Serialized rows for the client list ──────────────────────────────────
  const inlineCategories: TransactionListCategory[] = activeCategories.map((c) => ({
    id: c.id,
    name: c.name,
    category_type: c.category_type,
    parent_category_id: c.parent_category_id,
    icon: c.icon,
    is_system: c.is_system,
  }))

  const toReviewStatus = (value: string): ReviewStatus =>
    value === 'reviewed' || value === 'flagged' ? value : 'unreviewed'

  const activeAccountIds = new Set(activeAccounts.map((account) => account.id))

  /**
   * BR-034 — everything the create form needs to open pre-filled from an
   * existing row. Returns null for rows the form can't recreate: opening
   * balances, debt payments, and anything whose account is archived (the
   * picker only offers active accounts). Voided rows *are* copyable — the copy
   * is a brand-new posted transaction, which is exactly how you re-enter a
   * corrected version of something you voided. The date is deliberately absent:
   * the form defaults it to today.
   */
  function buildCopyPayload(row: TransactionRow): TransactionCopyPayload | null {
    if (row.isOpeningBalance || row.isDebtPayment) return null

    if (row.isTransfer) {
      const from = row.transferOutEntry
      const to = row.transferInEntry
      if (!from || !to) return null
      if (!activeAccountIds.has(from.account_id) || !activeAccountIds.has(to.account_id)) {
        return null
      }
      return {
        type: 'transfer',
        amount: Math.abs(Number(from.amount_account_currency)).toFixed(2),
        // Cross-currency transfers ask for both legs; the destination amount is
        // its own entry, so a copy has to carry it too or the form reopens with
        // "Amount received" empty.
        toAmount: Math.abs(Number(to.amount_account_currency)).toFixed(2),
        fromAccountId: from.account_id,
        toAccountId: to.account_id,
        description: row.transaction.description ?? '',
        notes: row.transaction.notes ?? '',
        tagIds: [],
      }
    }

    const type = row.transaction.transaction_type
    if (type !== 'income' && type !== 'expense') return null
    if (!row.entry || !activeAccountIds.has(row.entry.account_id)) return null

    const isSplit = (allocationCountByTransactionId.get(row.transaction.id) ?? 0) > 1

    return {
      type,
      amount: Math.abs(Number(row.entry.amount_account_currency)).toFixed(2),
      accountId: row.entry.account_id,
      categoryId: isSplit ? '' : row.allocation?.category_id ?? '',
      description: row.transaction.description ?? '',
      payeeName: row.transaction.merchant_name ?? '',
      notes: row.transaction.notes ?? '',
      tagIds: tagIdsByTransaction.get(row.transaction.id) ?? [],
    }
  }

  const serializedGroups: TransactionListGroup[] = transactionGroups.map((group) => ({
    date: group.date,
    label: group.label,
    rows: group.rows.map((row) => ({
      id: row.transaction.id,
      title: row.title,
      transactionType: row.transaction.transaction_type,
      status: row.transaction.status,
      reviewStatus: toReviewStatus(row.transaction.review_status),
      isVoided: row.isVoided,
      isImported: row.isImported,
      isOpeningBalance: row.isOpeningBalance,
      isTransfer: row.isTransfer,
      isDebtPayment: row.isDebtPayment,
      typeBadgeLabel: row.isOpeningBalance
        ? 'Opening balance'
        : row.isTransfer
        ? 'Transfer'
        : row.isDebtPayment
        ? 'Debt payment'
        : formatValue(row.transaction.transaction_type),
      accountName: row.accountName,
      // A transfer is one linked operation with two ends; the row and the
      // detail panel name both rather than implying two transactions.
      transferFromName: row.isBalanceMovement ? row.transferFromAccountName : null,
      transferToName: row.isBalanceMovement ? row.transferToAccountName : null,
      dateLabel: formatIsoDate(row.transaction.transaction_date, locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      categoryName: row.categoryName,
      categoryLeafName: row.categoryLeafName,
      categoryIcon: row.categoryIcon,
      categoryColor: row.categoryColor,
      merchantName: row.transaction.merchant_name,
      timeFormatted: formatIsoTime(row.transaction.transaction_time, locale),
      notes: row.transaction.notes,
      voidReason: row.transaction.void_reason,
      currencyCode: row.amountEntry?.currency_code ?? null,
      amountFormatted:
        row.amountEntry && row.displayAmount !== undefined
          ? formatCurrency(row.displayAmount, row.amountEntry.currency_code, locale)
          : null,
      tags: tagsForTransaction(row.transaction.id),
      // Cross-currency transfers carry their cost (FX spread + fee) as an
      // expense allocation — surface it on the row so it's visible, not just in
      // reports.
      transferCostFormatted:
        row.isTransfer &&
        row.allocation &&
        Number(row.allocation.amount_base_currency ?? 0) > 0
          ? formatCurrency(
              Number(row.allocation.amount_base_currency),
              household.base_currency,
              locale
            )
          : null,
      canEdit: row.canEdit,
      canEditTransfer: row.canEditTransfer,
      refundHref: row.canRefund
        ? transactionsPath(filters, { refund: row.transaction.id })
        : null,
      canVoid: row.canVoid,
      editHref: transactionsPath(filters, { edit: row.transaction.id }),
      transactionDate: row.transaction.transaction_date,
      accountId: row.entry?.account_id ?? null,
      categoryId: row.allocation?.category_id ?? null,
      amountRaw:
        row.canEdit && row.entry
          ? Math.abs(Number(row.entry.amount_account_currency)).toFixed(2)
          : null,
      description: row.transaction.description,
      copy: buildCopyPayload(row),
    })),
  }))

  // BR-009: suggest normalized payees (plus any not-yet-normalized merchant
  // names still on loaded rows) for the inline quick-edit payee field.
  const payeeSuggestions = Array.from(
    new Set([
      ...payeeOptions.map((payee) => payee.name),
      ...transactionRows
        .map((row) => row.transaction.merchant_name)
        .filter((name): name is string => Boolean(name && name.trim())),
    ])
  ).sort((a, b) => a.localeCompare(b))

  return (
    // `pb-20` on phones: the bottom nav is a real flex row under the scroller,
    // but its centre "+" is lifted 12px above it and rings the background, so
    // the last row still needs room to clear it.
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-3 pb-20 pt-3 sm:gap-4 sm:px-6 sm:pb-8 sm:pt-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      {/* Was an eyebrow + 2xl title + description, then a separate row of
          review tabs, then a count line. The household is a chip now, the
          description is gone (the list says what this screen is) and the
          period sits beside the title instead of being buried in the filter
          sheet. */}
      <TransactionsHeader
        period={period}
        periodLabel={periodLabel}
        periodBaseQuery={periodBaseQuery}
      />

      {canonicalHref ? <SyncScopeUrl href={canonicalHref} /> : null}

      {/* Keeps these filters for the next bare landing on this screen. */}
      {rememberedScopeQuery ? (
        <RememberTransactionScope query={rememberedScopeQuery} />
      ) : null}

      {/* ── Notifications ──────────────────────────────────────────────── */}
      <TransactionToasts />
      {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}

      {/* ── Payee focus chip ───────────────────────────────────────────── */}
      {selectedPayeeName ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-primary/5 px-3 py-2 text-sm">
          <Store className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="text-muted-foreground">{ui('Showing all transactions for')}</span>
          <span className="font-semibold">{selectedPayeeName ?? ui('this payee')}</span>
          <Link
            href={clearPayeeHref}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'ml-auto gap-1')}
          >
            <X className="size-3.5" aria-hidden="true" />
            {ui('Clear')}
          </Link>
        </div>
      ) : null}

      {/* ── Filters ────────────────────────────────────────────────────── */}
      {/* No card chrome on any breakpoint now: the control strip reads as part
          of the screen, the way a native list header does, instead of a boxed
          panel eating a border and 12px of padding on every side. */}
      <div>
        <TransactionFilters
          searchText={searchText}
          selectedTypes={selectedTypes}
          selectedStatuses={selectedStatuses}
          selectedReview={selectedReview}
          selectedAccountIds={selectedAccountIds}
          selectedCategoryIds={selectedCategoryIds}
          accountOptions={accountOptions}
          categoryOptions={categoryOpts}
          tagOptions={tagFilterOptions}
          selectedTagIds={selectedTagIds}
          payeeOptions={payeeFilterOptions}
          selectedPayeeIds={selectedPayeeIds}
          periodQuery={periodQuery}
          clearHref={clearGeneralFiltersHref}
        />
      </div>

      {/* BR-040: the refund goes back to the same account and the same category
          as the original — those are hidden inputs, not selects, because a
          refund landing elsewhere would defeat the point of the feature. */}
      {selectedRefundRow && selectedRefundRow.entry && selectedRefundRow.allocation ? (
        <FormDialog
          title="Record a refund"
          description="Money coming back on a purchase. It is recorded against the original category, so your reports show what the purchase actually cost."
          cancelHref={returnTo}
        >
          <RefundForm
            transactionId={selectedRefundRow.transaction.id}
            accountId={selectedRefundRow.entry.account_id}
            categoryId={selectedRefundRow.allocation.category_id}
            accountName={selectedRefundRow.accountName}
            categoryName={selectedRefundRow.categoryName}
            currencyCode={selectedRefundRow.entry.currency_code}
            originalAmount={Math.abs(
              Number(selectedRefundRow.entry.amount_account_currency)
            )}
            remainingAmount={Math.max(
              Math.abs(Number(selectedRefundRow.entry.amount_account_currency)) +
                refundedAlreadyBase /
                  Number(selectedRefundRow.entry.exchange_rate_to_base || 1),
              0
            )}
            exchangeRateToBase={Number(
              selectedRefundRow.entry.exchange_rate_to_base || 1
            )}
            description={selectedRefundRow.title}
            cancelHref={returnTo}
            returnTo={returnTo}
          />
        </FormDialog>
      ) : null}

      {/* ── Edit dialogs ───────────────────────────────────────────────── */}
      {selectedEditRow ? (
        <FormDialog
          title={selectedEditRow.canEditTransfer ? 'Edit transfer' : 'Edit transaction'}
          description={`Update ${selectedEditRow.title}. Existing safe edit rules still apply.`}
          cancelHref={returnTo}
          wide
        >
          {selectedEditRow.canEdit &&
          selectedEditRow.entry &&
          selectedEditRow.allocation ? (
            <TransactionEditForm
              transactionId={selectedEditRow.transaction.id}
              transactionType={
                selectedEditRow.transaction.transaction_type as 'income' | 'expense'
              }
              transactionDate={selectedEditRow.transaction.transaction_date}
              // BR-045: Postgres returns `HH:MM:SS`; an `<input type="time">`
              // without a step only round-trips `HH:MM`, so trim the seconds or
              // the control renders empty and a save would silently clear it.
              transactionTime={
                selectedEditRow.transaction.transaction_time?.slice(0, 5) ?? ''
              }
              accountId={selectedEditRow.entry.account_id}
              categoryId={selectedEditRow.allocation.category_id}
              amount={Math.abs(Number(selectedEditRow.entry.amount_account_currency))}
              cancelHref={returnTo}
              description={selectedEditRow.transaction.description ?? ''}
              merchantName={selectedEditRow.transaction.merchant_name ?? ''}
              notes={selectedEditRow.transaction.notes ?? ''}
              status={selectedEditRow.transaction.status}
              accounts={activeAccounts}
              categories={activeCategories}
              payees={payeeOptions}
              tags={editFormTags}
              selectedTagIds={selectedEditTagIds}
              returnTo={returnTo}
            />
          ) : null}

          {selectedEditRow.canEditTransfer &&
          selectedEditRow.transferOutEntry &&
          selectedEditRow.transferInEntry ? (
            <TransferEditForm
              transactionId={selectedEditRow.transaction.id}
              transactionDate={selectedEditRow.transaction.transaction_date}
              fromAccountId={selectedEditRow.transferOutEntry.account_id}
              toAccountId={selectedEditRow.transferInEntry.account_id}
              amount={Math.abs(Number(selectedEditRow.transferOutEntry.amount_account_currency))}
              initialToAmount={Math.abs(Number(selectedEditRow.transferInEntry.amount_account_currency))}
              cancelHref={returnTo}
              description={selectedEditRow.transaction.description ?? ''}
              notes={selectedEditRow.transaction.notes ?? ''}
              status={selectedEditRow.transaction.status}
              accounts={activeAccounts}
              returnTo={returnTo}
              baseCurrency={household.base_currency}
              initialExchangeRateToBase={Number(selectedEditRow.transferOutEntry.exchange_rate_to_base ?? 1)}
              costCategories={costCategoryOptions}
              initialCost={Math.abs(
                Number(selectedEditRow.allocation?.amount_base_currency ?? 0)
              )}
              initialCostCategoryId={selectedEditRow.allocation?.category_id ?? null}
            />
          ) : null}
        </FormDialog>
      ) : null}

      {/* ── Filtered totals (base currency) ───────────────────────────── */}
      {/* Net first, income and expenses under it, the currency in the label.
          The three tiles plus an "in CAD" caption underneath were four objects
          saying one thing. Nothing is recomputed here: these are the RPC's
          figures for the whole filtered set, with transfers, debt payments,
          opening balances and voided rows already excluded server-side. */}
      {hasFilteredTotals ? (
        <TransactionsSummary
          incomeBase={filteredIncomeBase}
          expenseBase={filteredExpenseBase}
          baseCurrency={household.base_currency}
        />
      ) : null}

      {/* ── Transaction list ───────────────────────────────────────────── */}
      <section className="space-y-1.5">
        {transactionDetailsError ? (
          <Callout variant="error">{ui('Could not load transaction details.')}</Callout>
        ) : serializedGroups.length ? (
          <TransactionList
            groups={serializedGroups}
            categories={inlineCategories}
            payeeSuggestions={payeeSuggestions}
            returnTo={returnTo}
            compact={preferences.transactions.compactList}
            meta={listMeta}
          />
        ) : selectedReview === 'unreviewed' ? (
          <EmptyState
            title="You're all caught up"
            description="Nothing is waiting for review in this range. Widen the date range or view all transactions."
            actionHref={transactionsPath({ ...filters, review: 'all' })}
            actionLabel="View all transactions"
          />
        ) : searchText ? (
          <EmptyState
            title="No transactions match your search"
            description="Try a shorter search, a different spelling, or a wider period."
            actionHref={CLEAR_FILTERS_HREF}
            actionLabel="Clear filters"
          />
        ) : (
          <EmptyState
            title={
              hasActiveFilters
                ? 'No transactions found for these filters'
                : 'No transactions yet'
            }
            description={
              hasActiveFilters
                ? 'Clear filters or adjust the date range to see more activity.'
                : 'A transaction is any money movement — a purchase, a payment you received, or a transfer between your own accounts.'
            }
            actionHref={
              hasActiveFilters
                ? CLEAR_FILTERS_HREF
                : transactionsPath(filters, { mode: 'create' })
            }
            actionLabel={hasActiveFilters ? 'Clear filters' : 'Add transaction'}
          />
        )}

        {/* ── Pagination ──────────────────────────────────────────────── */}
        {serializedGroups.length > 0 && totalPages > 1 ? (
          <nav
            className="flex flex-wrap items-center justify-between gap-2 px-1 pt-3"
            aria-label={ui('Transaction pages')}
          >
            <span className="text-sm text-muted-foreground">
              {ui('Showing')} {pageStart}–{pageEnd} {ui('of')} {totalCount}
            </span>
            <div className="flex items-center gap-2">
              {currentPage > 1 ? (
                <Link
                  href={pageHref(currentPage - 1)}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  rel="prev"
                >
                  {ui('Previous')}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'pointer-events-none opacity-50'
                  )}
                >
                  {ui('Previous')}
                </span>
              )}
              <span className="text-sm text-muted-foreground">
                {ui('Page')} {currentPage} {ui('of')} {totalPages}
              </span>
              {currentPage < totalPages ? (
                <Link
                  href={pageHref(currentPage + 1)}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  rel="next"
                >
                  {ui('Next')}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'pointer-events-none opacity-50'
                  )}
                >
                  {ui('Next')}
                </span>
              )}
            </div>
          </nav>
        ) : null}
      </section>
    </main>
  )
}
