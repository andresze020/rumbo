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
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { Callout } from '@/components/callout'
import { createClient } from '@/lib/supabase/server'
import { getUiPreferences } from '@/lib/preferences/server'
import {
  hasDefaultTransactionScope,
  type UiPreferences,
} from '@/lib/preferences/shared'
import { getLocale } from '@/lib/i18n/server'
import { translate, type TranslationKey } from '@/lib/i18n/translate'
import { createUiTranslator } from '@/lib/i18n/ui'
import { localizeSystemCategoryName } from '@/lib/i18n/system-category-names'
import type { Locale } from '@/lib/i18n/dictionaries'
import {
  formatCurrency,
  formatIsoDateRange,
  formatIsoTime,
  formatLabel as formatValue,
  formatMonthLabel,
  localeToBcp47,
} from '@/lib/format'
import { cn } from '@/lib/utils'

type TransactionsPageProps = {
  searchParams: Promise<{
    created?: string
    error?: string
    voided?: string
    updated?: string
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
  month: string
  dateFrom: string
  dateTo: string
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
  categoryName: string
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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function currentMonth() {
  return todayIsoDate().slice(0, 7)
}

function normalizeMonth(value: string | undefined) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : currentMonth()
}

function monthFirstDay(month: string) {
  return `${month}-01`
}

function monthLastDay(month: string) {
  const [yr, mo] = month.split('-').map(Number)
  return new Date(Date.UTC(yr, mo, 0)).toISOString().slice(0, 10)
}

function offsetDate(baseDate: string, days: number): string {
  const [yr, mo, dy] = baseDate.split('-').map(Number)
  return new Date(Date.UTC(yr, mo - 1, dy + days)).toISOString().slice(0, 10)
}

// Shift a YYYY-MM month string by whole months (negative = earlier).
function offsetMonth(month: string, months: number): string {
  const [yr, mo] = month.split('-').map(Number)
  return new Date(Date.UTC(yr, mo - 1 + months, 1)).toISOString().slice(0, 7)
}

// A range wide enough to cover every transaction, used for the "All time" preset.
const ALL_TIME_FROM = '2000-01-01'
const ALL_TIME_TO = '2099-12-31'

function formatDateRangeLabel(dateFrom: string, dateTo: string, locale: Locale): string {
  const fromMonth = dateFrom.slice(0, 7)
  const toMonth = dateTo.slice(0, 7)
  if (fromMonth === toMonth) {
    return formatMonthLabel(fromMonth, locale)
  }
  return formatIsoDateRange(dateFrom, dateTo, locale)
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

function transactionsPath(
  filters: TransactionFilters,
  panel?: { edit?: string; mode?: 'create'; refund?: string }
) {
  const params = new URLSearchParams()

  if (filters.dateFrom && filters.dateTo) {
    params.set('date_from', filters.dateFrom)
    params.set('date_to', filters.dateTo)
  } else if (filters.payeeIds.length === 0 && filters.tagIds.length === 0) {
    // A payee/tag filter with no explicit range is an all-time view of that
    // payee/tag — don't pin it to the current month, or navigating back to this
    // URL would hide its transactions from other months.
    params.set('month', filters.month || currentMonth())
  }

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
 * "Clear filters" has to mean *no* filters — every account, every date.
 *
 * A bare `/dashboard/transactions` will not do: that is exactly the URL the
 * BR-038 landing preferences claim, so clearing would bounce straight back to
 * the user's default period and account. Spelling out the widest possible range
 * both keeps the redirect out of the way and says what it means.
 */
const CLEAR_FILTERS_HREF = `/dashboard/transactions?date_from=${ALL_TIME_FROM}&date_to=${ALL_TIME_TO}`

/**
 * BR-038 — every search param that means "the user (or a link) chose a view".
 * If any of these is present the URL is authoritative and the landing
 * preferences stay out of the way.
 */
const FILTER_PARAM_KEYS = [
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
  const params = await searchParams
  const locale = await getLocale()
  const ui = createUiTranslator(locale)
  const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars)
  const errorMessage = typeof params.error === 'string' ? params.error : null

  // ── BR-038: display preferences ───────────────────────────────────────────
  // The landing scope/period only apply to a *bare* URL — the moment any filter
  // param is present, the URL wins (a shared link, a "view transactions" button,
  // or the user clearing a filter must never be silently overridden). When they
  // do apply, we redirect once to the explicit URL so every later navigation
  // carries real params and this branch is not re-entered.
  const preferences = await getUiPreferences()
  const hasAnyFilterParam = FILTER_PARAM_KEYS.some((key) => params[key] !== undefined)

  if (!hasAnyFilterParam && !hasDefaultTransactionScope(preferences)) {
    redirect(preferredScopeHref(preferences, params))
  }

  const rawDateFrom = typeof params.date_from === 'string' ? params.date_from : ''
  const rawDateTo = typeof params.date_to === 'string' ? params.date_to : ''
  const hasCustomDateRange =
    Boolean(rawDateFrom && rawDateTo) &&
    /^\d{4}-\d{2}-\d{2}$/.test(rawDateFrom) &&
    /^\d{4}-\d{2}-\d{2}$/.test(rawDateTo)

  let resolvedDateFrom: string
  let resolvedDateTo: string
  let resolvedMonth: string

  if (hasCustomDateRange) {
    resolvedDateFrom = rawDateFrom
    resolvedDateTo = rawDateTo
    resolvedMonth = rawDateFrom.slice(0, 7)
  } else {
    resolvedMonth = normalizeMonth(params.month)
    resolvedDateFrom = monthFirstDay(resolvedMonth)
    resolvedDateTo = monthLastDay(resolvedMonth)
  }

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

  // A payee/tag filter defaults to an all-time view; only constrain by date when
  // the user has explicitly picked a month or a custom range.
  const applyDateWindow =
    (selectedPayeeIds.length === 0 && selectedTagIds.length === 0) ||
    hasCustomDateRange ||
    params.month !== undefined

  const filters: TransactionFilters = {
    accountIds: selectedAccountIds,
    categoryIds: selectedCategoryIds,
    month: resolvedMonth,
    dateFrom: hasCustomDateRange ? resolvedDateFrom : '',
    dateTo: hasCustomDateRange ? resolvedDateTo : '',
    search: searchText,
    statuses: selectedStatuses,
    review: selectedReview,
    types: selectedTypes,
    payeeIds: selectedPayeeIds,
    tagIds: selectedTagIds,
  }

  const hasActiveFilters =
    hasCustomDateRange ||
    params.month !== undefined ||
    selectedTypes.length > 0 ||
    selectedStatuses.length > 0 ||
    selectedReview !== 'all' ||
    selectedAccountIds.length > 0 ||
    selectedCategoryIds.length > 0 ||
    searchText.length > 0 ||
    selectedPayeeIds.length > 0 ||
    selectedTagIds.length > 0

  const editTransactionId =
    typeof params.edit === 'string' ? params.edit : null
  const returnTo = transactionsPath(filters)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.default_household_id) redirect('/onboarding')

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()
  if (householdError || !household) redirect('/onboarding')

  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, name, currency_code, institution_name, is_archived, icon')
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
  if (accountsError) throw new Error('Could not load accounts.')

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select(
      'id, name, category_type, reporting_type, parent_category_id, is_system, is_archived, icon'
    )
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .order('parent_category_id', { ascending: true, nullsFirst: true })
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
  if (categoriesError) throw new Error('Could not load categories.')

  // BR-009: household payees power the transaction form's payee combobox.
  const { data: payeeRows } = await supabase
    .from('payees')
    .select('id, name')
    .eq('household_id', household.id)
    .order('name', { ascending: true })
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

  // BR-023: household tags for the edit picker + list chips. Load all (incl.
  // archived) so a transaction tagged with a since-archived tag still renders
  // and isn't silently dropped when editing.
  const { data: tagRows } = await supabase
    .from('tags')
    .select('id, name, color, is_archived')
    .eq('household_id', household.id)
    .order('name', { ascending: true })
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
  const allAccounts = (accounts ?? []) as Account[]
  const allCategories = (categories ?? []) as Category[]
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
      p_date_from: applyDateWindow ? resolvedDateFrom : null,
      p_date_to: applyDateWindow ? resolvedDateTo : null,
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
  if (transactionIds.length) {
    const { data: tagLinks } = await supabase
      .from('transaction_tags')
      .select('transaction_id, tag_id')
      .eq('household_id', household.id)
      .in('transaction_id', transactionIds)
    for (const link of tagLinks ?? []) {
      const list = tagIdsByTransaction.get(link.transaction_id) ?? []
      list.push(link.tag_id as string)
      tagIdsByTransaction.set(link.transaction_id, list)
    }
  }

  function tagsForTransaction(id: string) {
    return (tagIdsByTransaction.get(id) ?? [])
      .map((tid) => tagsById.get(tid))
      .filter((tg): tg is NonNullable<typeof tg> => Boolean(tg))
      .map((tg) => ({ id: tg.id, name: tg.name, color: tg.color }))
  }

  let transactionEntries: TransactionEntry[] = []
  let transactionAllocations: TransactionAllocation[] = []
  let accountLookupRows: AccountLookup[] = []
  let categoryLookupRows: CategoryLookup[] = []
  let transactionDetailsError = false

  if (transactionIds.length) {
    const { data: entries, error: entriesError } = await supabase
      .from('transaction_entries')
      .select('transaction_id, account_id, amount_account_currency, currency_code, exchange_rate_to_base')
      .eq('household_id', household.id)
      .in('transaction_id', transactionIds)

    const { data: allocations, error: allocationsError } = await supabase
      .from('transaction_allocations')
      .select('transaction_id, category_id, amount_base_currency')
      .eq('household_id', household.id)
      .in('transaction_id', transactionIds)

    transactionDetailsError = Boolean(entriesError || allocationsError)
    transactionEntries = (entries ?? []) as TransactionEntry[]
    transactionAllocations = (allocations ?? []) as TransactionAllocation[]

    const accountIds = Array.from(new Set(transactionEntries.map((e) => e.account_id)))
    const categoryIds = Array.from(new Set(transactionAllocations.map((a) => a.category_id)))

    if (accountIds.length) {
      const { data: accountRows, error: accountRowsError } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('household_id', household.id)
        .in('id', accountIds)
      transactionDetailsError = transactionDetailsError || Boolean(accountRowsError)
      accountLookupRows = (accountRows ?? []) as AccountLookup[]
    }

    if (categoryIds.length) {
      const { data: categoryRows, error: categoryRowsError } = await supabase
        .from('categories')
        .select('id, name, parent_category_id, icon, color, is_system')
        .eq('household_id', household.id)
      transactionDetailsError = transactionDetailsError || Boolean(categoryRowsError)
      categoryLookupRows = (categoryRows ?? []) as CategoryLookup[]
    }
  }

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
  const categoryIconsById = new Map(
    categoryLookupRows.map((c) => [c.id, c.icon ?? null])
  )
  const categoryColorsById = new Map(
    categoryLookupRows.map((c) => [c.id, c.color ?? null])
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
      : transaction.description || 'Transaction'
    const accountName = isBalanceMovement
      ? `${transferFromAccountName} -> ${transferToAccountName}`
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
      displayAmount,
      entry,
      entries,
      isBalanceMovement,
      isDebtPayment,
      isImported: transaction.source === 'csv_import',
      isOpeningBalance,
      isTransfer,
      isVoided,
      title,
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
  // income/expense reporting.
  const filteredIncomeBase = totalIncomeBase
  const filteredExpenseBase = totalExpenseBase
  const filteredNetBase = filteredIncomeBase - filteredExpenseBase
  const hasFilteredTotals = filteredIncomeBase > 0 || filteredExpenseBase > 0

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
  const dateRangeLabel = formatDateRangeLabel(resolvedDateFrom, resolvedDateTo, locale)

  // BR-008 pagination: page links reuse the current filters and append ?page.
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const pageStart = totalCount === 0 ? 0 : pageOffset + 1
  const pageEnd = Math.min(pageOffset + transactionRows.length, totalCount)
  const listBasePath = transactionsPath(filters)
  const pageHref = (page: number) =>
    page <= 1
      ? listBasePath
      : `${listBasePath}${listBasePath.includes('?') ? '&' : '?'}page=${page}`

  // Presets — computed server-side to bake in current non-date filters
  const todayStr = todayIsoDate()
  const thisYear = todayStr.slice(0, 4)
  const thisMonthStr = currentMonth()
  const lastMonthStr = offsetMonth(thisMonthStr, -1)
  const rawPresets = [
    { label: 'This month', from: monthFirstDay(thisMonthStr), to: monthLastDay(thisMonthStr) },
    { label: 'Last month', from: monthFirstDay(lastMonthStr), to: monthLastDay(lastMonthStr) },
    { label: 'Last 3 months', from: monthFirstDay(offsetMonth(thisMonthStr, -2)), to: todayStr },
    { label: 'Last 6 months', from: monthFirstDay(offsetMonth(thisMonthStr, -5)), to: todayStr },
    { label: 'Year to date', from: `${thisYear}-01-01`, to: todayStr },
    { label: 'All time', from: ALL_TIME_FROM, to: ALL_TIME_TO },
  ]
  // Presets carry their raw range, not a link: clicking one has to stage the
  // range in the form and wait for "Apply filters" like every other control.
  // A navigating preset applied itself immediately, so dismissing the sheet
  // left a range the user never confirmed.
  const presetOptions = rawPresets.map((p) => ({
    label: p.label,
    dateFrom: p.from,
    dateTo: p.to,
  }))

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

  // ── Sprint 4: review chips + serialized rows for the client list ──────────
  const reviewChips = [
    { label: 'All', value: 'all' },
    { label: 'To review', value: 'unreviewed' },
    { label: 'Reviewed', value: 'reviewed' },
    { label: 'Flagged', value: 'flagged' },
  ].map((chip) => ({
    label: chip.label,
    value: chip.value,
    href: transactionsPath({ ...filters, review: chip.value }),
    isActive: selectedReview === chip.value,
  }))

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
      categoryName: row.categoryName,
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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow={household.name}
        title="Transactions"
        description="Review and manage household transactions."
        // Phones reach both actions from the bottom nav (the + button and the
        // Money group's Import CSV), so the header stays title-only there.
        compactOnMobile
        actions={
          <>
            {/* The form starts empty by default. The one exception is context
                the user has already given us: when the list is narrowed to a
                single account, a new transaction almost certainly belongs to
                it. Two or more filtered accounts is not a hint, so nothing is
                pre-filled. */}
            <GlobalAddTransactionButton
              className={buttonVariants({ size: 'sm' })}
              defaultAccountId={
                selectedAccountIds.length === 1 ? selectedAccountIds[0] : undefined
              }
            >
              {ui('Add transaction')}
            </GlobalAddTransactionButton>
            <Link
              href="/dashboard/transactions/import"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {ui('Import CSV')}
            </Link>
          </>
        }
      />

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
      {/* No card chrome on phones: the control strip reads as part of the
          screen, the way a native list header does, instead of a boxed panel
          eating a border and 12px of padding on every side. */}
      <div className="sm:rounded-xl sm:border sm:bg-card sm:p-3 sm:shadow-sm sm:shadow-black/[0.03]">
        <TransactionFilters
          searchText={searchText}
          selectedTypes={selectedTypes}
          selectedStatuses={selectedStatuses}
          selectedReview={selectedReview}
          selectedAccountIds={selectedAccountIds}
          selectedCategoryIds={selectedCategoryIds}
          resolvedDateFrom={resolvedDateFrom}
          resolvedDateTo={resolvedDateTo}
          hasActiveFilters={hasActiveFilters}
          accountOptions={accountOptions}
          categoryOptions={categoryOpts}
          tagOptions={tagFilterOptions}
          selectedTagIds={selectedTagIds}
          payeeOptions={payeeFilterOptions}
          selectedPayeeIds={selectedPayeeIds}
          presetOptions={presetOptions}
          clearHref={CLEAR_FILTERS_HREF}
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

      {/* ── Transaction list ───────────────────────────────────────────── */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="flex flex-wrap items-center gap-x-1.5 text-sm font-medium text-muted-foreground">
            <span>
              {t(
                visibleCount === 1
                  ? 'transactionsList.countOne'
                  : 'transactionsList.countOther',
                { count: visibleCount }
              )}
            </span>
            <span>·</span>
            <span>{dateRangeLabel}</span>
            {pendingCount > 0 ? (
              <>
                <span>·</span>
                <span className="text-amber-600 dark:text-amber-400">
                  {t('transactionsList.pendingCount', { count: pendingCount })}
                </span>
              </>
            ) : null}
            {importedCount > 0 ? (
              <>
                <span>·</span>
                <span>{t('transactionsList.importedCount', { count: importedCount })}</span>
              </>
            ) : null}
          </h2>
          {/* No add button here: the page header already has one on desktop,
              and the bottom nav's + covers phones. */}
        </div>

        {/* ── Filtered totals (base currency) ─────────────────────────── */}
        {/* One scrolling line on phones instead of a wrapping block. */}
        {hasFilteredTotals ? (
          <div className="-mx-1 flex items-center gap-x-3 gap-y-1 overflow-x-auto whitespace-nowrap px-1 text-sm sm:mx-0 sm:flex-wrap sm:whitespace-normal">
            {filteredExpenseBase > 0 ? (
              <span className="font-semibold text-red-600 dark:text-red-400">
                {ui('Expenses')} {formatCurrency(filteredExpenseBase, household.base_currency, locale)}
              </span>
            ) : null}
            {filteredIncomeBase > 0 ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {ui('Income')} {formatCurrency(filteredIncomeBase, household.base_currency, locale)}
              </span>
            ) : null}
            {filteredIncomeBase > 0 && filteredExpenseBase > 0 ? (
              <span className="font-semibold text-foreground">
                {ui('Net')} {formatCurrency(filteredNetBase, household.base_currency, locale)}
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {ui('in')} {household.base_currency}
            </span>
          </div>
        ) : null}

        {/* ── Review-status filter chips ──────────────────────────────── */}
        {/* Scrolls as one line on phones rather than wrapping onto two. */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap">
          {reviewChips.map((chip) => (
            <Link
              key={chip.value}
              href={chip.href}
              className={cn(
                buttonVariants({
                  variant: chip.isActive ? 'secondary' : 'outline',
                  size: 'sm',
                }),
                'shrink-0'
              )}
            >
              {chip.label}
            </Link>
          ))}
        </div>

        {transactionDetailsError ? (
          <Callout variant="error">{ui('Could not load transaction details.')}</Callout>
        ) : serializedGroups.length ? (
          <TransactionList
            groups={serializedGroups}
            categories={inlineCategories}
            payeeSuggestions={payeeSuggestions}
            returnTo={returnTo}
            compact={preferences.transactions.compactList}
          />
        ) : selectedReview === 'unreviewed' ? (
          <EmptyState
            title="You're all caught up"
            description="Nothing is waiting for review in this range. Widen the date range or view all transactions."
            actionHref={transactionsPath({ ...filters, review: 'all' })}
            actionLabel="View all transactions"
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
