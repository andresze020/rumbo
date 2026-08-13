import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { InstallmentForm } from './installment-form'
import { InstallmentPlanRow, type InstallmentPlanVM } from './installment-plan-row'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { Callout } from '@/components/callout'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { formatCurrency, formatIsoDate } from '@/lib/format'
import { getLocale } from '@/lib/i18n/server'
import { createUiTranslator } from '@/lib/i18n/ui'
import type { PayeeOption } from '../transactions/payee-picker'

type InstallmentsPageProps = {
  searchParams: Promise<{
    mode?: string
    created?: string
    cancelled?: string
    voided?: string
    error?: string
  }>
}

type PlanRow = {
  id: string
  account_id: string
  category_id: string
  description: string
  total_amount: number | string
  currency_code: string
  installment_count: number
  start_date: string
  status: string
}

/**
 * One installment transaction, used to derive each plan's progress. These are
 * ordinary expense rows — the plan itself holds no money, which is exactly why
 * reports cannot double-count it.
 */
type InstallmentTransaction = {
  installment_plan_id: string
  installment_number: number
  transaction_date: string
  status: string
}

export default async function InstallmentsPage({ searchParams }: InstallmentsPageProps) {
  const params = await searchParams
  const locale = await getLocale()
  const ui = createUiTranslator(locale)
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

  const householdId = profile.default_household_id as string

  const { data: household } = await supabase
    .from('households')
    .select('id, base_currency')
    .eq('id', householdId)
    .maybeSingle()

  if (!household) {
    redirect('/onboarding')
  }

  const baseCurrency = household.base_currency as string

  const [
    { data: planRows, error: plansError },
    { data: accountRows },
    { data: categoryRows },
    { data: payeeRows },
  ] = await Promise.all([
    supabase
      .from('installment_plans')
      .select(
        'id, account_id, category_id, description, total_amount, currency_code, installment_count, start_date, status'
      )
      .eq('household_id', householdId)
      .order('created_at', { ascending: false }),
    supabase
      .from('accounts')
      .select('id, name, currency_code, institution_name, is_archived')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    supabase
      .from('categories')
      .select('id, name, parent_category_id, icon, category_type, is_archived')
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    supabase
      .from('payees')
      .select('id, name')
      .eq('household_id', householdId)
      .eq('is_archived', false)
      .order('name', { ascending: true }),
  ])

  const plans = (planRows ?? []) as PlanRow[]
  const allAccounts = (accountRows ?? []) as Array<{
    id: string
    name: string
    currency_code: string
    institution_name: string | null
    is_archived: boolean
  }>
  const allCategories = (categoryRows ?? []) as Array<{
    id: string
    name: string
    parent_category_id: string | null
    icon: string | null
    category_type: string
    is_archived: boolean
  }>

  // Progress per plan comes from the installments themselves, so a voided
  // installment (an early payoff) stops counting without any extra bookkeeping.
  let installments: InstallmentTransaction[] = []
  if (plans.length) {
    const { data: installmentRows } = await supabase
      .from('transactions')
      .select('installment_plan_id, installment_number, transaction_date, status')
      .eq('household_id', householdId)
      .in(
        'installment_plan_id',
        plans.map((plan) => plan.id)
      )
      .is('deleted_at', null)
    installments = (installmentRows ?? []) as InstallmentTransaction[]
  }

  const accountNamesById = new Map(allAccounts.map((account) => [account.id, account.name]))
  const categoryNamesById = new Map(
    allCategories.map((category) => [category.id, category.name])
  )

  const today = new Date().toISOString().slice(0, 10)

  const planVMs: InstallmentPlanVM[] = plans.map((plan) => {
    const rows = installments.filter((row) => row.installment_plan_id === plan.id)
    const live = rows.filter((row) => row.status !== 'voided')
    const paid = live.filter((row) => row.transaction_date <= today)
    const nextDue = live
      .filter((row) => row.transaction_date > today)
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))[0]

    const perInstallment =
      Number(plan.total_amount) / Math.max(plan.installment_count, 1)
    const remaining = Math.max(live.length - paid.length, 0)

    return {
      id: plan.id,
      description: plan.description,
      status: plan.status,
      accountName: accountNamesById.get(plan.account_id) ?? ui('Unknown account'),
      categoryName: categoryNamesById.get(plan.category_id) ?? ui('Unknown category'),
      totalLabel: formatCurrency(Number(plan.total_amount), plan.currency_code, locale),
      perInstallmentLabel: formatCurrency(perInstallment, plan.currency_code, locale),
      installmentCount: plan.installment_count,
      paidCount: paid.length,
      remainingCount: remaining,
      // A cancelled plan's future installments are voided, so "remaining" is
      // already 0 and there is nothing due next.
      nextDueLabel: nextDue ? formatIsoDate(nextDue.transaction_date, locale) : null,
      startLabel: formatIsoDate(plan.start_date, locale),
      transactionsHref: `/dashboard/transactions?search=${encodeURIComponent(
        plan.description
      )}&date_from=${plan.start_date}&date_to=2099-12-31`,
    }
  })

  const activePlans = planVMs.filter((plan) => plan.status === 'active')
  const closedPlans = planVMs.filter((plan) => plan.status !== 'active')

  const isCreating = params.mode === 'create'
  const cancelHref = '/dashboard/installments'
  const createHref = '/dashboard/installments?mode=create'

  // Only active, unarchived accounts and active expense categories can start a
  // plan — the RPC enforces the same, this just keeps them out of the pickers.
  const formAccounts = allAccounts
    .filter((account) => !account.is_archived)
    .map(({ id, name, currency_code, institution_name }) => ({
      id,
      name,
      currency_code,
      institution_name,
    }))
  const formCategories = allCategories
    .filter((category) => !category.is_archived && category.category_type === 'expense')
    .map(({ id, name, parent_category_id, icon }) => ({
      id,
      name,
      parent_category_id,
      icon,
    }))
  const payeeOptions = (payeeRows ?? []) as PayeeOption[]

  return (
    <div className="space-y-4">
      <PageHeader
        title={ui('Installments')}
        description={ui(
          'Split a purchase into a fixed number of monthly payments. Each payment is saved as its own expense.'
        )}
        actions={
          <Link href={createHref} className={buttonVariants({ size: 'sm' })}>
            <Plus aria-hidden="true" />
            {ui('New plan')}
          </Link>
        }
      />

      {params.error ? <Callout variant="error">{params.error}</Callout> : null}
      {params.created === '1' ? (
        <Callout variant="success">
          {ui('Installment plan created. Each payment is now in your transactions.')}
        </Callout>
      ) : null}
      {params.cancelled === '1' ? (
        <Callout variant="success">
          {ui('Plan cancelled. Payments that had not come due yet were voided.')}
        </Callout>
      ) : null}
      {plansError ? (
        <Callout variant="error">
          {ui(
            'Could not load your installment plans. The installments migration may not be applied yet.'
          )}
        </Callout>
      ) : null}

      {isCreating ? (
        <FormDialog
          title="New installment plan"
          description="The total is split evenly across the payments, and each one is saved as its own expense on its own date."
          cancelHref={cancelHref}
          wide
        >
          <InstallmentForm
            accounts={formAccounts}
            categories={formCategories}
            payees={payeeOptions}
            baseCurrency={baseCurrency}
            cancelHref={cancelHref}
          />
        </FormDialog>
      ) : null}

      {planVMs.length === 0 && !plansError ? (
        <EmptyState
          title={ui('No installment plans yet')}
          description={ui(
            'A plan is for a purchase you are paying off over a fixed number of months — the total and the count are both known up front.'
          )}
          actionHref={createHref}
          actionLabel={ui('New plan')}
        />
      ) : null}

      {activePlans.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{ui('Active')}</h2>
          <div className="divide-y rounded-xl border bg-card">
            {activePlans.map((plan) => (
              <InstallmentPlanRow key={plan.id} plan={plan} />
            ))}
          </div>
        </section>
      ) : null}

      {closedPlans.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{ui('Finished and cancelled')}</h2>
          <div className="divide-y rounded-xl border bg-card">
            {closedPlans.map((plan) => (
              <InstallmentPlanRow key={plan.id} plan={plan} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
