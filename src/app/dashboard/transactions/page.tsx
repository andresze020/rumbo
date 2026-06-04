import { redirect } from 'next/navigation'
import Link from 'next/link'
import { TransactionEditForm } from './transaction-edit-form'
import { TransferEditForm } from './transfer-edit-form'
import { VoidTransactionForm } from './void-transaction-form'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'
import { MetricCard } from '@/components/metric-card'
import { StatusBadge } from '@/components/status-badge'
import { createClient } from '@/lib/supabase/server'

type TransactionsPageProps = {
  searchParams: Promise<{
    created?: string
    error?: string
    voided?: string
    updated?: string
    month?: string
    type?: string
    status?: string
    account_id?: string
    category_id?: string
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

type AccountLookup = {
  id: string
  name: string
}

type CategoryLookup = {
  id: string
  name: string
  parent_category_id: string | null
}

type TransactionFilters = {
  accountId: string
  categoryId: string
  month: string
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

function getMonthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const startDate = new Date(Date.UTC(year, monthNumber - 1, 1))
  const endDate = new Date(Date.UTC(year, monthNumber, 1))

  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  }
}

function normalizeOption(value: string | undefined, allowedValues: string[]) {
  return value && allowedValues.includes(value) ? value : 'all'
}

function formatValue(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
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

function getAccountLabel(account: Account) {
  return [
    account.name,
    account.institution_name || null,
    account.currency_code,
    account.is_archived ? 'archived' : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function getSourceLabel(source: string) {
  return source === 'csv_import' ? 'CSV import' : formatValue(source)
}

function transactionsPath(
  filters: TransactionFilters,
  panel?: {
    edit?: string
    mode?: 'create'
  }
) {
  const params = new URLSearchParams()

  params.set('month', filters.month)

  if (filters.type !== 'all') {
    params.set('type', filters.type)
  }

  if (filters.status !== 'all') {
    params.set('status', filters.status)
  }

  if (filters.accountId !== 'all') {
    params.set('account_id', filters.accountId)
  }

  if (filters.categoryId !== 'all') {
    params.set('category_id', filters.categoryId)
  }

  if (filters.search) {
    params.set('search', filters.search)
  }

  if (panel?.mode) {
    params.set('mode', panel.mode)
  }

  if (panel?.edit) {
    params.set('edit', panel.edit)
  }

  return `/dashboard/transactions?${params.toString()}`
}

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  const params = await searchParams
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const created = params.created === '1'
  const voided = params.voided === '1'
  const updated = params.updated === '1'
  const selectedMonth = normalizeMonth(params.month)
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
  const selectedAccountId =
    typeof params.account_id === 'string' ? params.account_id : 'all'
  const selectedCategoryId =
    typeof params.category_id === 'string' ? params.category_id : 'all'
  const searchText = typeof params.search === 'string' ? params.search.trim() : ''
  const filters: TransactionFilters = {
    accountId: selectedAccountId,
    categoryId: selectedCategoryId,
    month: selectedMonth,
    search: searchText,
    status: selectedStatus,
    type: selectedType,
  }
  const hasActiveFilters =
    params.month !== undefined ||
    selectedType !== 'all' ||
    selectedStatus !== 'all' ||
    selectedAccountId !== 'all' ||
    selectedCategoryId !== 'all' ||
    searchText.length > 0
  const editTransactionId =
    typeof params.edit === 'string' ? params.edit : null
  const monthRange = getMonthRange(selectedMonth)
  const returnTo = transactionsPath(filters)
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.default_household_id) {
    redirect('/onboarding')
  }

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()

  if (householdError || !household) {
    redirect('/onboarding')
  }

  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, name, currency_code, institution_name, is_archived')
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .order('name', { ascending: true })

  if (accountsError) {
    throw new Error('Could not load accounts.')
  }

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select(
      'id, name, category_type, reporting_type, parent_category_id, is_archived'
    )
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .order('parent_category_id', { ascending: true, nullsFirst: true })
    .order('name', { ascending: true })

  if (categoriesError) {
    throw new Error('Could not load categories.')
  }

  let transactionsQuery = supabase
    .from('transactions')
    .select(
      'id, transaction_date, transaction_type, status, description, merchant_name, notes, source, void_reason'
    )
    .eq('household_id', household.id)
    .gte('transaction_date', monthRange.start)
    .lt('transaction_date', monthRange.end)
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
    const escapedSearchText = searchText
      .replaceAll('%', '\\%')
      .replaceAll('_', '\\_')

    transactionsQuery = transactionsQuery.or(
      `description.ilike.%${escapedSearchText}%,merchant_name.ilike.%${escapedSearchText}%,notes.ilike.%${escapedSearchText}%`
    )
  }

  const { data: transactions, error: transactionsError } =
    await transactionsQuery

  if (transactionsError) {
    throw new Error('Could not load transactions.')
  }

  const transactionIds = (transactions ?? []).map(
    (transaction) => transaction.id
  )

  let transactionEntries: TransactionEntry[] = []
  let transactionAllocations: TransactionAllocation[] = []
  let accountLookupRows: AccountLookup[] = []
  let categoryLookupRows: CategoryLookup[] = []
  let transactionDetailsError = false

  if (transactionIds.length) {
    const { data: entries, error: entriesError } = await supabase
      .from('transaction_entries')
      .select(
        'transaction_id, account_id, amount_account_currency, currency_code'
      )
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

    const accountIds = Array.from(
      new Set(transactionEntries.map((entry) => entry.account_id))
    )
    const categoryIds = Array.from(
      new Set(
        transactionAllocations.map((allocation) => allocation.category_id)
      )
    )

    if (accountIds.length) {
      const { data: accountRows, error: accountRowsError } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('household_id', household.id)
        .in('id', accountIds)

      transactionDetailsError =
        transactionDetailsError || Boolean(accountRowsError)
      accountLookupRows = (accountRows ?? []) as AccountLookup[]
    }

    if (categoryIds.length) {
      const { data: categoryRows, error: categoryRowsError } = await supabase
        .from('categories')
        .select('id, name, parent_category_id')
        .eq('household_id', household.id)

      transactionDetailsError =
        transactionDetailsError || Boolean(categoryRowsError)
      categoryLookupRows = (categoryRows ?? []) as CategoryLookup[]
    }
  }

  const entriesByTransactionId = new Map<string, TransactionEntry[]>()

  for (const entry of transactionEntries) {
    const existingEntries = entriesByTransactionId.get(entry.transaction_id)

    if (existingEntries) {
      existingEntries.push(entry)
    } else {
      entriesByTransactionId.set(entry.transaction_id, [entry])
    }
  }

  const allocationsByTransactionId = new Map(
    transactionAllocations.map((allocation) => [
      allocation.transaction_id,
      allocation,
    ])
  )
  const allAccounts = (accounts ?? []) as Account[]
  const allCategories = (categories ?? []) as Category[]
  const accountNamesById = new Map([
    ...allAccounts.map((account) => [account.id, account.name] as const),
    ...accountLookupRows.map((account) => [account.id, account.name] as const),
  ])
  const categoryLookupRowsById = new Map(
    categoryLookupRows.map((category) => [category.id, category])
  )
  const categoryNamesById = new Map(
    categoryLookupRows.map((category) => [
      category.id,
      getCategoryPath(category, categoryLookupRowsById),
    ])
  )
  const categoryOptionsById = new Map(
    allCategories.map((category) => [category.id, category])
  )
  const activeAccounts = allAccounts.filter((account) => !account.is_archived)
  const activeCategories = allCategories.filter(
    (category) =>
      !category.is_archived &&
      (category.category_type === 'income' ||
        category.category_type === 'expense')
  )
  const filteredTransactions = ((transactions ?? []) as Transaction[]).filter(
    (transaction) => {
      const entries = entriesByTransactionId.get(transaction.id) ?? []
      const allocation = allocationsByTransactionId.get(transaction.id)
      const matchesAccount =
        selectedAccountId === 'all' ||
        entries.some((entry) => entry.account_id === selectedAccountId)
      const matchesCategory =
        selectedCategoryId === 'all' ||
        allocation?.category_id === selectedCategoryId

      return matchesAccount && matchesCategory
    }
  )

  function buildTransactionRow(transaction: Transaction): TransactionRow {
    const isOpeningBalance =
      transaction.transaction_type === 'opening_balance'
    const isTransfer = transaction.transaction_type === 'transfer'
    const isDebtPayment = transaction.transaction_type === 'debt_payment'
    const isBalanceMovement = isTransfer || isDebtPayment
    const isVoided = transaction.status === 'voided'
    const entries = entriesByTransactionId.get(transaction.id) ?? []
    const entry = entries[0]
    const transferOutEntry =
      entries.find(
        (transactionEntry) =>
          Number(transactionEntry.amount_account_currency) < 0
      ) ?? entry
    const transferInEntry =
      entries.find(
        (transactionEntry) =>
          Number(transactionEntry.amount_account_currency) > 0
      ) ??
      entries.find(
        (transactionEntry) => transactionEntry !== transferOutEntry
      )
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
          activeAccounts.some(
            (account) => account.id === transferOutEntry.account_id
          ) &&
          activeAccounts.some(
            (account) => account.id === transferInEntry.account_id
          )
      )
    const transferFromAccountName = transferOutEntry
      ? accountNamesById.get(transferOutEntry.account_id) ?? 'Unknown account'
      : 'Unknown account'
    const transferToAccountName = transferInEntry
      ? accountNamesById.get(transferInEntry.account_id) ?? 'Unknown account'
      : 'Unknown account'
    const title = isOpeningBalance
      ? 'Opening balance'
      : isTransfer
        ? `Transfer: ${transferFromAccountName} -> ${transferToAccountName}`
        : isDebtPayment
          ? transaction.description ||
            `Debt payment: ${transferFromAccountName} -> ${transferToAccountName}`
          : transaction.description || 'Transaction'
    const accountName = isBalanceMovement
      ? `${transferFromAccountName} -> ${transferToAccountName}`
      : entry
        ? accountNamesById.get(entry.account_id) ?? 'Unknown account'
        : 'Unknown account'
    const categoryName = isTransfer
      ? 'Transfer'
      : isOpeningBalance
        ? 'Opening balance'
        : isDebtPayment
          ? 'Debt principal'
          : allocation
            ? categoryNamesById.get(allocation.category_id) ??
              'Unknown category'
            : 'Not categorized'
    const amountEntry = isBalanceMovement
      ? transferInEntry ?? transferOutEntry
      : entry
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
  const pendingCount = transactionRows.filter(
    (row) => row.transaction.status === 'pending'
  ).length
  const voidedCount = transactionRows.filter((row) => row.isVoided).length
  const importedCount = transactionRows.filter((row) => row.isImported).length
  const summaryCards = [
    {
      label: 'Visible',
      value: String(visibleCount),
      description: selectedMonth,
    },
    {
      label: 'Pending',
      value: String(pendingCount),
      description: 'Awaiting posting',
    },
    {
      label: 'Voided',
      value: String(voidedCount),
      description: 'Excluded by existing rules',
    },
    {
      label: 'Imported',
      value: String(importedCount),
      description: 'CSV source',
    },
  ]

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{household.name}</p>
          <h1 className="text-2xl font-semibold tracking-normal">
            Transactions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and manage household transactions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <GlobalAddTransactionButton className={buttonVariants()}>
            Add transaction
          </GlobalAddTransactionButton>
          <Link
            href="/dashboard/transactions/import"
            className={buttonVariants({ variant: 'outline' })}
          >
            Import CSV
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {created ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Transaction created.
        </div>
      ) : null}

      {voided ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Transaction voided.
        </div>
      ) : null}

      {updated ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Transaction updated.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Narrow the list without leaving the transactions workflow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            method="get"
            action="/dashboard/transactions"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            <div className="space-y-2">
              <Label htmlFor="month">Month</Label>
              <Input
                id="month"
                name="month"
                type="month"
                defaultValue={selectedMonth}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                name="type"
                defaultValue={selectedType}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="all">All types</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="transfer">Transfer</option>
                <option value="opening_balance">Opening balance</option>
                <option value="debt_payment">Debt payment</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                defaultValue={selectedStatus}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="all">All statuses</option>
                <option value="posted">Posted</option>
                <option value="pending">Pending</option>
                <option value="voided">Voided</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account_id">Account</Label>
              <select
                id="account_id"
                name="account_id"
                defaultValue={selectedAccountId}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="all">All accounts</option>
                {allAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {getAccountLabel(account)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category_id">Category</Label>
              <select
                id="category_id"
                name="category_id"
                defaultValue={selectedCategoryId}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="all">All categories</option>
                {allCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {getCategoryPath(category, categoryOptionsById)}
                    {category.is_archived ? ' - archived' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                name="search"
                defaultValue={searchText}
                placeholder="Description or notes"
              />
            </div>

            <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
              <Button type="submit">Apply filters</Button>
              <Link
                href="/dashboard/transactions"
                className={buttonVariants({ variant: 'outline' })}
              >
                Clear filters
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            description={card.description}
          />
        ))}
      </div>

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
                selectedEditRow.transaction.transaction_type as
                  | 'income'
                  | 'expense'
              }
              transactionDate={selectedEditRow.transaction.transaction_date}
              accountId={selectedEditRow.entry.account_id}
              categoryId={selectedEditRow.allocation.category_id}
              amount={Math.abs(
                Number(selectedEditRow.entry.amount_account_currency)
              )}
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
              amount={Math.abs(
                Number(
                  selectedEditRow.transferInEntry.amount_account_currency
                )
              )}
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

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Transaction list</CardTitle>
              <CardDescription>
                Manual, imported, transfer, debt, and opening-balance activity.
              </CardDescription>
            </div>

            <GlobalAddTransactionButton
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Add transaction
            </GlobalAddTransactionButton>
          </div>
        </CardHeader>
        <CardContent>
          {transactionDetailsError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              Could not load transaction details.
            </p>
          ) : transactionRows.length ? (
            <div className="divide-y rounded-lg border">
              {transactionRows.map((row) => (
                <div
                  key={row.transaction.id}
                  className={`space-y-4 p-4 transition-colors ${
                    row.isVoided
                      ? 'bg-muted/30 text-muted-foreground'
                      : 'hover:bg-muted/20'
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-medium">{row.title}</h2>
                        <Badge variant="secondary">
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
                          <Badge variant="outline">Imported</Badge>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span>{row.transaction.transaction_date}</span>
                        <span>{getSourceLabel(row.transaction.source)}</span>
                        {row.transaction.merchant_name ? (
                          <span>Merchant: {row.transaction.merchant_name}</span>
                        ) : null}
                        {row.transaction.void_reason ? (
                          <span>Void reason: {row.transaction.void_reason}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-3 lg:min-w-40 lg:text-right">
                      {row.amountEntry && row.displayAmount !== undefined ? (
                        <p
                          className={`text-lg font-semibold tabular-nums ${
                            row.transaction.transaction_type === 'income'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : ''
                          }`}
                        >
                          {formatCurrency(
                            row.displayAmount,
                            row.amountEntry.currency_code
                          )}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {row.canEdit || row.canEditTransfer ? (
                          <Link
                            href={transactionsPath(filters, {
                              edit: row.transaction.id,
                            })}
                            className={buttonVariants({
                              variant: 'outline',
                              size: 'sm',
                            })}
                          >
                            Edit
                          </Link>
                        ) : null}

                        {row.canVoid ? (
                          <VoidTransactionForm
                            transactionId={row.transaction.id}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Account</p>
                      <p className="mt-1 font-medium">{row.accountName}</p>
                    </div>

                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Category</p>
                      <p className="mt-1 font-medium">{row.categoryName}</p>
                    </div>

                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Currency</p>
                      <p className="mt-1 font-medium">
                        {row.amountEntry?.currency_code ?? 'Unknown'}
                      </p>
                    </div>
                  </div>

                  {row.transaction.notes ? (
                    <p className="text-sm text-muted-foreground">
                      {row.transaction.notes}
                    </p>
                  ) : null}
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
                  ? 'Clear filters or choose another month to see more household activity.'
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
        </CardContent>
      </Card>
    </main>
  )
}
