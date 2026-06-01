import { redirect } from 'next/navigation'
import {
  TransactionForm,
  type TransactionFormAccount,
  type TransactionFormCategory,
} from './transaction-form'
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
  reporting_type: string
}

type Transaction = {
  id: string
  transaction_date: string
  transaction_type: string
  status: string
  description: string | null
  source: string
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function formatValue(value: string) {
  return value.replaceAll('_', ' ')
}

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  const params = await searchParams
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const created = params.created === '1'
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
    .select('id, name, reporting_type')
    .eq('household_id', household.id)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .in('reporting_type', ['income', 'expense', 'debt_interest'])
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

  const activeAccounts = (accounts ?? []) as Account[]
  const activeCategories = (categories ?? []) as Category[]
  const recentTransactions = (transactions ?? []) as Transaction[]
  const canCreateTransaction =
    activeAccounts.length > 0 && activeCategories.length > 0

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

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>
              Latest manual household activity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentTransactions.length ? (
              <div className="divide-y rounded-lg border">
                {recentTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-medium">
                          {transaction.description || 'Transaction'}
                        </h2>
                        <Badge variant="secondary">
                          {formatValue(transaction.transaction_type)}
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
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                No transactions yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create transaction</CardTitle>
            <CardDescription>
              Add a manual income or expense transaction.
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
                Create categories first.
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
