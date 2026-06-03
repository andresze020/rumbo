import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  createDebtAction,
  createDebtPaymentAction,
  updateDebtAction,
} from './actions'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
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
import { MetricCard } from '@/components/metric-card'
import { StatusBadge } from '@/components/status-badge'
import { SubmitButton } from '@/components/submit-button'
import { createClient } from '@/lib/supabase/server'

type DebtsPageProps = {
  searchParams: Promise<{
    created?: string
    updated?: string
    paid?: string
    error?: string
    mode?: string
    edit?: string
    pay?: string
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

function debtsPath({
  mode,
  edit,
  pay,
}: {
  mode?: 'create'
  edit?: string
  pay?: string
} = {}) {
  const params = new URLSearchParams()
  if (mode) params.set('mode', mode)
  if (edit) params.set('edit', edit)
  if (pay) params.set('pay', pay)
  const qs = params.toString()
  return `/dashboard/debts${qs ? `?${qs}` : ''}`
}

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

  return Math.max(0, -Number(balance?.posted_balance_account_currency ?? 0))
}

function getBaseDebtBalance(
  debt: Debt,
  balancesByAccountId: Map<string, AccountBalance>
) {
  const balance = balancesByAccountId.get(debt.account_id)

  return Math.max(0, -Number(balance?.posted_balance_base_currency ?? 0))
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
  const isCreating = params.mode === 'create'
  const editDebtId = typeof params.edit === 'string' ? params.edit : null
  const payDebtId = typeof params.pay === 'string' ? params.pay : null
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

  const selectedEditDebt = editDebtId
    ? (debtRows.find((d) => d.id === editDebtId) ?? null)
    : null
  const selectedPayDebt = payDebtId
    ? (debtRows.find((d) => d.id === payDebtId) ?? null)
    : null
  const selectedPayAccount = selectedPayDebt
    ? accountsById.get(selectedPayDebt.account_id)
    : null
  const selectedPayBalance = selectedPayDebt
    ? getDebtBalance(selectedPayDebt, balancesByAccountId)
    : 0
  const selectedPaySourceAccounts = selectedPayAccount
    ? activeAssetAccounts.filter(
        (a) => a.currency_code === selectedPayAccount.currency_code
      )
    : []

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

        <div className="flex flex-wrap gap-2">
          <Link
            href={debtsPath({ mode: 'create' })}
            className={buttonVariants()}
          >
            Create debt
          </Link>
          <Link
            href="/dashboard/net-worth"
            className={buttonVariants({ variant: 'outline' })}
          >
            Net worth
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
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            description={card.description}
          />
        ))}
      </div>

      {isCreating ? (
        <Card>
          <CardHeader>
            <CardTitle>Create debt</CardTitle>
            <CardDescription>
              Add a debt record and create or link a liability account.
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
                  <Label htmlFor="opening_balance_amount">
                    Current outstanding balance
                  </Label>
                  <Input
                    id="opening_balance_amount"
                    name="opening_balance_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    The amount you currently owe. This creates the opening
                    liability balance.
                  </p>
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
                  <p className="text-xs text-muted-foreground">
                    Optional. The original amount borrowed, used for reference
                    and progress tracking.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="interest_rate">Interest rate (%)</Label>
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

              <div className="flex flex-wrap gap-2">
                <SubmitButton type="submit" pendingText="Creating debt">
                  Create debt
                </SubmitButton>
                <Link
                  href={debtsPath()}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  Cancel
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {selectedEditDebt ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit debt</CardTitle>
            <CardDescription>
              Update metadata for {selectedEditDebt.name}. The current balance
              comes from ledger entries and cannot be edited here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateDebtAction} className="space-y-4">
              <input type="hidden" name="debt_id" value={selectedEditDebt.id} />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit_name">Name</Label>
                  <Input
                    id="edit_name"
                    name="name"
                    defaultValue={selectedEditDebt.name}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_status">Status</Label>
                  <select
                    id="edit_status"
                    name="status"
                    defaultValue={selectedEditDebt.status}
                    className={selectClassName}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_lender_name">Lender</Label>
                  <Input
                    id="edit_lender_name"
                    name="lender_name"
                    defaultValue={selectedEditDebt.lender_name ?? ''}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_original_principal">
                    Original principal
                  </Label>
                  <Input
                    id="edit_original_principal"
                    name="original_principal"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={nullableNumber(
                      selectedEditDebt.original_principal
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional. The original amount borrowed, for reference and
                    progress tracking.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_interest_rate">Interest rate (%)</Label>
                  <Input
                    id="edit_interest_rate"
                    name="interest_rate"
                    type="number"
                    min="0"
                    step="0.0001"
                    defaultValue={nullableNumber(selectedEditDebt.interest_rate)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_interest_rate_period">
                    Interest period
                  </Label>
                  <select
                    id="edit_interest_rate_period"
                    name="interest_rate_period"
                    defaultValue={selectedEditDebt.interest_rate_period ?? ''}
                    className={selectClassName}
                  >
                    <option value="">Not set</option>
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_minimum_payment">Minimum payment</Label>
                  <Input
                    id="edit_minimum_payment"
                    name="minimum_payment"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={nullableNumber(
                      selectedEditDebt.minimum_payment
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_payment_due_day">Due day</Label>
                  <Input
                    id="edit_payment_due_day"
                    name="payment_due_day"
                    type="number"
                    min="1"
                    max="31"
                    step="1"
                    defaultValue={nullableNumber(selectedEditDebt.payment_due_day)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_notes">Notes</Label>
                <Textarea
                  id="edit_notes"
                  name="notes"
                  defaultValue={selectedEditDebt.notes ?? ''}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <SubmitButton
                  type="submit"
                  variant="outline"
                  pendingText="Saving debt"
                >
                  Save debt
                </SubmitButton>
                <Link
                  href={debtsPath()}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  Cancel
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {selectedPayDebt ? (
        <Card>
          <CardHeader>
            <CardTitle>Register payment</CardTitle>
            <CardDescription>
              Record a principal payment for {selectedPayDebt.name}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedPaySourceAccounts.length === 0 ? (
              <EmptyState
                title="No source accounts available"
                description="Create an asset account before registering a payment."
                actionHref={debtsPath()}
                actionLabel="Back to debts"
              />
            ) : selectedPayBalance <= 0 ? (
              <div className="space-y-4">
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  This debt is fully paid off. No outstanding balance to pay.
                </p>
                <Link
                  href={debtsPath()}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  Back to debts
                </Link>
              </div>
            ) : (
              <form action={createDebtPaymentAction} className="space-y-4">
                <input
                  type="hidden"
                  name="debt_id"
                  value={selectedPayDebt.id}
                />

                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">
                    Current outstanding balance
                  </p>
                  <p className="mt-1 text-base font-semibold">
                    {formatCurrency(
                      selectedPayBalance,
                      selectedPayAccount?.currency_code ??
                        household.base_currency
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Principal payments reduce this balance and do not count as
                    expenses.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pay_source_account_id">
                      Source account
                    </Label>
                    <select
                      id="pay_source_account_id"
                      name="source_account_id"
                      className={selectClassName}
                      required
                    >
                      <option value="">Select account</option>
                      {selectedPaySourceAccounts.map((sourceAccount) => (
                        <option key={sourceAccount.id} value={sourceAccount.id}>
                          {sourceAccount.name} · {sourceAccount.currency_code}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pay_payment_amount">
                      Principal payment amount
                    </Label>
                    <Input
                      id="pay_payment_amount"
                      name="payment_amount"
                      type="number"
                      min="0.01"
                      max={selectedPayBalance || undefined}
                      step="0.01"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Cannot exceed the current outstanding balance of{' '}
                      {formatCurrency(
                        selectedPayBalance,
                        selectedPayAccount?.currency_code ??
                          household.base_currency
                      )}
                      .
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pay_payment_date">Payment date</Label>
                    <Input
                      id="pay_payment_date"
                      name="payment_date"
                      type="date"
                      defaultValue={todayIsoDate()}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pay_status">Status</Label>
                    <select
                      id="pay_status"
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
                  <Label htmlFor="pay_description">Description</Label>
                  <Input
                    id="pay_description"
                    name="description"
                    defaultValue={`Debt payment: ${selectedPayDebt.name}`}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pay_notes">Notes</Label>
                  <Textarea id="pay_notes" name="notes" />
                </div>

                <div className="flex flex-wrap gap-2">
                  <SubmitButton
                    type="submit"
                    pendingText="Registering payment"
                  >
                    Register payment
                  </SubmitButton>
                  <Link
                    href={debtsPath()}
                    className={buttonVariants({ variant: 'outline' })}
                  >
                    Cancel
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}

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
                const canRegisterPayment =
                  debt.status === 'active' &&
                  currentBalance > 0 &&
                  sourceAccounts.length > 0
                const isBeingEdited = editDebtId === debt.id
                const isBeingPaid = payDebtId === debt.id

                return (
                  <div
                    key={debt.id}
                    className={`space-y-3 p-4 transition-colors ${
                      debt.status === 'inactive'
                        ? 'bg-muted/30 text-muted-foreground'
                        : 'hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-medium">{debt.name}</h2>
                          <StatusBadge status={debt.status} />
                          {account?.include_in_net_worth ? (
                            <Badge variant="secondary">Net worth</Badge>
                          ) : (
                            <Badge variant="outline">Excluded</Badge>
                          )}
                        </div>
                        {debt.lender_name ? (
                          <p className="text-sm text-muted-foreground">
                            {debt.lender_name}
                          </p>
                        ) : null}
                        <p className="text-sm text-muted-foreground">
                          {account?.name ?? 'Missing account'} ·{' '}
                          {formatValue(account?.account_type ?? 'debt')} ·{' '}
                          {account?.currency_code ?? household.base_currency}
                        </p>
                      </div>

                      <div className="space-y-0.5 sm:text-right">
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

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg bg-muted/40 p-2.5">
                        <p className="text-xs text-muted-foreground">
                          Original principal
                        </p>
                        <p className="mt-0.5 text-sm font-medium">
                          {debt.original_principal
                            ? formatCurrency(
                                debt.original_principal,
                                account?.currency_code ??
                                  household.base_currency
                              )
                            : 'Not set'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2.5">
                        <p className="text-xs text-muted-foreground">
                          Interest
                        </p>
                        <p className="mt-0.5 text-sm font-medium">
                          {debt.interest_rate
                            ? `${debt.interest_rate}% ${debt.interest_rate_period ?? ''}`.trim()
                            : 'Not set'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2.5">
                        <p className="text-xs text-muted-foreground">
                          Minimum payment
                        </p>
                        <p className="mt-0.5 text-sm font-medium">
                          {debt.minimum_payment
                            ? formatCurrency(
                                debt.minimum_payment,
                                account?.currency_code ??
                                  household.base_currency
                              )
                            : 'Not set'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2.5">
                        <p className="text-xs text-muted-foreground">Due day</p>
                        <p className="mt-0.5 text-sm font-medium">
                          {formatDueDay(debt.payment_due_day)}
                        </p>
                      </div>
                    </div>

                    {paydownPercent !== null ? (
                      <div className="space-y-1.5">
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

                    {debt.notes ? (
                      <p className="text-sm text-muted-foreground">
                        {debt.notes}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Link
                        href={debtsPath({ edit: debt.id })}
                        className={buttonVariants({
                          variant: isBeingEdited ? 'default' : 'outline',
                          size: 'sm',
                        })}
                      >
                        {isBeingEdited ? 'Editing…' : 'Edit'}
                      </Link>
                      {debt.status === 'active' ? (
                        canRegisterPayment ? (
                          <Link
                            href={debtsPath({ pay: debt.id })}
                            className={buttonVariants({
                              variant: isBeingPaid ? 'default' : 'secondary',
                              size: 'sm',
                            })}
                          >
                            {isBeingPaid ? 'Registering…' : 'Register payment'}
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {sourceAccounts.length === 0
                              ? 'No matching asset account.'
                              : 'Fully paid off.'}
                          </span>
                        )
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState
              title="No debts yet"
              description="No debts yet. Add a debt to start tracking liabilities and payments."
              actionHref={debtsPath({ mode: 'create' })}
              actionLabel="Create debt"
            />
          )}
        </CardContent>
      </Card>
    </main>
  )
}
