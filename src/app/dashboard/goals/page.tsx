import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, PiggyBank, Target } from 'lucide-react'
import { GoalForm } from './goal-form'
import { GoalProgressForm } from './goal-progress-form'
import { GoalCard } from './goal-card'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { MetricCard } from '@/components/metric-card'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { LocalizedClientBoundary } from '@/components/localized-client-boundary'
import { SectionHeading } from '@/components/section-heading'
import { Callout } from '@/components/callout'
import { ArchiveToast } from '@/components/archive-toast'
import { formatCurrency } from '@/lib/format'
import { getLocale } from '@/lib/i18n/server'
import { translate } from '@/lib/i18n/translate'
import { setGoalStatusAction } from './actions'

type GoalsPageProps = {
  searchParams: Promise<{
    created?: string
    updated?: string
    contributed?: string
    withdrawn?: string
    completed?: string
    status_updated?: string
    error?: string
    mode?: string
    edit?: string
    contribute?: string
    withdraw?: string
  }>
}

type Goal = {
  id: string
  name: string
  goal_type: string
  target_amount: number | string
  current_amount: number | string
  currency_code: string
  target_date: string | null
  linked_account_id: string | null
  status: string
}

type Account = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
  is_archived: boolean
}

export default async function GoalsPage({ searchParams }: GoalsPageProps) {
  const params = await searchParams
  const locale = await getLocale()
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const isCreating = params.mode === 'create'
  const editId = typeof params.edit === 'string' ? params.edit : null
  const contributeId = typeof params.contribute === 'string' ? params.contribute : null
  const withdrawId = typeof params.withdraw === 'string' ? params.withdraw : null

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

  const baseCurrency = household.base_currency as string

  const [{ data: goals, error: goalsError }, { data: accounts }] = await Promise.all([
    supabase
      .from('goals')
      .select(
        'id, name, goal_type, target_amount, current_amount, currency_code, target_date, linked_account_id, status'
      )
      .eq('household_id', household.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('accounts')
      .select('id, name, currency_code, institution_name, is_archived')
      .eq('household_id', household.id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
  ])

  const allGoals = (goals ?? []) as Goal[]
  const allAccounts = (accounts ?? []) as Account[]
  const accountsById = new Map(allAccounts.map((a) => [a.id, a]))

  const activeGoals = allGoals.filter((g) => g.status === 'active')
  const pausedGoals = allGoals.filter((g) => g.status === 'paused')
  const completedGoals = allGoals.filter((g) => g.status === 'completed')
  const archivedGoals = allGoals.filter((g) => g.status === 'archived')

  const baseCurrencyGoals = allGoals.filter(
    (g) => g.currency_code === baseCurrency && g.status !== 'archived'
  )
  const totalSaved = baseCurrencyGoals.reduce((sum, g) => sum + Number(g.current_amount), 0)
  const totalTarget = baseCurrencyGoals.reduce((sum, g) => sum + Number(g.target_amount), 0)

  const formAccounts = allAccounts
    .filter((a) => !a.is_archived)
    .map((a) => ({
      id: a.id,
      name: a.name,
      currency_code: a.currency_code,
      institution_name: a.institution_name,
    }))

  const editGoal = editId ? allGoals.find((g) => g.id === editId) : null
  const contributeGoal = contributeId
    ? allGoals.find((g) => g.id === contributeId && g.status !== 'archived')
    : null
  const withdrawGoal = withdrawId
    ? allGoals.find((g) => g.id === withdrawId && g.status !== 'archived')
    : null

  function toCardProps(goal: Goal) {
    const account = goal.linked_account_id ? accountsById.get(goal.linked_account_id) : undefined
    return {
      goal,
      linkedAccountName: account?.name ?? null,
      editHref: `/dashboard/goals?edit=${goal.id}`,
      contributeHref: `/dashboard/goals?contribute=${goal.id}`,
      withdrawHref: `/dashboard/goals?withdraw=${goal.id}`,
      locale,
    }
  }

  return (
    <LocalizedClientBoundary>
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow={household.name}
        title="Goals & funds"
        description="Set savings targets, track progress, and link them to an account."
        actions={
          <Link href="/dashboard/goals?mode=create" className={buttonVariants({ size: 'sm' })}>
            <Target aria-hidden="true" />
            New goal
          </Link>
        }
      />

      {/* Notifications */}
      {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}
      {params.created === '1' ? <Callout variant="success">Goal created.</Callout> : null}
      {params.updated === '1' ? <Callout variant="success">Goal updated.</Callout> : null}
      {params.contributed === '1' ? (
        <Callout variant="success">
          Contribution added{params.completed === '1' ? ' — goal reached!' : '.'}
        </Callout>
      ) : null}
      {params.withdrawn === '1' ? <Callout variant="info">Withdrawal registered.</Callout> : null}
      {params.status_updated === '1' ? <Callout variant="info">Goal status updated.</Callout> : null}
      <ArchiveToast
        action={setGoalStatusAction}
        idField="goal_id"
        archivedMessage="Goal archived."
        restoredMessage="Goal restored."
        undoLabel="Undo"
        undoField="status"
        undoValue="active"
      />

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Active goals"
          value={String(activeGoals.length)}
          description="In progress"
          icon={<PiggyBank />}
          accent="bg-primary/10 text-primary"
        />
        <MetricCard
          label="Completed"
          value={String(completedGoals.length)}
          description="Targets reached"
          icon={<CheckCircle2 />}
          accent="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
        />
        <MetricCard
          label="Total saved"
          value={formatCurrency(totalSaved, baseCurrency, locale)}
          description={translate(locale, 'goals.totalDescription', {
            target: formatCurrency(totalTarget, baseCurrency, locale),
            currency: baseCurrency,
          })}
          icon={<Target />}
          accent="bg-muted text-muted-foreground"
        />
      </div>

      {/* Dialogs */}
      {isCreating ? (
        <FormDialog
          title="New goal"
          description="Set a target and start tracking your progress."
          cancelHref="/dashboard/goals"
        >
          <GoalForm mode="create" accounts={formAccounts} baseCurrency={baseCurrency} />
        </FormDialog>
      ) : null}

      {editGoal ? (
        <FormDialog
          title="Edit goal"
          description={`Update ${editGoal.name}.`}
          cancelHref="/dashboard/goals"
        >
          <GoalForm
            mode="edit"
            template={editGoal}
            accounts={formAccounts}
            baseCurrency={baseCurrency}
          />
        </FormDialog>
      ) : null}

      {contributeGoal ? (
        <FormDialog
          title="Add funds"
          description={`Record a contribution toward ${contributeGoal.name}.`}
          cancelHref="/dashboard/goals"
        >
          <GoalProgressForm
            mode="contribute"
            goalId={contributeGoal.id}
            currencyCode={contributeGoal.currency_code}
            currentAmount={Number(contributeGoal.current_amount)}
            targetAmount={Number(contributeGoal.target_amount)}
          />
        </FormDialog>
      ) : null}

      {withdrawGoal ? (
        <FormDialog
          title="Withdraw"
          description={`Register a withdrawal from ${withdrawGoal.name}.`}
          cancelHref="/dashboard/goals"
        >
          <GoalProgressForm
            mode="withdraw"
            goalId={withdrawGoal.id}
            currencyCode={withdrawGoal.currency_code}
            currentAmount={Number(withdrawGoal.current_amount)}
            targetAmount={Number(withdrawGoal.target_amount)}
          />
        </FormDialog>
      ) : null}

      {/* Lists */}
      {goalsError ? (
        <Callout variant="error">Could not load goals. Try refreshing.</Callout>
      ) : allGoals.length === 0 ? (
        <EmptyState
          title="No goals yet"
          description="Create a savings goal for an emergency fund, a trip, or a down payment."
          actionHref="/dashboard/goals?mode=create"
          actionLabel="New goal"
        />
      ) : (
        <div className="space-y-6">
          {activeGoals.length ? (
            <section className="space-y-3">
              <SectionHeading title="Active" description="Goals you're saving toward." />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeGoals.map((goal) => (
                  <GoalCard key={goal.id} {...toCardProps(goal)} />
                ))}
              </div>
            </section>
          ) : null}

          {completedGoals.length ? (
            <section className="space-y-3">
              <SectionHeading title="Completed" description="Targets you've reached." />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completedGoals.map((goal) => (
                  <GoalCard key={goal.id} {...toCardProps(goal)} />
                ))}
              </div>
            </section>
          ) : null}

          {pausedGoals.length ? (
            <section className="space-y-3">
              <SectionHeading title="Paused" description="Goals on hold." />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pausedGoals.map((goal) => (
                  <GoalCard key={goal.id} {...toCardProps(goal)} />
                ))}
              </div>
            </section>
          ) : null}

          {archivedGoals.length ? (
            <section className="space-y-3">
              <SectionHeading title="Archived" description="Hidden from active tracking." />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {archivedGoals.map((goal) => (
                  <GoalCard key={goal.id} {...toCardProps(goal)} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </main>
    </LocalizedClientBoundary>
  )
}
