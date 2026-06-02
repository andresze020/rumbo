import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  createDebtAction,
  createDebtPaymentAction,
  updateDebtAction,
} from './actions'
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
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/empty-state'
import { createClient } from '@/lib/supabase/server'

type DebtsPageProps = {
  searchParams: Promise<{
    created?: string
    updated?: string
    paid?: string
    error?: string
  }>
}

type Currency = {
  code: string
  name: string
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
  posted_balance_base_currency: number | string
}

type Account = {
  id: string
  name: string
  account_type: string
  account_class: string
  currency_code: string
  institution_name: string | null
  is_archived: boolean
  include_in_net_worth: boolean
}

type Debt = {
  id: string
  account_id: string
  name: string
  lender_name: string | null
  original_principal: number | string | null
  interest_rate: number | string | null
  interest_rate_period: string | null
  minimum_payment: number | string | null
  payment_due_day: number | string | null
  status: string
  notes: string | null
  created_at: string
}

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function formatCurrency(value: number | string, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(value))
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value)
}

function formatValue(value: string) {
  return value.replaceAll('_', ' ')
}

function nullableNumber(value: number | string | null) {
  if (value === null) {
    return ''
  }

  return String(value)
}

function getDebtBalance(
  debt: Debt,
  balancesByAccountId: Map<string, AccountBalance>
) {
  const balance = balancesByAccountId.get(debt.account_id)

  return Math.abs(Number(balance?.posted_balance_account_currency ?? 0))
}

function getBaseDebtBalance(
  debt: Debt,
  balancesByAccountId: Map<string, AccountBalance>
) {
  const balance = balancesByAccountId.get(debt.account_id)

  return Math.abs(Number(balance?.posted_balance_base_currency ?? 0))
}

function getPaydownPercent(debt: Debt, balance: number) {
  const originalPrincipal = Number(debt.original_principal ?? 0)

  if (originalPrincipal <= 0) {
    return null
  }

  return Math.min(Math.max((originalPrincipal - balance) / originalPrincipal, 0), 1)
}

function formatDueDay(value: number | string | null) {
  return value ? `Day ${value}` : 'Not set'
}

export default async function DebtsPage({ searchParams }: DebtsPageProps) {
  const params = await searchParams
  const created = params.created === '1'
  const updated = params.updated === '1'
  const paid = params.paid === '1'
  const errorMessage = typeof params.error === 'string' ? params.error : null
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
    .select('code, name')
    .eq('is_active', true)
    .order('code', { ascending: true })

  const { data: debts, error: debtsError } = await supabase
    .from('debts')
    .select(
      'id, account_id, name, lender_name, original_principal, interest_rate, interest_rate_period, minimum_payment, payment_due_day, status, notes, created_at'
    )
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .order('status', { ascending: true })
    .order('created_at', { ascending: true })

  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select(
      'id, name, account_type, account_class, currency_code, institution_name, is_archived, include_in_net_worth'
    )
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  const { data: balances, error: balancesError } = await supabase.rpc(
    'get_account_balances',
    {
      p_household_id: household.id,
      p_as_of_date: todayIsoDate(),
    }
  )

  const currencyOptions = (currencies ?? []) as Currency[]
  const debtRows = (debts ?? []) as Debt[]
  const accountRows = (accounts ?? []) as Account[]
  const accountBalances = (balances ?? []) as AccountBalance[]
  const accountsById = new Map(accountRows.map((account) => [account.id, account]))
  const balancesByAccountId = new Map(
    accountBalances.map((balance) => [balance.account_id, balance])
  )
  const debtAccountIds = new Set(debtRows.map((debt) => debt.account_id))
  const linkableLiabilityAccounts = accountRows.filter(
    (account) =>
      account.account_class === 'liability' &&
      !account.is_archived &&
      !debtAccountIds.has(account.id)
  )
  const activeAssetAccounts = accountRows.filter(
    (account) => account.account_class === 'asset' && !account.is_archived
  )
  const activeDebts = debtRows.filter((debt) => debt.status === 'active')
  const inactiveDebts = debtRows.filter((debt) => debt.status === 'inactive')
  const totalDebtBase = activeDebts.reduce(
    (total, debt) => total + getBaseDebtBalance(debt, balancesByAccountId),
    0
  )
  const totalMinimumPayment = activeDebts.reduce(
    (total, debt) => total + Number(debt.minimum_payment ?? 0),
    0
  )
  const nextDueDebt = activeDebts
    .filter((debt) => debt.payment_due_day)
    .sort(
      (a, b) =>
        Number(a.payment_due_day ?? 0) - Number(b.payment_due_day ?? 0)
    )[0]
  const defaultCurrency =
    currencyOptions.find((currency) => currency.code === household.base_currency)
      ?.code ??
    currencyOptions[0]?.code ??
    household.base_currency
  const statusCards = [
    {
      label: 'Active debts',
      value: String(activeDebts.length),
      description: `${inactiveDebts.length} inactive`,
    },
    {
      label: 'Outstanding debt',
      value: formatCurrency(totalDebtBase, household.base_currency),
      description: 'Posted liability balances',
    },
    {
      label: 'Minimum payments',
      value: formatCurrency(totalMinimumPayment, household.base_currency),
      description: 'Monthly metadata total',
    },
    {
      label: 'Next due day',
      value: nextDueDebt ? formatDueDay(nextDueDebt.payment_due_day) : 'N/A',
      description: nextDueDebt?.name ?? 'No due days set',
    },
  ]
  const hasLoadError =
    currenciesError || debtsError || accountsError || balancesError

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{household.name}</p>
          <h1 className="text-2xl font-semibold tracking-normal">Debts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Liability accounts, debt metadata, and principal payments.
          </p>
        </div>

        <Link
          href="/dashboard/net-worth"
          className={buttonVariants({ variant: 'outline' })}
        >
          Net worth
        </Link>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {created ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Debt created.
        </div>
      ) : null}

      {updated ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Debt updated.
        </div>
      ) : null}

      {paid ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Debt payment registered.
        </div>
      ) : null}

      {hasLoadError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load debt data.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statusCards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle>{card.label}</CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create debt</CardTitle>
          <CardDescription>
            Add debt metadata and create or link a liability account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createDebtAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Debt name</Label>
                <Input id="name" name="name" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lender_name">Lender</Label>
                <Input id="lender_name" name="lender_name" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="existing_account_id">
                  Existing liability account
                </Label>
                <select
                  id="existing_account_id"
                  name="existing_account_id"
                  className={selectClassName}
                  defaultValue=""
                >
                  <option value="">Create new account</option>
                  {linkableLiabilityAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {formatValue(account.account_type)} ·{' '}
                      {account.currency_code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="account_type">New account type</Label>
                <select
                  id="account_type"
                  name="account_type"
                  className={selectClassName}
                  defaultValue="debt"
                >
                  <option value="debt">Debt</option>
                  <option value="credit_card">Credit card</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency_code">Currency</Label>
                <select
                  id="currency_code"
                  name="currency_code"
                  className={selectClassName}
                  defaultValue={defaultCurrency}
                >
                  {currencyOptions.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} · {currency.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="opening_balance_amount">Current balance</Label>
                <Input
                  id="opening_balance_amount"
                  name="opening_balance_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="opening_balance_date">Balance date</Label>
                <Input
                  id="opening_balance_date"
                  name="opening_balance_date"
                  type="date"
                  defaultValue={todayIsoDate()}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="original_principal">Original principal</Label>
                <Input
                  id="original_principal"
                  name="original_principal"
                  type="number"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="interest_rate">Interest rate</Label>
                <Input
                  id="interest_rate"
                  name="interest_rate"
                  type="number"
                  min="0"
                  step="0.0001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="interest_rate_period">Interest period</Label>
                <select
                  id="interest_rate_period"
                  name="interest_rate_period"
                  className={selectClassName}
                  defaultValue=""
                >
                  <option value="">Not set</option>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="minimum_payment">Minimum payment</Label>
                <Input
                  id="minimum_payment"
                  name="minimum_payment"
                  type="number"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment_due_day">Due day</Label>
                <Input
                  id="payment_due_day"
                  name="payment_due_day"
                  type="number"
                  min="1"
                  max="31"
                  step="1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" />
            </div>

            <Button type="submit">Create debt</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Debt list</CardTitle>
          <CardDescription>
            Current balances come from posted ledger entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {debtRows.length ? (
            <div className="divide-y rounded-lg border">
              {debtRows.map((debt) => {
                const account = accountsById.get(debt.account_id)
                const currentBalance = getDebtBalance(debt, balancesByAccountId)
                const paydownPercent = getPaydownPercent(debt, currentBalance)
                const sourceAccounts = account
                  ? activeAssetAccounts.filter(
                      (assetAccount) =>
                        assetAccount.currency_code === account.currency_code
                    )
                  : []

                return (
                  <div
                    key={debt.id}
                    className={`space-y-4 p-4 ${
                      debt.status === 'inactive'
                        ? 'bg-muted/30 text-muted-foreground'
                        : ''
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-medium">{debt.name}</h2>
                          <Badge
                            variant={
                              debt.status === 'active' ? 'default' : 'outline'
                            }
                          >
                            {debt.status}
                          </Badge>
                          {account?.include_in_net_worth ? (
                            <Badge variant="secondary">Net worth</Badge>
                          ) : (
                            <Badge variant="outline">Excluded</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {account?.name ?? 'Missing account'} ·{' '}
                          {account?.currency_code ?? household.base_currency}
                        </p>
                      </div>

                      <div className="space-y-1 sm:text-right">
                        <p className="text-xl font-semibold">
                          {formatCurrency(
                            currentBalance,
                            account?.currency_code ?? household.base_currency
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          outstanding
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">
                          Original principal
                        </p>
                        <p className="mt-1 font-medium">
                          {debt.original_principal
                            ? formatCurrency(
                                debt.original_principal,
                                account?.currency_code ??
                                  household.base_currency
                              )
                            : 'Not set'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">
                          Interest
                        </p>
                        <p className="mt-1 font-medium">
                          {debt.interest_rate
                            ? `${debt.interest_rate}% ${debt.interest_rate_period ?? ''}`.trim()
                            : 'Not set'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">
                          Minimum payment
                        </p>
                        <p className="mt-1 font-medium">
                          {debt.minimum_payment
                            ? formatCurrency(
                                debt.minimum_payment,
                                account?.currency_code ??
                                  household.base_currency
                              )
                            : 'Not set'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">Due day</p>
                        <p className="mt-1 font-medium">
                          {formatDueDay(debt.payment_due_day)}
                        </p>
                      </div>
                    </div>

                    {paydownPercent !== null ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Principal paid down
                          </span>
                          <span className="font-medium">
                            {formatPercent(paydownPercent)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-lg bg-muted">
                          <div
                            className="h-full rounded-lg bg-primary"
                            style={{
                              width: `${Math.round(paydownPercent * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {debt.lender_name || debt.notes ? (
                      <div className="rounded-lg bg-muted/40 p-3 text-sm">
                        {debt.lender_name ? (
                          <p>
                            <span className="text-muted-foreground">
                              Lender:{' '}
                            </span>
                            {debt.lender_name}
                          </p>
                        ) : null}
                        {debt.notes ? <p className="mt-1">{debt.notes}</p> : null}
                      </div>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-2">
                      <form
                        action={updateDebtAction}
                        className="space-y-3 rounded-lg border p-3"
                      >
                        <input type="hidden" name="debt_id" value={debt.id} />

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`name_${debt.id}`}>Name</Label>
                            <Input
                              id={`name_${debt.id}`}
                              name="name"
                              defaultValue={debt.name}
                              required
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`status_${debt.id}`}>Status</Label>
                            <select
                              id={`status_${debt.id}`}
                              name="status"
                              defaultValue={debt.status}
                              className={selectClassName}
                            >
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`lender_name_${debt.id}`}>
                              Lender
                            </Label>
                            <Input
                              id={`lender_name_${debt.id}`}
                              name="lender_name"
                              defaultValue={debt.lender_name ?? ''}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`original_principal_${debt.id}`}>
                              Original principal
                            </Label>
                            <Input
                              id={`original_principal_${debt.id}`}
                              name="original_principal"
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={nullableNumber(
                                debt.original_principal
                              )}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`interest_rate_${debt.id}`}>
                              Interest rate
                            </Label>
                            <Input
                              id={`interest_rate_${debt.id}`}
                              name="interest_rate"
                              type="number"
                              min="0"
                              step="0.0001"
                              defaultValue={nullableNumber(debt.interest_rate)}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`interest_rate_period_${debt.id}`}>
                              Interest period
                            </Label>
                            <select
                              id={`interest_rate_period_${debt.id}`}
                              name="interest_rate_period"
                              defaultValue={debt.interest_rate_period ?? ''}
                              className={selectClassName}
                            >
                              <option value="">Not set</option>
                              <option value="monthly">Monthly</option>
                              <option value="annual">Annual</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`minimum_payment_${debt.id}`}>
                              Minimum payment
                            </Label>
                            <Input
                              id={`minimum_payment_${debt.id}`}
                              name="minimum_payment"
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={nullableNumber(
                                debt.minimum_payment
                              )}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`payment_due_day_${debt.id}`}>
                              Due day
                            </Label>
                            <Input
                              id={`payment_due_day_${debt.id}`}
                              name="payment_due_day"
                              type="number"
                              min="1"
                              max="31"
                              step="1"
                              defaultValue={nullableNumber(debt.payment_due_day)}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`notes_${debt.id}`}>Notes</Label>
                          <Textarea
                            id={`notes_${debt.id}`}
                            name="notes"
                            defaultValue={debt.notes ?? ''}
                          />
                        </div>

                        <Button type="submit" variant="outline">
                          Save debt
                        </Button>
                      </form>

                      {debt.status === 'active' ? (
                        <form
                          action={createDebtPaymentAction}
                          className="space-y-3 rounded-lg border p-3"
                        >
                          <input type="hidden" name="debt_id" value={debt.id} />

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor={`source_account_id_${debt.id}`}>
                                Source account
                              </Label>
                              <select
                                id={`source_account_id_${debt.id}`}
                                name="source_account_id"
                                className={selectClassName}
                                required
                              >
                                <option value="">Select account</option>
                                {sourceAccounts.map((sourceAccount) => (
                                  <option
                                    key={sourceAccount.id}
                                    value={sourceAccount.id}
                                  >
                                    {sourceAccount.name} ·{' '}
                                    {sourceAccount.currency_code}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`payment_amount_${debt.id}`}>
                                Payment amount
                              </Label>
                              <Input
                                id={`payment_amount_${debt.id}`}
                                name="payment_amount"
                                type="number"
                                min="0.01"
                                step="0.01"
                                required
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`payment_date_${debt.id}`}>
                                Payment date
                              </Label>
                              <Input
                                id={`payment_date_${debt.id}`}
                                name="payment_date"
                                type="date"
                                defaultValue={todayIsoDate()}
                                required
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`payment_status_${debt.id}`}>
                                Status
                              </Label>
                              <select
                                id={`payment_status_${debt.id}`}
                                name="status"
                                defaultValue="posted"
                                className={selectClassName}
                              >
                                <option value="posted">Posted</option>
                                <option value="pending">Pending</option>
                              </select>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`payment_description_${debt.id}`}>
                              Description
                            </Label>
                            <Input
                              id={`payment_description_${debt.id}`}
                              name="description"
                              defaultValue={`Debt payment: ${debt.name}`}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`payment_notes_${debt.id}`}>
                              Notes
                            </Label>
                            <Textarea
                              id={`payment_notes_${debt.id}`}
                              name="notes"
                            />
                          </div>

                          <Button type="submit">Register payment</Button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState
              title="No debts yet"
              description="Create or link a liability account to track current balances, minimum payments, due days, and debt payments."
            />
          )}
        </CardContent>
      </Card>
    </main>
  )
}
