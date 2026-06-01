import { redirect } from 'next/navigation'
import {
  TransactionForm,
  type TransactionFormAccount,
  type TransactionFormCategory,
} from './transaction-form'
import { VoidTransactionForm } from './void-transaction-form'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

type TransactionsPageProps = {
  searchParams: Promise<{
    created?: string
    error?: string
    voided?: string
  }>
}

type Account = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
}

type Category = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
}

type Transaction = {
  id: string
  transaction_date: string
  transaction_type: string
  status: string
  description: string | null
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

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  const params = await searchParams
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const created = params.created === '1'
  const voided = params.voided === '1'
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
    .select('id, name, currency_code, institution_name')
    .eq('household_id', household.id)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .order('name', { ascending: true })

  if (accountsError) {
    throw new Error('Could not load accounts.')
  }

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select('id, name, category_type, reporting_type, parent_category_id')
    .eq('household_id', household.id)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .in('category_type', ['income', 'expense'])
    .order('parent_category_id', { ascending: true, nullsFirst: true })
    .order('name', { ascending: true })

  if (categoriesError) {
    throw new Error('Could not load categories.')
  }

  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions')
    .select('id, transaction_date, transaction_type, status, description, source')
    .eq('household_id', household.id)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20)

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

  const activeAccounts = (accounts ?? []) as Account[]
  const activeCategories = (categories ?? []) as Category[]
  const recentTransactions = (transactions ?? []) as Transaction[]
  const canCreateTransaction =
    activeAccounts.length > 0 &&
    (activeCategories.length > 0 || activeAccounts.length >= 2)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <p className="text-sm text-muted-foreground">{household.name}</p>
        <h1 className="text-2xl font-semibold tracking-normal">
          Transactions
        </h1>
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
                      ? `Transfer: ${transferFromAccountName} to ${transferToAccountName}`
                      : transaction.description || 'Transaction'
                  const accountName = isTransfer
                    ? `${transferFromAccountName} to ${transferToAccountName}`
                    : entry
                      ? accountNamesById.get(entry.account_id) ??
                        'Unknown account'
                      : 'Unknown account'
                  const categoryName = isTransfer
                    ? 'Transfer'
                    : isOpeningBalance
                      ? 'Not categorized'
                      : allocation
                        ? categoryNamesById.get(allocation.category_id) ??
                          'Unknown category'
                        : 'Unknown category'
                  const amountEntry = isTransfer
                    ? transferInEntry ?? transferOutEntry
                    : entry
                  const displayAmount =
                    isTransfer && amountEntry
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
