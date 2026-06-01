import { redirect } from 'next/navigation'
import { createAccountAction } from './actions'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type AccountsPageProps = {
  searchParams: Promise<{
    created?: string
    error?: string
  }>
}

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

type Currency = {
  code: string
  name: string
  symbol: string | null
}

const accountTypes = [
  { value: 'cash', label: 'Cash' },
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'debt', label: 'Debt' },
  { value: 'investment', label: 'Investment' },
  { value: 'other', label: 'Other' },
]

function formatAccountType(accountType: string) {
  return accountType.replaceAll('_', ' ')
}

function formatCurrency(value: number | string, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(value))
}

export default async function AccountsPage({ searchParams }: AccountsPageProps) {
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
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()

  if (householdError || !household) {
    redirect('/onboarding')
  }

  const { data: currencies, error: currenciesError } = await supabase
    .from('currencies')
    .select('code, name, symbol')
    .eq('is_active', true)
    .order('code', { ascending: true })

  if (currenciesError) {
    throw new Error('Could not load active currencies.')
  }

  const { data: accountBalances, error: accountBalancesError } =
    await supabase.rpc('get_account_balances', {
      p_household_id: household.id,
    })

  const activeCurrencies = (currencies ?? []) as Currency[]
  const defaultCurrency =
    activeCurrencies.find((currency) => currency.code === household.base_currency)
      ?.code ??
    activeCurrencies[0]?.code ??
    'CAD'

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <p className="text-sm text-muted-foreground">{household.name}</p>
        <h1 className="text-2xl font-semibold tracking-normal">Accounts</h1>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {created ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Account created.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Active accounts</CardTitle>
            <CardDescription>
              Accounts connected to your active household.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {accountBalancesError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                Could not load account balances.
              </p>
            ) : accountBalances?.length ? (
              <div className="divide-y rounded-lg border">
                {(accountBalances as AccountBalance[]).map((account) => (
                  <div
                    key={account.account_id}
                    className="space-y-4 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-medium">
                            {account.account_name}
                          </h2>
                          <Badge variant="secondary">
                            {formatAccountType(account.account_type)}
                          </Badge>
                          <Badge variant="outline">
                            {account.account_class}
                          </Badge>
                        </div>

                        <p className="text-sm text-muted-foreground">
                          {account.currency_code}
                        </p>
                      </div>

                      <Badge
                        variant={
                          account.include_in_net_worth ? 'default' : 'outline'
                        }
                      >
                        {account.include_in_net_worth
                          ? 'Net worth'
                          : 'Excluded'}
                      </Badge>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">
                          Posted balance
                        </p>
                        <p className="mt-1 font-medium">
                          {formatCurrency(
                            account.posted_balance_account_currency,
                            account.currency_code
                          )}
                        </p>
                      </div>

                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">
                          Pending
                        </p>
                        <p className="mt-1 font-medium">
                          {formatCurrency(
                            account.pending_balance_account_currency,
                            account.currency_code
                          )}
                        </p>
                      </div>

                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">
                          Projected
                        </p>
                        <p className="mt-1 font-medium">
                          {formatCurrency(
                            account.projected_balance_account_currency,
                            account.currency_code
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                No active accounts yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create account</CardTitle>
            <CardDescription>Add a basic household account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createAccountAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="account_type">Type</Label>
                <Select name="account_type" defaultValue="checking">
                  <SelectTrigger id="account_type" className="w-full">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountTypes.map((accountType) => (
                      <SelectItem
                        key={accountType.value}
                        value={accountType.value}
                      >
                        {accountType.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency_code">Currency</Label>
                <Select name="currency_code" defaultValue={defaultCurrency}>
                  <SelectTrigger id="currency_code" className="w-full">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCurrencies.map((currency) => (
                      <SelectItem key={currency.code} value={currency.code}>
                        {currency.code} - {currency.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="institution_name">Institution</Label>
                <Input id="institution_name" name="institution_name" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="last_four">Last four</Label>
                <Input
                  id="last_four"
                  name="last_four"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="[0-9]{1,4}"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" />
              </div>

              <Label className="items-start gap-3 rounded-lg border p-3">
                <input
                  type="checkbox"
                  name="include_in_net_worth"
                  defaultChecked
                  className="mt-0.5 size-4"
                />
                <span className="space-y-1">
                  <span className="block">Include in net worth</span>
                  <span className="block text-sm font-normal text-muted-foreground">
                    Counts this account in household totals later.
                  </span>
                </span>
              </Label>

              <Button type="submit" className="w-full">
                Create account
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
