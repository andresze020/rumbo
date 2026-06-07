import { redirect } from 'next/navigation'
import Link from 'next/link'
import { TransactionEditForm } from './transaction-edit-form'
import { TransferEditForm } from './transfer-edit-form'
import { TransactionFilters } from './transaction-filters'
import { VoidTransactionForm } from './void-transaction-form'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'
import { StatusBadge } from '@/components/status-badge'
import { createClient } from '@/lib/supabase/server'

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
    account_id?: string | string[]
    category_id?: string | string[]
    search?: string
    mode?: string
    edit?: string
  }>
}

type Account = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
  is_archived: boolean
}

type Category = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
  is_archived: boolean
  icon: string | null
}

type Transaction = {
  id: string
  transaction_date: string
  transaction_type: string
  status: string
  description: string | null
  merchant_name: string | null
  notes: string | null
  source: string
  void_reason: string | null
}

type TransactionEntry = {
  transaction_id: string
  account_id: string
  amount_account_currency: number | string
  currency_code: string
}

type TransactionAllocation = {
  transaction_id: string
  category_id: string
}

type AccountLookup = { id: string; name: string }
type CategoryLookup = {
  id: string
  name: string
  parent_category_id: string | null
  icon?: string | null
}

type TransactionFilters = {
  accountIds: string[]
  categoryIds: string[]
  month: string
  dateFrom: string
  dateTo: string
  search: string
  status: string
  type: string
}

type TransactionRow = {
  accountName: string
  allocation?: TransactionAllocation
  amountEntry?: TransactionEntry
  canEdit: boolean
  canEditTransfer: boolean
  canVoid: boolean
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

function formatDateRangeLabel(dateFrom: string, dateTo: string): string {
  const fromMonth = dateFrom.slice(0, 7)
  const toMonth = dateTo.slice(0, 7)
  if (fromMonth === toMonth) {
    const [yr, mo] = fromMonth.split('-').map(Number)
    return new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric' }).format(
      new Date(yr, mo - 1, 1)
    )
  }
  const fmt = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt.format(new Date(dateFrom))} – ${fmt.format(new Date(dateTo))}`
}

function normalizeOption(value: string | undefined, allowedValues: string[]) {
  return value && allowedValues.includes(value) ? value : 'all'
}

function formatValue(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

function formatCurrency(value: number | string, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(value))
}

function getCategoryPath(
  category: { name: string; parent_category_id: string | null },
  categoriesById: Map<string, { name: string }>
) {
  const parentName = category.parent_category_id
    ? categoriesById.get(category.parent_category_id)?.name
    : null
  return parentName ? `${parentName} / ${category.name}` : category.name
}

function transactionsPath(
  filters: TransactionFilters,
  panel?: { edit?: string; mode?: 'create' }
) {
  const params = new URLSearchParams()

  if (filters.dateFrom && filters.dateTo) {
    params.set('date_from', filters.dateFrom)
    params.set('date_to', filters.dateTo)
  } else {
    params.set('month', filters.month || currentMonth())
  }

  if (filters.type !== 'all') params.set('type', filters.type)
  if (filters.status !== 'all') params.set('status', filters.status)
  for (const id of filters.accountIds) params.append('account_id', id)
  for (const id of filters.categoryIds) params.append('category_id', id)
  if (filters.search) params.set('search', filters.search)
  if (panel?.mode) params.set('mode', panel.mode)
  if (panel?.edit) params.set('edit', panel.edit)

  return `/dashboard/transactions?${params.toString()}`
}

function presetPath(
  filters: TransactionFilters,
  dateFrom: string,
  dateTo: string
) {
  return transactionsPath({ ...filters, dateFrom, dateTo, month: '' })
}

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  const params = await searchParams
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const created = params.created === '1'
  const voided = params.voided === '1'
  const updated = params.updated === '1'

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

  const selectedType = normalizeOption(params.type, [
    'income',
    'expense',
    'transfer',
    'opening_balance',
    'debt_payment',
    'adjustment',
  ])
  const selectedStatus = normalizeOption(params.status, [
    'posted',
    'pending',
    'voided',
  ])
  const rawAccountIds = params.account_id
  const selectedAccountIds: string[] = Array.isArray(rawAccountIds)
    ? rawAccountIds
    : rawAccountIds
    ? [rawAccountIds]
    : []
  const rawCategoryIds = params.category_id
  const selectedCategoryIds: string[] = Array.isArray(rawCategoryIds)
    ? rawCategoryIds
    : rawCategoryIds
    ? [rawCategoryIds]
    : []
  const searchText = typeof params.search === 'string' ? params.search.trim() : ''

  const filters: TransactionFilters = {
    accountIds: selectedAccountIds,
    categoryIds: selectedCategoryIds,
    month: resolvedMonth,
    dateFrom: hasCustomDateRange ? resolvedDateFrom : '',
    dateTo: hasCustomDateRange ? resolvedDateTo : '',
    search: searchText,
    status: selectedStatus,
    type: selectedType,
  }

  const hasActiveFilters =
    hasCustomDateRange ||
    params.month !== undefined ||
    selectedType !== 'all' ||
    selectedStatus !== 'all' ||
    selectedAccountIds.length > 0 ||
    selectedCategoryIds.length > 0 ||
    searchText.length > 0

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
    .select('id, name, currency_code, institution_name, is_archived')
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .order('name', { ascending: true })
  if (accountsError) throw new Error('Could not load accounts.')

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select(
      'id, name, category_type, reporting_type, parent_category_id, is_archived, icon'
    )
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .order('parent_category_id', { ascending: true, nullsFirst: true })
    .order('name', { ascending: true })
  if (categoriesError) throw new Error('Could not load categories.')

  let transactionsQuery = supabase
    .from('transactions')
    .select(
      'id, transaction_date, transaction_type, status, description, merchant_name, notes, source, void_reason'
    )
    .eq('household_id', household.id)
    .gte('transaction_date', resolvedDateFrom)
    .lte('transaction_date', resolvedDateTo)
    .is('deleted_at', null)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (selectedType !== 'all') {
    transactionsQuery = transactionsQuery.eq('transaction_type', selectedType)
  }
  if (selectedStatus !== 'all') {
    transactionsQuery = transactionsQuery.eq('status', selectedStatus)
  }
  if (searchText) {
    const escaped = searchText.replaceAll('%', '\\%').replaceAll('_', '\\_')
    transactionsQuery = transactionsQuery.or(
      `description.ilike.%${escaped}%,merchant_name.ilike.%${escaped}%,notes.ilike.%${escaped}%`
    )
  }

  const { data: transactions, error: transactionsError } = await transactionsQuery
  if (transactionsError) throw new Error('Could not load transactions.')

  const transactionIds = (transactions ?? []).map((t) => t.id)

  let transactionEntries: TransactionEntry[] = []
  let transactionAllocations: TransactionAllocation[] = []
  let accountLookupRows: AccountLookup[] = []
  let categoryLookupRows: CategoryLookup[] = []
  let transactionDetailsError = false

  if (transactionIds.length) {
    const { data: entries, error: entriesError } = await supabase
      .from('transaction_entries')
      .select('transaction_id, account_id, amount_account_currency, currency_code')
      .eq('household_id', household.id)
      .in('transaction_id', transactionIds)

    const { data: allocations, error: allocationsError } = await supabase
      .from('transaction_allocations')
      .select('transaction_id, category_id')
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
        .select('id, name, parent_category_id, icon')
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
  const allAccounts = (accounts ?? []) as Account[]
  const allCategories = (categories ?? []) as Category[]
  const accountNamesById = new Map([
    ...allAccounts.map((a) => [a.id, a.name] as const),
    ...accountLookupRows.map((a) => [a.id, a.name] as const),
  ])
  const categoryLookupRowsById = new Map(categoryLookupRows.map((c) => [c.id, c]))
  const categoryNamesById = new Map(
    categoryLookupRows.map((c) => [c.id, getCategoryPath(c, categoryLookupRowsById)])
  )
  const categoryIconsById = new Map(
    categoryLookupRows.map((c) => [c.id, c.icon ?? null])
  )
  const categoryOptionsById = new Map(allCategories.map((c) => [c.id, c]))
  const activeAccounts = allAccounts.filter((a) => !a.is_archived)
  const activeCategories = allCategories.filter(
    (c) =>
      !c.is_archived &&
      (c.category_type === 'income' || c.category_type === 'expense')
  )

  const filteredTransactions = ((transactions ?? []) as Transaction[]).filter(
    (transaction) => {
      const entries = entriesByTransactionId.get(transaction.id) ?? []
      const allocation = allocationsByTransactionId.get(transaction.id)
      const matchesAccount =
        selectedAccountIds.length === 0 ||
        entries.some((e) => selectedAccountIds.includes(e.account_id))
      const matchesCategory =
        selectedCategoryIds.length === 0 ||
        (allocation !== undefined && selectedCategoryIds.includes(allocation.category_id))
      return matchesAccount && matchesCategory
    }
  )

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
      ? `Transfer: ${transferFromAccountName} -> ${transferToAccountName}`
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
      canVoid: !['voided', 'deleted_soft'].includes(transaction.status),
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

  const transactionRows = filteredTransactions.map(buildTransactionRow)
  const selectedEditRow = transactionRows.find(
    (row) => row.transaction.id === editTransactionId
  )
  const visibleCount = transactionRows.length
  const pendingCount = transactionRows.filter((r) => r.transaction.status === 'pending').length
  const importedCount = transactionRows.filter((r) => r.isImported).length
  const dateRangeLabel = formatDateRangeLabel(resolvedDateFrom, resolvedDateTo)

  // Presets — computed server-side to bake in current non-date filters
  const todayStr = todayIsoDate()
  const thisYear = todayStr.slice(0, 4)
  const thisMonthStr = currentMonth()
  const rawPresets = [
    { label: 'This month', from: monthFirstDay(thisMonthStr), to: monthLastDay(thisMonthStr) },
    { label: 'Last 30d', from: offsetDate(todayStr, -29), to: todayStr },
    { label: 'Last 60d', from: offsetDate(todayStr, -59), to: todayStr },
    { label: 'Last 90d', from: offsetDate(todayStr, -89), to: todayStr },
    { label: 'This year', from: `${thisYear}-01-01`, to: `${thisYear}-12-31` },
  ]
  const presetLinks = rawPresets.map((p) => ({
    label: p.label,
    href: presetPath(filters, p.from, p.to),
    isActive: resolvedDateFrom === p.from && resolvedDateTo === p.to,
  }))

  const accountOptions = allAccounts.map((a) => ({
    id: a.id,
    label: [a.name, a.institution_name, a.currency_code, a.is_archived ? 'archived' : null]
      .filter(Boolean)
      .join(' · '),
    isArchived: a.is_archived,
  }))

  const categoryOpts = allCategories.map((c) => ({
    id: c.id,
    label: (() => {
      const parent = c.parent_category_id ? categoryOptionsById.get(c.parent_category_id) : null
      return parent ? `${parent.name} / ${c.name}` : c.name
    })(),
    isArchived: c.is_archived,
  }))

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{household.name}</p>
          <h1 className="text-2xl font-semibold tracking-normal">Transactions</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Review and manage household transactions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <GlobalAddTransactionButton className={buttonVariants({ size: 'sm' })}>
            Add transaction
          </GlobalAddTransactionButton>
          <Link
            href="/dashboard/transactions/import"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Import CSV
          </Link>
        </div>
      </div>

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      {created ? (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">Transaction created.</div>
      ) : null}
      {voided ? (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">Transaction voided.</div>
      ) : null}
      {updated ? (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">Transaction updated.</div>
      ) : null}

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="rounded-lg border p-3">
        <TransactionFilters
          searchText={searchText}
          selectedType={selectedType}
          selectedStatus={selectedStatus}
          selectedAccountIds={selectedAccountIds}
          selectedCategoryIds={selectedCategoryIds}
          resolvedDateFrom={resolvedDateFrom}
          resolvedDateTo={resolvedDateTo}
          hasActiveFilters={hasActiveFilters}
          accountOptions={accountOptions}
          categoryOptions={categoryOpts}
          presetLinks={presetLinks}
        />
      </div>

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
              amount={Math.abs(Number(selectedEditRow.transferInEntry.amount_account_currency))}
              cancelHref={returnTo}
              description={selectedEditRow.transaction.description ?? ''}
              notes={selectedEditRow.transaction.notes ?? ''}
              status={selectedEditRow.transaction.status}
              accounts={activeAccounts}
              returnTo={returnTo}
            />
          ) : null}
        </FormDialog>
      ) : null}

      {/* ── Transaction list ───────────────────────────────────────────── */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="flex flex-wrap items-center gap-x-1.5 text-sm font-medium text-muted-foreground">
            <span>{visibleCount} transaction{visibleCount !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span>{dateRangeLabel}</span>
            {pendingCount > 0 ? (
              <>
                <span>·</span>
                <span className="text-amber-600 dark:text-amber-400">{pendingCount} pending</span>
              </>
            ) : null}
            {importedCount > 0 ? (
              <>
                <span>·</span>
                <span>{importedCount} imported</span>
              </>
            ) : null}
          </h2>
          <GlobalAddTransactionButton
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Add transaction
          </GlobalAddTransactionButton>
        </div>

        {transactionDetailsError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Could not load transaction details.
          </p>
        ) : transactionRows.length ? (
          <div className="divide-y rounded-lg border">
            {transactionRows.map((row) => (
              <div
                key={row.transaction.id}
                className={`space-y-1 p-4 transition-colors ${
                  row.isVoided ? 'bg-muted/30 text-muted-foreground' : 'hover:bg-muted/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className="font-medium leading-snug">{row.title}</h2>
                      <Badge variant="secondary" className="text-xs">
                        {row.isOpeningBalance
                          ? 'Opening balance'
                          : row.isTransfer
                          ? 'Transfer'
                          : row.isDebtPayment
                          ? 'Debt payment'
                          : formatValue(row.transaction.transaction_type)}
                      </Badge>
                      <StatusBadge status={row.transaction.status} />
                      {row.isImported ? (
                        <Badge variant="outline" className="text-xs">
                          Imported
                        </Badge>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{row.transaction.transaction_date}</span>
                      <span>·</span>
                      <span>{row.accountName}</span>
                      <span>·</span>
                      <span>
                        {row.categoryIcon ? (
                          <span aria-hidden="true">{row.categoryIcon} </span>
                        ) : null}
                        {row.categoryName}
                      </span>
                      {row.amountEntry?.currency_code ? (
                        <>
                          <span>·</span>
                          <span>{row.amountEntry.currency_code}</span>
                        </>
                      ) : null}
                      {row.transaction.merchant_name ? (
                        <>
                          <span>·</span>
                          <span>{row.transaction.merchant_name}</span>
                        </>
                      ) : null}
                      {row.transaction.void_reason ? (
                        <>
                          <span>·</span>
                          <span>Voided: {row.transaction.void_reason}</span>
                        </>
                      ) : null}
                    </div>

                    {row.transaction.notes ? (
                      <p className="text-xs italic text-muted-foreground/70">
                        {row.transaction.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {row.amountEntry && row.displayAmount !== undefined ? (
                      <p
                        className={`text-base font-semibold tabular-nums leading-snug ${
                          row.transaction.transaction_type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : ''
                        }`}
                      >
                        {formatCurrency(row.displayAmount, row.amountEntry.currency_code)}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap justify-end gap-1.5">
                      {row.canEdit || row.canEditTransfer ? (
                        <Link
                          href={transactionsPath(filters, { edit: row.transaction.id })}
                          className={buttonVariants({ variant: 'outline', size: 'sm' })}
                        >
                          Edit
                        </Link>
                      ) : null}
                      {row.canVoid ? (
                        <VoidTransactionForm transactionId={row.transaction.id} />
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
                : 'Add a transaction or import a CSV once accounts and categories are ready.'
            }
            actionHref={
              hasActiveFilters
                ? '/dashboard/transactions'
                : transactionsPath(filters, { mode: 'create' })
            }
            actionLabel={hasActiveFilters ? 'Clear filters' : 'Add transaction'}
          />
        )}
      </section>
    </main>
  )
}
