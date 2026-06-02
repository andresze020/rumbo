import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  TransactionForm,
  type TransactionFormAccount,
  type TransactionFormCategory,
} from './transaction-form'
import { TransactionEditForm } from './transaction-edit-form'
import { TransferEditForm } from './transfer-edit-form'
import { VoidTransactionForm } from './void-transaction-form'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  notes: string | null
  source: string
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
  return value.replaceAll('_', ' ')
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

function buildReturnTo({
  month,
  type,
  status,
  accountId,
  categoryId,
  search,
}: {
  month: string
  type: string
  status: string
  accountId: string
  categoryId: string
  search: string
}) {
  const params = new URLSearchParams()

  params.set('month', month)

  if (type !== 'all') {
    params.set('type', type)
  }

  if (status !== 'all') {
    params.set('status', status)
  }

  if (accountId !== 'all') {
    params.set('account_id', accountId)
  }

  if (categoryId !== 'all') {
    params.set('category_id', categoryId)
  }

  if (search) {
    params.set('search', search)
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
  const monthRange = getMonthRange(selectedMonth)
  const returnTo = buildReturnTo({
    month: selectedMonth,
    type: selectedType,
    status: selectedStatus,
    accountId: selectedAccountId,
    categoryId: selectedCategoryId,
    search: searchText,
  })
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
    .select('id, name')
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
    .select('id, name, category_type, reporting_type, parent_category_id, is_archived')
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .order('parent_category_id', { ascending: true, nullsFirst: true })
    .order('name', { ascending: true })

  if (categoriesError) {
    throw new Error('Could not load categories.')
  }

  let transactionsQuery = supabase
    .from('transactions')
    .select('id, transaction_date, transaction_type, status, description, notes, source')
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
    const escapedSearchText = searchText.replaceAll('%', '\\%').replaceAll('_', '\\_')

    transactionsQuery = transactionsQuery.or(
      `description.ilike.%${escapedSearchText}%,notes.ilike.%${escapedSearchText}%`
    )
  }

  const { data: transactions, error: transactionsError } =
    await transactionsQuery

  if (transactionsError) {
    throw new Error('Could not load transactions.')
  }

  const transactionIds = (transactions ?? []).map((transaction) => transaction.id)

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
  const accountNamesById = new Map(
    accountLookupRows.map((account) => [account.id, account.name])
  )
  const categoryLookupRowsById = new Map(
    categoryLookupRows.map((category) => [category.id, category])
  )
  const categoryNamesById = new Map(
    categoryLookupRows.map((category) => [
      category.id,
      getCategoryPath(category, categoryLookupRowsById),
    ])
  )

  const allAccounts = (accounts ?? []) as Account[]
  const allCategories = (categories ?? []) as Category[]
  const categoryOptionsById = new Map(
    allCategories.map((category) => [category.id, category])
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

  const activeAccounts = allAccounts.filter((account) => !account.is_archived)
  const activeCategories = allCategories.filter(
    (category) =>
      !category.is_archived &&
      (category.category_type === 'income' || category.category_type === 'expense')
  )
  const recentTransactions = filteredTransactions
  const canCreateTransaction =
    activeAccounts.length > 0 &&
    (activeCategories.length > 0 || activeAccounts.length >= 2)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{household.name}</p>
          <h1 className="text-2xl font-semibold tracking-normal">
            Transactions
          </h1>
        </div>

        <Link
          href="/dashboard/transactions/import"
          className="inline-flex h-8 items-center justify-center rounded-lg border border-border px-2.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          Import CSV
        </Link>
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
            Narrow the transaction list by month, type, status, account,
            category, or text.
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
                    {category.is_archived ? ' · archived' : ''}
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
                className="inline-flex h-8 items-center justify-center rounded-lg border border-border px-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                Clear filters
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>
              Latest manual household activity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transactionDetailsError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                Could not load transaction details.
              </p>
            ) : recentTransactions.length ? (
              <div className="divide-y rounded-lg border">
                {recentTransactions.map((transaction) => {
                  const isOpeningBalance =
                    transaction.transaction_type === 'opening_balance'
                  const isTransfer =
                    transaction.transaction_type === 'transfer'
                  const isDebtPayment =
                    transaction.transaction_type === 'debt_payment'
                  const isBalanceMovement = isTransfer || isDebtPayment
                  const isVoided = transaction.status === 'voided'
                  const canVoid = !['voided', 'deleted_soft'].includes(
                    transaction.status
                  )
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
                      (transactionEntry) =>
                        transactionEntry !== transferOutEntry
                    )
                  const allocation = allocationsByTransactionId.get(
                    transaction.id
                  )
                  const canEdit =
                    transaction.source === 'manual' &&
                    (transaction.transaction_type === 'income' ||
                      transaction.transaction_type === 'expense') &&
                    (transaction.status === 'posted' ||
                      transaction.status === 'pending') &&
                    Boolean(entry && allocation)
                  const canEditTransfer =
                    transaction.source === 'manual' &&
                    transaction.transaction_type === 'transfer' &&
                    (transaction.status === 'posted' ||
                      transaction.status === 'pending') &&
                    Boolean(
                      transferOutEntry &&
                        transferInEntry &&
                        activeAccounts.some(
                          (account) =>
                            account.id === transferOutEntry.account_id
                        ) &&
                        activeAccounts.some(
                          (account) =>
                            account.id === transferInEntry.account_id
                        )
                    )
                  const transferFromAccountName = transferOutEntry
                    ? accountNamesById.get(transferOutEntry.account_id) ??
                      'Unknown account'
                    : 'Unknown account'
                  const transferToAccountName = transferInEntry
                    ? accountNamesById.get(transferInEntry.account_id) ??
                      'Unknown account'
                    : 'Unknown account'
                  const transactionLabel = isOpeningBalance
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
                      ? accountNamesById.get(entry.account_id) ??
                        'Unknown account'
                      : 'Unknown account'
                  const categoryName = isTransfer
                    ? 'Transfer'
                    : isOpeningBalance
                      ? 'Not categorized'
                      : isDebtPayment
                        ? 'Debt principal'
                        : allocation
                          ? categoryNamesById.get(allocation.category_id) ??
                            'Unknown category'
                          : 'Unknown category'
                  const amountEntry = isBalanceMovement
                    ? transferInEntry ?? transferOutEntry
                    : entry
                  const displayAmount =
                    isBalanceMovement && amountEntry
                      ? Math.abs(Number(amountEntry.amount_account_currency))
                      : amountEntry?.amount_account_currency

                  return (
                    <div
                      key={transaction.id}
                      className={`space-y-3 p-4 ${isVoided ? 'bg-muted/30 text-muted-foreground' : ''}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-medium">{transactionLabel}</h2>
                            <Badge variant="secondary">
                              {isOpeningBalance
                                ? 'Opening balance'
                                : isTransfer
                                  ? 'Transfer'
                                  : isDebtPayment
                                    ? 'Debt payment'
                                    : formatValue(transaction.transaction_type)}
                            </Badge>
                            <Badge variant="outline">
                              {formatValue(transaction.status)}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            <span>{transaction.transaction_date}</span>
                            <span>{formatValue(transaction.source)}</span>
                          </div>
                        </div>

                        <div className="space-y-3 sm:min-w-32 sm:text-right">
                          {amountEntry && displayAmount !== undefined ? (
                            <p className="font-medium">
                              {formatCurrency(
                                displayAmount,
                                amountEntry.currency_code
                              )}
                            </p>
                          ) : null}

                          {canVoid ? (
                            <VoidTransactionForm
                              transactionId={transaction.id}
                            />
                          ) : null}
                        </div>
                      </div>

                      <div className="grid gap-3 text-sm sm:grid-cols-3">
                        <div className="rounded-lg bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">
                            Account
                          </p>
                          <p className="mt-1 font-medium">{accountName}</p>
                        </div>

                        <div className="rounded-lg bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">
                            Category
                          </p>
                          <p className="mt-1 font-medium">{categoryName}</p>
                        </div>

                        <div className="rounded-lg bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">
                            Currency
                          </p>
                          <p className="mt-1 font-medium">
                            {amountEntry?.currency_code ?? 'Unknown'}
                          </p>
                        </div>
                      </div>

                      {canEdit && entry && allocation ? (
                        <TransactionEditForm
                          transactionId={transaction.id}
                          transactionType={
                            transaction.transaction_type as 'income' | 'expense'
                          }
                          transactionDate={transaction.transaction_date}
                          accountId={entry.account_id}
                          categoryId={allocation.category_id}
                          amount={Math.abs(
                            Number(entry.amount_account_currency)
                          )}
                          description={transaction.description ?? ''}
                          notes={transaction.notes ?? ''}
                          status={transaction.status}
                          accounts={activeAccounts}
                          categories={activeCategories}
                          returnTo={returnTo}
                        />
                      ) : null}

                      {canEditTransfer &&
                      transferOutEntry &&
                      transferInEntry ? (
                        <TransferEditForm
                          transactionId={transaction.id}
                          transactionDate={transaction.transaction_date}
                          fromAccountId={transferOutEntry.account_id}
                          toAccountId={transferInEntry.account_id}
                          amount={Math.abs(
                            Number(transferInEntry.amount_account_currency)
                          )}
                          description={transaction.description ?? ''}
                          notes={transaction.notes ?? ''}
                          status={transaction.status}
                          accounts={activeAccounts}
                          returnTo={returnTo}
                        />
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                No transactions yet. Create your first income, expense, or
                transfer transaction.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create transaction</CardTitle>
            <CardDescription>
              Add a manual income, expense, or transfer transaction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!activeAccounts.length ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Create an account first.
              </p>
            ) : null}

            {!activeCategories.length ? (
              <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Create categories first for income and expense transactions.
              </p>
            ) : null}

            {canCreateTransaction ? (
              <TransactionForm
                accounts={activeAccounts as TransactionFormAccount[]}
                categories={activeCategories as TransactionFormCategory[]}
                defaultDate={todayIsoDate()}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
