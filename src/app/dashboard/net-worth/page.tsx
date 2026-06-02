import { redirect } from 'next/navigation'
import Link from 'next/link'
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
import { createClient } from '@/lib/supabase/server'

type NetWorthPageProps = {
  searchParams: Promise<{
    month?: string
  }>
}

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

type NetWorthSummary = {
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  projectedAssets: number
  projectedLiabilities: number
  projectedNetWorth: number
}

type EvolutionPoint = NetWorthSummary & {
  month: string
  monthEndDate: string
  hasError: boolean
}

function currentMonthParam() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}

function parseMonth(month: string | undefined) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return currentMonthParam()
  }

  const parsedDate = new Date(`${month}-01T00:00:00.000Z`)

  if (Number.isNaN(parsedDate.getTime())) {
    return currentMonthParam()
  }

  return month
}

function getMonthEndDate(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)

  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
}

function getPreviousMonths(selectedMonth: string, count: number) {
  const [year, monthNumber] = selectedMonth.split('-').map(Number)
  const months: string[] = []

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(Date.UTC(year, monthNumber - 1 - offset, 1))
    const monthYear = monthDate.getUTCFullYear()
    const month = String(monthDate.getUTCMonth() + 1).padStart(2, '0')

    months.push(`${monthYear}-${month}`)
  }

  return months
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)

  return new Intl.DateTimeFormat('en-CA', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthNumber - 1, 1))
}

function formatCurrency(value: number | string, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(value))
}

function formatValue(value: string) {
  return value.replaceAll('_', ' ')
}

function getDisplayBalance(account: AccountBalance, value: number | string) {
  const numericValue = Number(value)

  return account.account_class === 'liability'
    ? Math.abs(numericValue)
    : numericValue
}

function summarizeBalances(balances: AccountBalance[]): NetWorthSummary {
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
        total + Math.abs(Number(account.posted_balance_base_currency)),
      0
    )
  const projectedAssets = includedBalances
    .filter((account) => account.account_class === 'asset')
    .reduce(
      (total, account) =>
        total + Number(account.projected_balance_base_currency),
      0
    )
  const projectedLiabilities = includedBalances
    .filter((account) => account.account_class === 'liability')
    .reduce(
      (total, account) =>
        total + Math.abs(Number(account.projected_balance_base_currency)),
      0
    )

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    projectedAssets,
    projectedLiabilities,
    projectedNetWorth: projectedAssets - projectedLiabilities,
  }
}

function AccountList({
  accounts,
  currencyCode,
  emptyMessage,
}: {
  accounts: AccountBalance[]
  currencyCode: string
  emptyMessage: string
}) {
  if (!accounts.length) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    )
  }

  return (
    <div className="divide-y rounded-lg border">
      {accounts.map((account) => (
        <div
          key={account.account_id}
          className={`grid gap-3 p-4 sm:grid-cols-[1fr_auto] ${
            account.is_archived ? 'bg-muted/30 text-muted-foreground' : ''
          }`}
        >
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-medium">{account.account_name}</h2>
              <Badge variant="secondary">
                {formatValue(account.account_type)}
              </Badge>
              <Badge variant="outline">{account.account_class}</Badge>
              <Badge
                variant={account.include_in_net_worth ? 'default' : 'outline'}
              >
                {account.include_in_net_worth ? 'Included' : 'Excluded'}
              </Badge>
              {account.is_archived ? (
                <Badge variant="outline">archived</Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {account.currency_code}
            </p>
          </div>

          <div className="space-y-1 sm:text-right">
            <p className="font-medium">
              {formatCurrency(
                getDisplayBalance(
                  account,
                  account.posted_balance_account_currency
                ),
                account.currency_code
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(
                getDisplayBalance(account, account.posted_balance_base_currency),
                currencyCode
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default async function NetWorthPage({
  searchParams,
}: NetWorthPageProps) {
  const params = await searchParams
  const selectedMonth = parseMonth(params.month)
  const selectedMonthEndDate = getMonthEndDate(selectedMonth)
  const evolutionMonths = getPreviousMonths(selectedMonth, 6)
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

  const { data: selectedBalances, error: selectedBalancesError } =
    await supabase.rpc('get_account_balances', {
      p_household_id: household.id,
      p_as_of_date: selectedMonthEndDate,
    })

  const evolutionResults = await Promise.all(
    evolutionMonths.map(async (month) => {
      const { data, error } = await supabase.rpc('get_account_balances', {
        p_household_id: household.id,
        p_as_of_date: getMonthEndDate(month),
      })
      const summary = summarizeBalances((data ?? []) as AccountBalance[])

      return {
        month,
        monthEndDate: getMonthEndDate(month),
        hasError: Boolean(error),
        ...summary,
      }
    })
  )
  const balances = (selectedBalances ?? []) as AccountBalance[]
  const summary = summarizeBalances(balances)
  const includedAssets = balances.filter(
    (account) =>
      account.include_in_net_worth && account.account_class === 'asset'
  )
  const includedLiabilities = balances.filter(
    (account) =>
      account.include_in_net_worth && account.account_class === 'liability'
  )
  const excludedAccounts = balances.filter(
    (account) => !account.include_in_net_worth
  )
  const evolution = evolutionResults as EvolutionPoint[]
  const maxEvolutionMagnitude = Math.max(
    ...evolution.map((point) => Math.abs(point.netWorth)),
    1
  )
  const hasEvolutionError = evolution.some((point) => point.hasError)
  const summaryCards = [
    {
      label: 'Total assets',
      value: summary.totalAssets,
      description: 'Posted included asset balances',
    },
    {
      label: 'Total liabilities',
      value: summary.totalLiabilities,
      description: 'Posted included liability balances',
    },
    {
      label: 'Net worth',
      value: summary.netWorth,
      description: 'Assets minus liabilities',
    },
    {
      label: 'Projected net worth',
      value: summary.projectedNetWorth,
      description: 'Posted plus pending balances',
    },
  ]

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{household.name}</p>
          <h1 className="text-2xl font-semibold tracking-normal">
            Net Worth
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatMonthLabel(selectedMonth)}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <Link
            href="/dashboard/debts"
            className={buttonVariants({ variant: 'outline' })}
          >
            Debts
          </Link>
          <form action="/dashboard/net-worth" className="flex items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="month">Month</Label>
              <Input
                id="month"
                type="month"
                name="month"
                defaultValue={selectedMonth}
              />
            </div>
            <Button type="submit" variant="outline">
              View
            </Button>
          </form>
        </div>
      </div>

      {selectedBalancesError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load net worth balances.
        </div>
      ) : null}

      {hasEvolutionError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load every monthly evolution point.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle>{card.label}</CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold">
                {formatCurrency(card.value, household.base_currency)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly evolution</CardTitle>
          <CardDescription>
            Month-end posted net worth from ledger balances.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y rounded-lg border">
            {evolution.map((point) => {
              const barWidth = Math.round(
                (Math.abs(point.netWorth) / maxEvolutionMagnitude) * 100
              )

              return (
                <div
                  key={point.month}
                  className="grid gap-3 p-4 sm:grid-cols-[10rem_1fr_auto]"
                >
                  <div>
                    <p className="font-medium">{formatMonthLabel(point.month)}</p>
                    <p className="text-sm text-muted-foreground">
                      {point.monthEndDate}
                    </p>
                  </div>

                  <div className="flex min-w-0 items-center">
                    <div className="h-2 w-full overflow-hidden rounded-lg bg-muted">
                      <div
                        className="h-full rounded-lg bg-primary"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1 sm:text-right">
                    <p className="font-medium">
                      {formatCurrency(point.netWorth, household.base_currency)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(point.totalAssets, household.base_currency)}
                      {' assets / '}
                      {formatCurrency(
                        point.totalLiabilities,
                        household.base_currency
                      )}
                      {' liabilities'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assets</CardTitle>
          <CardDescription>
            Included asset accounts at selected month end.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccountList
            accounts={includedAssets}
            currencyCode={household.base_currency}
            emptyMessage="No included asset accounts."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liabilities</CardTitle>
          <CardDescription>
            Included liability accounts shown as positive debt amounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccountList
            accounts={includedLiabilities}
            currencyCode={household.base_currency}
            emptyMessage="No included liability accounts."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Excluded accounts</CardTitle>
          <CardDescription>
            Accounts outside official net worth totals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccountList
            accounts={excludedAccounts}
            currencyCode={household.base_currency}
            emptyMessage="No accounts are excluded from net worth."
          />
        </CardContent>
      </Card>
    </main>
  )
}
