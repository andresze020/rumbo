import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, HandCoins, Percent, Plus } from 'lucide-react'
import { createDebtPaymentAction } from './actions'
import { DebtCreateForm } from './debt-create-form'
import { DebtEditForm } from './debt-edit-form'
import { DebtCard } from './debt-card'
import { AmountInput } from '@/components/amount-input'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { LocalizedClientBoundary } from '@/components/localized-client-boundary'
import { InfoTooltip } from '@/components/info-tooltip'
import { SectionHeading } from '@/components/section-heading'
import { Callout } from '@/components/callout'
import { SubmitButton } from '@/components/submit-button'
import { formatCurrency } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { nativeSelectCls, formBtnCls } from '@/lib/form-styles'
import { cn } from '@/lib/utils'

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

const selectClassName = nativeSelectCls

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

function formatDueDay(value: number | string | null) {
  return value ? `Day ${value}` : 'N/A'
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
  if (originalPrincipal <= 0) return null
  return Math.min(Math.max((originalPrincipal - balance) / originalPrincipal, 0), 1)
}

function DebtSummaryStat({
  icon,
  accent,
  label,
  value,
}: {
  icon: ReactNode
  accent: string
  label: string
  value: string
}) {
  return (
    <div className="lg:flex-1 lg:px-6 lg:text-center">
      <div className="flex items-center gap-2 lg:justify-center">
        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-md ${accent}`}
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="whitespace-nowrap text-[11px] text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1.5 whitespace-nowrap font-mono text-base font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function DebtSummaryDivider() {
  return <div className="hidden w-px self-stretch bg-border lg:block" aria-hidden="true" />
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
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.default_household_id) redirect('/onboarding')

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()
  if (householdError || !household) redirect('/onboarding')

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
  const accountsById = new Map(accountRows.map((a) => [a.id, a]))
  const balancesByAccountId = new Map(accountBalances.map((b) => [b.account_id, b]))
  const debtAccountIds = new Set(debtRows.map((d) => d.account_id))

  const linkableLiabilityAccounts = accountRows.filter(
    (a) => a.account_class === 'liability' && !a.is_archived && !debtAccountIds.has(a.id)
  )
  const activeAssetAccounts = accountRows.filter(
    (a) => a.account_class === 'asset' && !a.is_archived
  )
  const activeDebts = debtRows.filter((d) => d.status === 'active')
  const inactiveDebts = debtRows.filter((d) => d.status === 'inactive')

  const totalDebtBase = activeDebts.reduce(
    (sum, d) => sum + getBaseDebtBalance(d, balancesByAccountId),
    0
  )
  const totalMinimumPayment = activeDebts.reduce(
    (sum, d) => sum + Number(d.minimum_payment ?? 0),
    0
  )
  const nextDueDebt = activeDebts
    .filter((d) => d.payment_due_day)
    .sort((a, b) => Number(a.payment_due_day ?? 0) - Number(b.payment_due_day ?? 0))[0]

  // Overall paydown across active debts with a recorded original principal.
  const totalOriginalPrincipal = activeDebts.reduce(
    (sum, d) => sum + Number(d.original_principal ?? 0),
    0
  )
  const overallPaidPercent =
    totalOriginalPrincipal > 0
      ? Math.min(Math.max((totalOriginalPrincipal - totalDebtBase) / totalOriginalPrincipal, 0), 1)
      : null

  // Average interest rate, weighted by outstanding balance.
  const ratedDebts = activeDebts
    .map((d) => ({
      rate: Number(d.interest_rate ?? 0),
      balance: getBaseDebtBalance(d, balancesByAccountId),
    }))
    .filter((d) => d.rate > 0 && d.balance > 0)
  const ratedBalanceTotal = ratedDebts.reduce((sum, d) => sum + d.balance, 0)
  const averageRate =
    ratedBalanceTotal > 0
      ? ratedDebts.reduce((sum, d) => sum + d.rate * d.balance, 0) / ratedBalanceTotal
      : null

  const defaultCurrency =
    currencyOptions.find((c) => c.code === household.base_currency)?.code ??
    currencyOptions[0]?.code ??
    household.base_currency

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
    ? activeAssetAccounts.filter((a) => a.currency_code === selectedPayAccount.currency_code)
    : []

  const hasLoadError = currenciesError || debtsError || accountsError || balancesError

  return (
    <LocalizedClientBoundary>
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow={household.name}
        title={
          <span className="flex items-center gap-1.5">
            Debts
            <InfoTooltip term="liabilities" label="Debts" />
          </span>
        }
        description="Liability accounts, debt metadata, and principal payments."
        actions={
          <>
            <Link
              href={debtsPath({ mode: 'create' })}
              className={buttonVariants({ size: 'sm' })}
            >
              <Plus aria-hidden="true" />
              Create debt
            </Link>
            <Link
              href="/dashboard/net-worth"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Net worth
            </Link>
          </>
        }
      />

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}
      {created ? <Callout variant="success">Debt created.</Callout> : null}
      {updated ? <Callout variant="success">Debt updated.</Callout> : null}
      {paid ? <Callout variant="success">Payment registered.</Callout> : null}
      {hasLoadError ? (
        <Callout variant="error">Could not load debt data. Try refreshing.</Callout>
      ) : null}

      {/* ── Summary ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm shadow-black/[0.03] sm:p-6">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Total debt · {String(activeDebts.length)} active
          </p>
          <p className="mt-1.5 font-mono text-3xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
            {formatCurrency(totalDebtBase, household.base_currency)}
          </p>
          {overallPaidPercent !== null ? (
            <>
              <div className="mt-3 h-2 max-w-xs overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.round(overallPaidPercent * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                {Math.round(overallPaidPercent * 100)}% paid off the original balance
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Add an original principal to track paydown progress.
            </p>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 border-t pt-5 sm:grid-cols-3 lg:flex lg:items-center lg:gap-0 lg:border-t-0 lg:pt-0">
          <DebtSummaryStat
            icon={<HandCoins className="size-3.5" />}
            accent="bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
            label="Monthly payment"
            value={formatCurrency(totalMinimumPayment, household.base_currency)}
          />
          <DebtSummaryDivider />
          <DebtSummaryStat
            icon={<Percent className="size-3.5" />}
            accent="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
            label="Average rate"
            value={
              averageRate !== null
                ? `${new Intl.NumberFormat('en-CA', { maximumFractionDigits: 1 }).format(averageRate)}%`
                : 'N/A'
            }
          />
          <DebtSummaryDivider />
          <DebtSummaryStat
            icon={<CalendarDays className="size-3.5" />}
            accent="bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400"
            label="Next due day"
            value={nextDueDebt ? formatDueDay(nextDueDebt.payment_due_day) : 'N/A'}
          />
        </div>
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      {isCreating ? (
        <FormDialog
          title="Create debt"
          description="Add a debt record and create or link a liability account."
          cancelHref={debtsPath()}
          wide
        >
          <DebtCreateForm
            baseCurrency={household.base_currency}
            currencyOptions={currencyOptions}
            defaultCurrency={defaultCurrency}
            linkableLiabilityAccounts={linkableLiabilityAccounts}
          />
        </FormDialog>
      ) : null}

      {selectedEditDebt ? (
        <FormDialog
          title="Edit debt"
          description={`Update metadata for ${selectedEditDebt.name}.`}
          cancelHref={debtsPath()}
          wide
        >
          <DebtEditForm
            debt={selectedEditDebt}
            currencyCode={
              accountsById.get(selectedEditDebt.account_id)?.currency_code ??
              household.base_currency
            }
          />
        </FormDialog>
      ) : null}

      {selectedPayDebt ? (
        <FormDialog
          title="Register payment"
          description={`Record a principal payment for ${selectedPayDebt.name}.`}
          cancelHref={debtsPath()}
        >
          {selectedPaySourceAccounts.length === 0 ? (
            <EmptyState
              title="No source accounts available"
              description="Create an asset account before registering a payment."
              actionHref={debtsPath()}
              actionLabel="Back to debts"
            />
          ) : selectedPayBalance <= 0 ? (
            <div className="space-y-4">
              <Callout variant="success">
                This debt is fully paid off. No outstanding balance to pay.
              </Callout>
              <Link href={debtsPath()} className={cn(buttonVariants({ variant: 'outline' }), formBtnCls)}>
                Back to debts
              </Link>
            </div>
          ) : (
            <form action={createDebtPaymentAction} className="space-y-4">
              <input type="hidden" name="debt_id" value={selectedPayDebt.id} />

              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Current outstanding balance</p>
                <p className="mt-1 text-base font-semibold">
                  {formatCurrency(
                    selectedPayBalance,
                    selectedPayAccount?.currency_code ?? household.base_currency
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Principal payments reduce this balance and do not count as expenses.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pay_source_account_id">Source account</Label>
                  <select
                    id="pay_source_account_id"
                    name="source_account_id"
                    className={selectClassName}
                    required
                  >
                    <option value="">Select account</option>
                    {selectedPaySourceAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.currency_code}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pay_payment_amount">Principal payment amount</Label>
                  <AmountInput
                    id="pay_payment_amount"
                    name="payment_amount"
                    currencyCode={selectedPayAccount?.currency_code ?? household.base_currency}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Cannot exceed{' '}
                    {formatCurrency(
                      selectedPayBalance,
                      selectedPayAccount?.currency_code ?? household.base_currency
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

              <SubmitButton type="submit" className={formBtnCls} pendingText="Registering…">
                Register payment
              </SubmitButton>
            </form>
          )}
        </FormDialog>
      ) : null}

      {/* ── Debt list ──────────────────────────────────────────────────── */}
      {debtsError ? (
        <Callout variant="error">Could not load debts. Try refreshing.</Callout>
      ) : debtRows.length === 0 ? (
        <EmptyState
          title="No debts yet"
          description="Add a debt to start tracking liabilities and payments."
          actionHref={debtsPath({ mode: 'create' })}
          actionLabel="Create debt"
        />
      ) : (
        <div className="space-y-6">
          {activeDebts.length > 0 ? (
            <section className="space-y-3">
              <SectionHeading title="Active" description="Debts you are currently paying down." />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {activeDebts.map((debt) => {
                  const account = accountsById.get(debt.account_id)
                  const currentBalance = getDebtBalance(debt, balancesByAccountId)
                  const paydownPercent = getPaydownPercent(debt, currentBalance)
                  const sourceAccounts = account
                    ? activeAssetAccounts.filter((a) => a.currency_code === account.currency_code)
                    : []
                  const canRegisterPayment = currentBalance > 0 && sourceAccounts.length > 0

                  return (
                    <DebtCard
                      key={debt.id}
                      debt={debt}
                      account={account}
                      currentBalance={currentBalance}
                      baseCurrency={household.base_currency}
                      paydownPercent={paydownPercent}
                      canRegisterPayment={canRegisterPayment}
                      noSourceAccounts={sourceAccounts.length === 0}
                      editHref={debtsPath({ edit: debt.id })}
                      payHref={debtsPath({ pay: debt.id })}
                    />
                  )
                })}
              </div>
            </section>
          ) : null}

          {inactiveDebts.length > 0 ? (
            <section className="space-y-3">
              <SectionHeading title="Inactive" description="Closed or paused debts." />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {inactiveDebts.map((debt) => {
                  const account = accountsById.get(debt.account_id)
                  const currentBalance = getDebtBalance(debt, balancesByAccountId)
                  const paydownPercent = getPaydownPercent(debt, currentBalance)

                  return (
                    <DebtCard
                      key={debt.id}
                      debt={debt}
                      account={account}
                      currentBalance={currentBalance}
                      baseCurrency={household.base_currency}
                      paydownPercent={paydownPercent}
                      canRegisterPayment={false}
                      noSourceAccounts={false}
                      editHref={debtsPath({ edit: debt.id })}
                      payHref={debtsPath({ pay: debt.id })}
                    />
                  )
                })}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </main>
    </LocalizedClientBoundary>
  )
}
