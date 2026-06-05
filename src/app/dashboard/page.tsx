import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { MetricCard } from '@/components/metric-card'
import { AccountCardDetails } from './accounts/account-card-details'
import { GlobalAddTransactionButton } from '@/components/global-add-transaction-button'

type AccountBalance = {
  account_id: string
  account_name: string
  account_type: string
  account_class: string
  currency_code: string
  include_in_net_worth: boolean
  is_archived: boolean
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

type CategoryLookup = {
  id: string
  name: string
  parent_category_id: string | null
  is_archived: boolean
}

type AccountMeta = {
  id: string
  institution_name: string | null
  last_four: string | null
}

function currentMonthParam() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
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

function formatTransactionCount(count: number, descriptor = 'transaction') {
  return `${count} ${descriptor}${count === 1 ? '' : 's'}`
}

function getDisplayedLiabilityBalance(value: number | string) {
  const numericValue = Number(value)

  return Math.max(0, -numericValue)
}

function liabilityDisplay(value: number | string) {
  return Math.max(0, -Number(value))
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
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

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const monthDate = new Date(year, monthNumber - 1, 1)

  return new Intl.DateTimeFormat('en-CA', {
    month: 'long',
    year: 'numeric',
  }).format(monthDate)
}

function getMonthEndDate(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)

  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
}

function getCategoryPath(
  category: {
    category_id: string
    category_name: string
    parent_category_id: string | null
  },
  categoriesById: Map<string, CategoryLookup>
) {
  const categoryRow = categoriesById.get(category.category_id)
  const parentId = categoryRow?.parent_category_id ?? category.parent_category_id
  const parentName = parentId ? categoriesById.get(parentId)?.name : null
  const categoryName = categoryRow?.name ?? category.category_name

  return {
    name: parentName ? `${parentName} / ${categoryName}` : categoryName,
    isArchived: categoryRow?.is_archived ?? false,
  }
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = await searchParams
  const selectedMonth = parseDashboardMonth(params.month)
  const selectedMonthDate = `${selectedMonth}-01`
  const selectedMonthEndDate = getMonthEndDate(selectedMonth)
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
      p_as_of_date: selectedMonthEndDate,
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

  const { data: categoryLookupRows, error: categoryLookupError } =
    await supabase
      .from('categories')
      .select('id, name, parent_category_id, is_archived')
      .eq('household_id', household.id)
      .is('deleted_at', null)

  const { data: accountMetaRows } = await supabase
    .from('accounts')
    .select('id, institution_name, last_four')
    .eq('household_id', household.id)
    .is('deleted_at', null)

  const balances = (accountBalances ?? []) as AccountBalance[]
  const monthlySummary =
    ((monthlySummaryRows ?? [])[0] as MonthlyDashboardSummary | undefined) ??
    null
  const expenseCategories = (expenseCategoryRows ??
    []) as MonthlyExpenseCategory[]
  const categoriesById = new Map(
    ((categoryLookupRows ?? []) as CategoryLookup[]).map((category) => [
      category.id,
      category,
    ])
  )
  const accountMetaById = new Map(
    ((accountMetaRows ?? []) as AccountMeta[]).map((a) => [a.id, a])
  )
  const dashboardCurrency =
    monthlySummary?.base_currency ?? household.base_currency
  const monthlyExpenses = Number(monthlySummary?.monthly_expenses ?? 0)
  const hasMonthlyActivity =
    Number(monthlySummary?.income_transaction_count ?? 0) > 0 ||
    Number(monthlySummary?.expense_transaction_count ?? 0) > 0
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
  const totalLiabilities = includedBalances
    .filter((account) => account.account_class === 'liability')
    .reduce(
      (total, account) =>
        total +
        getDisplayedLiabilityBalance(account.posted_balance_base_currency),
      0
    )
  const signedLiabilities = includedBalances
    .filter((account) => account.account_class === 'liability')
    .reduce(
      (total, account) =>
        total + Number(account.posted_balance_base_currency),
      0
    )
  const projectedAssets = includedBalances
    .filter((account) => account.account_class === 'asset')
    .reduce(
      (total, account) =>
        total + Number(account.projected_balance_base_currency),
      0
    )
  const signedProjectedLiabilities = includedBalances
    .filter((account) => account.account_class === 'liability')
    .reduce(
      (total, account) =>
        total + Number(account.projected_balance_base_currency),
      0
    )
  const netWorth = totalAssets + signedLiabilities
  const projectedNetWorth = projectedAssets + signedProjectedLiabilities
  const incomeTransactionCount = Number(
    monthlySummary?.income_transaction_count ?? 0
  )
  const expenseTransactionCount = Number(
    monthlySummary?.expense_transaction_count ?? 0
  )

  const summaryCards = [
    {
      label: 'Total assets',
      value: totalAssets,
      description: 'Posted asset balances at month end',
    },
    {
      label: 'Total liabilities',
      value: totalLiabilities,
      description: 'Posted liability balances at month end',
    },
    {
      label: 'Net worth',
      value: netWorth,
      description: 'Posted included balances at month end',
    },
    {
      label: 'Projected net worth',
      value: projectedNetWorth,
      description: 'Posted plus pending at month end',
    },
  ]
  const monthlyCards = [
    {
      label: 'Monthly income',
      value: monthlySummary
        ? formatCurrency(Number(monthlySummary.monthly_income), dashboardCurrency)
        : formatCurrency(0, dashboardCurrency),
      description: formatTransactionCount(
        incomeTransactionCount,
        'posted income transaction'
      ),
    },
    {
      label: 'Monthly expenses',
      value: monthlySummary
        ? formatCurrency(
            Number(monthlySummary.monthly_expenses),
            dashboardCurrency
          )
        : formatCurrency(0, dashboardCurrency),
      description: formatTransactionCount(
        expenseTransactionCount,
        'posted expense transaction'
      ),
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
  const largestExpenseCategory = expenseCategories.reduce(
    (largest, category) =>
      Number(category.amount_base_currency) >
      Number(largest?.amount_base_currency ?? 0)
        ? category
        : largest,
    null as MonthlyExpenseCategory | null
  )
  const largestExpenseAmount = Number(
    largestExpenseCategory?.amount_base_currency ?? 0
  )

  const activeBalances = balances.filter((a) => !a.is_archived)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{household.name}</p>
          <h1 className="text-2xl font-semibold tracking-normal">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatMonthLabel(selectedMonth)}
          </p>
        </div>

        <form action="/dashboard" className="flex items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="month" className="text-xs text-muted-foreground">Month</Label>
            <Input
              id="month"
              type="month"
              name="month"
              defaultValue={selectedMonth}
              className="h-8 text-sm"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">View</Button>
        </form>
      </div>

      {/* ── Errors ─────────────────────────────────────────────────────── */}
      {(accountBalancesError || monthlySummaryError || expenseCategoriesError || categoryLookupError) ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load some dashboard data. Try refreshing the page.
        </div>
      ) : null}

      {/* ── Financial position ─────────────────────────────────────────── */}
      {!accountBalancesError && balances.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((summary) => (
            <MetricCard
              key={summary.label}
              label={summary.label}
              value={formatCurrency(summary.value, household.base_currency)}
              description={summary.description}
            />
          ))}
        </div>
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
            <Link href="/dashboard/accounts" className={buttonVariants({ variant: 'default' })}>
              Go to accounts
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Monthly activity ───────────────────────────────────────────── */}
      {!monthlySummaryError && !expenseCategoriesError ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {monthlyCards.map((summary) => (
              <MetricCard
                key={summary.label}
                label={summary.label}
                value={summary.value}
                description={summary.description}
              />
            ))}
          </div>

          {!hasMonthlyActivity ? (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No posted income or expense activity for {formatMonthLabel(selectedMonth)}.
            </p>
          ) : null}

          {/* ── Expenses by category ─────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Expenses by category</CardTitle>
              <CardDescription>
                Posted expense allocations for {formatMonthLabel(selectedMonth)}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {expenseCategories.length ? (
                <div className="divide-y rounded-lg border">
                  {expenseCategories.map((category) => {
                    const amount = Number(category.amount_base_currency)
                    const percentOfExpenses =
                      monthlyExpenses > 0 ? amount / monthlyExpenses : null
                    const barPercent =
                      largestExpenseAmount > 0
                        ? Math.round((amount / largestExpenseAmount) * 100)
                        : 0
                    const categoryPath = getCategoryPath(category, categoriesById)

                    return (
                      <div
                        key={category.category_id}
                        className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]"
                      >
                        <div className="min-w-0 space-y-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{categoryPath.name}</p>
                              {categoryPath.isArchived ? (
                                <Badge variant="outline">Archived</Badge>
                              ) : null}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {formatTransactionCount(Number(category.transaction_count))}
                            </p>
                          </div>
                          <div className="h-2 overflow-hidden rounded-lg bg-muted">
                            <div
                              className="h-full rounded-lg bg-primary"
                              style={{ width: `${barPercent}%` }}
                            />
                          </div>
                        </div>
                        <div className="space-y-1 sm:text-right">
                          <p className="font-medium">
                            {formatCurrency(amount, dashboardCurrency)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {percentOfExpenses === null ? 'N/A' : formatPercent(percentOfExpenses)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  No expenses recorded for {formatMonthLabel(selectedMonth)}.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* ── Accounts ───────────────────────────────────────────────────── */}
      {!accountBalancesError && activeBalances.length ? (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Accounts</CardTitle>
                <CardDescription>
                  Active account balances at month end.
                </CardDescription>
              </div>
              <Link
                href="/dashboard/accounts"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Manage accounts
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-lg border">
              {activeBalances.map((account) => {
                const meta = accountMetaById.get(account.account_id)
                const isLiability = account.account_class === 'liability'
                return (
                  <div key={account.account_id} className="p-3">
                    <AccountCardDetails
                      accountId={account.account_id}
                      summaryLeft={
                        <>
                          <span className="font-medium text-sm">{account.account_name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {formatLabel(account.account_type)}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {account.currency_code}
                          </Badge>
                        </>
                      }
                      balanceLabel={formatCurrency(
                        isLiability
                          ? liabilityDisplay(account.posted_balance_account_currency)
                          : Number(account.posted_balance_account_currency),
                        account.currency_code
                      )}
                      balanceSubLabel={isLiability ? 'balance owed' : 'posted balance'}
                      postedLabel={formatCurrency(
                        isLiability
                          ? liabilityDisplay(account.posted_balance_account_currency)
                          : Number(account.posted_balance_account_currency),
                        account.currency_code
                      )}
                      pendingLabel={formatCurrency(
                        isLiability
                          ? liabilityDisplay(account.pending_balance_account_currency)
                          : Number(account.pending_balance_account_currency),
                        account.currency_code
                      )}
                      projectedLabel={formatCurrency(
                        isLiability
                          ? liabilityDisplay(account.projected_balance_account_currency)
                          : Number(account.projected_balance_account_currency),
                        account.currency_code
                      )}
                      balanceType={isLiability ? 'owed' : 'posted'}
                      institutionName={meta?.institution_name ?? null}
                      lastFour={meta?.last_four ?? null}
                      includeInNetWorth={account.include_in_net_worth}
                    >
                      <GlobalAddTransactionButton
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                        defaultAccountId={account.account_id}
                      >
                        Add transaction
                      </GlobalAddTransactionButton>
                    </AccountCardDetails>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

    </main>
  )
}
