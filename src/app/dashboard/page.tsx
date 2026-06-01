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

export default async function DashboardPage() {
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

  const balances = (accountBalances ?? []) as AccountBalance[]
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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <p className="text-sm text-muted-foreground">{household.name}</p>
        <h1 className="text-2xl font-semibold tracking-normal">Dashboard</h1>
      </div>

      {accountBalancesError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load financial summary.
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
