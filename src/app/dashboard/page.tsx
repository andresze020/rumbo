import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type AccountBalance = {
  account_id: string
  account_name: string
  account_type: string
  account_class: string
  currency_code: string
  include_in_net_worth: boolean
  posted_balance_account_currency: number | string
  pending_balance_account_currency: number | string
  projected_balance_account_currency: number | string
  posted_balance_base_currency: number | string
  pending_balance_base_currency: number | string
  projected_balance_base_currency: number | string
}

type DashboardPageProps = {
  searchParams: Promise<{
    month?: string
  }>
}

type MonthlyDashboardSummary = {
  household_id: string
  month_start: string
  month_end: string
  base_currency: string
  monthly_income: number | string
  monthly_expenses: number | string
  monthly_savings: number | string
  savings_rate: number | string | null
  income_transaction_count: number | string
  expense_transaction_count: number | string
}

type MonthlyExpenseCategory = {
  category_id: string
  category_name: string
  parent_category_id: string | null
  amount_base_currency: number | string
  transaction_count: number | string
}

function currentMonthParam() {
  return new Date().toISOString().slice(0, 7)
}

function parseDashboardMonth(month: string | undefined) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return currentMonthParam()
  }

  const parsedDate = new Date(`${month}-01T00:00:00.000Z`)

  if (Number.isNaN(parsedDate.getTime())) {
    return currentMonthParam()
  }

  return month
}

function formatCurrency(value: number, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(value)
}

function formatAccountCurrency(value: number | string, currencyCode: string) {
  return formatCurrency(Number(value), currencyCode)
}

function formatValue(value: string) {
  return value.replaceAll('_', ' ')
}

function formatPercent(value: number | string | null) {
  if (value === null) {
    return 'N/A'
  }

  return new Intl.NumberFormat('en-CA', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value))
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = await searchParams
  const selectedMonth = parseDashboardMonth(params.month)
  const selectedMonthDate = `${selectedMonth}-01`
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

  const { data: household, error } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()

  if (error || !household) {
    redirect('/onboarding')
  }

  const { data: accountBalances, error: accountBalancesError } =
    await supabase.rpc('get_account_balances', {
      p_household_id: household.id,
    })

  const { data: monthlySummaryRows, error: monthlySummaryError } =
    await supabase.rpc('get_monthly_dashboard_summary', {
      p_household_id: household.id,
      p_month: selectedMonthDate,
    })

  const { data: expenseCategoryRows, error: expenseCategoriesError } =
    await supabase.rpc('get_monthly_expenses_by_category', {
      p_household_id: household.id,
      p_month: selectedMonthDate,
    })

  const balances = (accountBalances ?? []) as AccountBalance[]
  const monthlySummary =
    ((monthlySummaryRows ?? [])[0] as MonthlyDashboardSummary | undefined) ??
    null
  const expenseCategories = (expenseCategoryRows ??
    []) as MonthlyExpenseCategory[]
  const dashboardCurrency =
    monthlySummary?.base_currency ?? household.base_currency
  const monthlyExpenses = Number(monthlySummary?.monthly_expenses ?? 0)
  const includedBalances = balances.filter(
    (account) => account.include_in_net_worth
  )
  const totalAssets = includedBalances
    .filter((account) => account.account_class === 'asset')
    .reduce(
      (total, account) =>
        total + Number(account.posted_balance_base_currency),
      0
    )
  const totalLiabilities = Math.abs(
    includedBalances
      .filter((account) => account.account_class === 'liability')
      .reduce(
        (total, account) =>
          total + Number(account.posted_balance_base_currency),
        0
      )
  )
  const netWorth = includedBalances.reduce(
    (total, account) => total + Number(account.posted_balance_base_currency),
    0
  )
  const projectedNetWorth = includedBalances.reduce(
    (total, account) => total + Number(account.projected_balance_base_currency),
    0
  )

  const summaryCards = [
    {
      label: 'Total assets',
      value: totalAssets,
      description: 'Posted asset balances',
    },
    {
      label: 'Total liabilities',
      value: totalLiabilities,
      description: 'Posted liability balances',
    },
    {
      label: 'Net worth',
      value: netWorth,
      description: 'Posted included balances',
    },
    {
      label: 'Projected net worth',
      value: projectedNetWorth,
      description: 'Posted plus pending',
    },
  ]
  const monthlyCards = [
    {
      label: 'Monthly income',
      value: monthlySummary
        ? formatCurrency(Number(monthlySummary.monthly_income), dashboardCurrency)
        : formatCurrency(0, dashboardCurrency),
      description: `${Number(monthlySummary?.income_transaction_count ?? 0)} posted income transactions`,
    },
    {
      label: 'Monthly expenses',
      value: monthlySummary
        ? formatCurrency(
            Number(monthlySummary.monthly_expenses),
            dashboardCurrency
          )
        : formatCurrency(0, dashboardCurrency),
      description: `${Number(monthlySummary?.expense_transaction_count ?? 0)} posted expense transactions`,
    },
    {
      label: 'Monthly savings',
      value: monthlySummary
        ? formatCurrency(
            Number(monthlySummary.monthly_savings),
            dashboardCurrency
          )
        : formatCurrency(0, dashboardCurrency),
      description: 'Income minus expenses',
    },
    {
      label: 'Savings rate',
      value: formatPercent(monthlySummary?.savings_rate ?? null),
      description: 'Savings divided by income',
    },
  ]

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{household.name}</p>
          <h1 className="text-2xl font-semibold tracking-normal">
            Dashboard
          </h1>
        </div>

        <form action="/dashboard" className="flex items-end gap-2">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Month</span>
            <input
              type="month"
              name="month"
              defaultValue={selectedMonth}
              className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
          <button
            type="submit"
            className={buttonVariants({ variant: 'outline' })}
          >
            View
          </button>
        </form>
      </div>

      {accountBalancesError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load financial summary.
        </div>
      ) : null}

      {monthlySummaryError || expenseCategoriesError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load monthly dashboard metrics.
        </div>
      ) : null}

      {!monthlySummaryError && !expenseCategoriesError ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {monthlyCards.map((summary) => (
              <Card key={summary.label}>
                <CardHeader>
                  <CardTitle>{summary.label}</CardTitle>
                  <CardDescription>{summary.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold">{summary.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Expenses by category</CardTitle>
              <CardDescription>
                Posted expense allocations for the selected month.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {expenseCategories.length ? (
                <div className="divide-y rounded-lg border">
                  {expenseCategories.map((category) => {
                    const amount = Number(category.amount_base_currency)
                    const percentOfExpenses =
                      monthlyExpenses > 0 ? amount / monthlyExpenses : null

                    return (
                      <div
                        key={category.category_id}
                        className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto]"
                      >
                        <div>
                          <p className="font-medium">
                            {category.category_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {Number(category.transaction_count)} transactions
                          </p>
                        </div>

                        <p className="font-medium sm:text-right">
                          {formatCurrency(amount, dashboardCurrency)}
                        </p>

                        <p className="text-sm text-muted-foreground sm:text-right">
                          {percentOfExpenses === null
                            ? 'N/A'
                            : formatPercent(percentOfExpenses)}
                        </p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  No expenses recorded for this month.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {!accountBalancesError && !balances.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Financial summary</CardTitle>
            <CardDescription>
              Create accounts to start building your financial summary.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/accounts"
              className={buttonVariants({ variant: 'default' })}
            >
              Go to accounts
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {!accountBalancesError && balances.length ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((summary) => (
              <Card key={summary.label}>
                <CardHeader>
                  <CardTitle>{summary.label}</CardTitle>
                  <CardDescription>{summary.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold">
                    {formatCurrency(summary.value, household.base_currency)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Accounts summary</CardTitle>
              <CardDescription>
                Posted and projected balances by account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y rounded-lg border">
                {balances.map((account) => (
                  <div key={account.account_id} className="space-y-3 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-medium">
                            {account.account_name}
                          </h2>
                          <Badge variant="secondary">
                            {formatValue(account.account_type)}
                          </Badge>
                          <Badge variant="outline">
                            {account.account_class}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {account.currency_code}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">
                          Posted balance
                        </p>
                        <p className="mt-1 font-medium">
                          {formatAccountCurrency(
                            account.posted_balance_account_currency,
                            account.currency_code
                          )}
                        </p>
                      </div>

                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">
                          Projected balance
                        </p>
                        <p className="mt-1 font-medium">
                          {formatAccountCurrency(
                            account.projected_balance_account_currency,
                            account.currency_code
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </main>
  )
}
