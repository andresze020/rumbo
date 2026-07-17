import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarClock, Plus, Repeat } from 'lucide-react'
import { RecurringForm } from './recurring-form'
import { RecurringRow, type RecurringRowVM } from './recurring-row'
import { PostForm } from './post-form'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { MetricCard } from '@/components/metric-card'
import { PageHeader } from '@/components/page-header'
import { SectionHeading } from '@/components/section-heading'
import { Callout } from '@/components/callout'
import { formatCurrency } from '@/lib/format'
import { frequencyLabel, todayIsoDate } from '@/lib/recurring/shared'

type RecurringPageProps = {
  searchParams: Promise<{
    created?: string
    updated?: string
    deleted?: string
    posted?: string
    completed?: string
    reactivated?: string
    deactivated?: string
    advance_warning?: string
    error?: string
    mode?: string
    edit?: string
    post?: string
  }>
}

type RecurringTransaction = {
  id: string
  name: string
  transaction_type: string
  account_id: string | null
  category_id: string | null
  amount: number | string
  currency_code: string
  frequency: string
  start_date: string
  end_date: string | null
  next_run_date: string | null
  is_active: boolean
}

type Account = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
  is_archived: boolean
}

type Category = {
  id: string
  name: string
  category_type: string
  parent_category_id: string | null
  icon: string | null
  is_archived: boolean
}

function categoryPath(
  category: Category | undefined,
  byId: Map<string, Category>
) {
  if (!category) return 'Unknown'
  const parent = category.parent_category_id ? byId.get(category.parent_category_id) : null
  return parent ? `${parent.name} / ${category.name}` : category.name
}

export default async function RecurringPage({ searchParams }: RecurringPageProps) {
  const params = await searchParams
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const isCreating = params.mode === 'create'
  const editId = typeof params.edit === 'string' ? params.edit : null
  const postId = typeof params.post === 'string' ? params.post : null

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

  const [
    { data: recurring, error: recurringError },
    { data: accounts },
    { data: categories },
  ] = await Promise.all([
    supabase
      .from('recurring_transactions')
      .select(
        'id, name, transaction_type, account_id, category_id, amount, currency_code, frequency, start_date, end_date, next_run_date, is_active'
      )
      .eq('household_id', household.id)
      .order('next_run_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('accounts')
      .select('id, name, currency_code, institution_name, is_archived')
      .eq('household_id', household.id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
    supabase
      .from('categories')
      .select('id, name, category_type, parent_category_id, icon, is_archived')
      .eq('household_id', household.id)
      .is('deleted_at', null)
      .order('category_type', { ascending: true })
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
  ])

  const allRecurring = (recurring ?? []) as RecurringTransaction[]
  const allAccounts = (accounts ?? []) as Account[]
  const allCategories = (categories ?? []) as Category[]
  const accountsById = new Map(allAccounts.map((a) => [a.id, a]))
  const categoriesById = new Map(allCategories.map((c) => [c.id, c]))

  const today = todayIsoDate()

  function toVM(row: RecurringTransaction): RecurringRowVM {
    const category = row.category_id ? categoriesById.get(row.category_id) : undefined
    const account = row.account_id ? accountsById.get(row.account_id) : undefined
    return {
      id: row.id,
      name: row.name,
      transaction_type: row.transaction_type,
      amount: Number(row.amount),
      currency_code: row.currency_code,
      frequencyLabel: frequencyLabel(row.frequency),
      next_run_date: row.next_run_date,
      start_date: row.start_date,
      end_date: row.end_date,
      is_active: row.is_active,
      isDue: Boolean(row.next_run_date && row.next_run_date <= today),
      accountName: account?.name ?? 'Unknown account',
      categoryName: categoryPath(category, categoriesById),
      categoryIcon: category?.icon ?? null,
      editHref: `/dashboard/recurring?edit=${row.id}`,
      postHref: `/dashboard/recurring?post=${row.id}`,
    }
  }

  const active = allRecurring.filter((r) => r.is_active)
  const dueRows = active
    .filter((r) => r.next_run_date && r.next_run_date <= today)
    .map(toVM)
  const upcomingRows = active
    .filter((r) => !r.next_run_date || r.next_run_date > today)
    .map(toVM)
  const inactiveRows = allRecurring.filter((r) => !r.is_active).map(toVM)

  const activeCount = active.length
  const dueCount = dueRows.length
  const monthlyExpenseEstimate = active
    .filter((r) => r.transaction_type === 'expense' && r.currency_code === baseCurrency)
    .reduce((sum, r) => sum + estimateMonthly(Number(r.amount), r.frequency), 0)

  // Form data (active accounts + categories only).
  const formAccounts = allAccounts
    .filter((a) => !a.is_archived)
    .map((a) => ({
      id: a.id,
      name: a.name,
      currency_code: a.currency_code,
      institution_name: a.institution_name,
    }))
  const formCategories = allCategories
    .filter((c) => !c.is_archived && (c.category_type === 'income' || c.category_type === 'expense'))
    .map((c) => ({
      id: c.id,
      name: c.name,
      category_type: c.category_type,
      parent_category_id: c.parent_category_id,
      icon: c.icon,
    }))

  const editTemplate = editId
    ? allRecurring.find((r) => r.id === editId)
    : null
  const postTemplate = postId
    ? allRecurring.find((r) => r.id === postId && r.is_active)
    : null

  function formatMoney(value: number) {
    return formatCurrency(value, baseCurrency)
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow={household.name}
        title="Recurring"
        description="Templates for predictable income and expenses. Post them with one click when due."
        actions={
          <Link
            href="/dashboard/recurring?mode=create"
            className={buttonVariants({ size: 'sm' })}
          >
            <Plus aria-hidden="true" />
            New recurring
          </Link>
        }
      />

      {/* Notifications */}
      {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}
      {params.created === '1' ? <Callout variant="success">Recurring transaction created.</Callout> : null}
      {params.updated === '1' ? <Callout variant="success">Recurring transaction updated.</Callout> : null}
      {params.deleted === '1' ? <Callout variant="info">Recurring transaction deleted.</Callout> : null}
      {params.posted === '1' ? (
        <Callout variant="success">
          Transaction posted{params.completed === '1' ? ' — template completed and deactivated.' : '.'}
        </Callout>
      ) : null}
      {params.advance_warning === '1' ? (
        <Callout variant="info">
          The transaction posted, but the next run date could not be advanced. Edit the template if needed.
        </Callout>
      ) : null}
      {params.reactivated === '1' ? <Callout variant="success">Recurring transaction reactivated.</Callout> : null}
      {params.deactivated === '1' ? <Callout variant="info">Recurring transaction deactivated.</Callout> : null}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Active templates"
          value={String(activeCount)}
          description="Income & expense"
          icon={<Repeat />}
          accent="bg-primary/10 text-primary"
        />
        <MetricCard
          label="Due now"
          value={String(dueCount)}
          description="Ready to post"
          icon={<CalendarClock />}
          accent="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
        />
        <MetricCard
          label="Est. monthly expense"
          value={formatMoney(monthlyExpenseEstimate)}
          description={`Base ${baseCurrency} templates`}
          icon={<Repeat />}
          accent="bg-muted text-muted-foreground"
        />
      </div>

      {/* Dialogs */}
      {isCreating ? (
        <FormDialog
          title="New recurring transaction"
          description="Define a template once, then post it when due."
          cancelHref="/dashboard/recurring"
          wide
        >
          <RecurringForm mode="create" accounts={formAccounts} categories={formCategories} />
        </FormDialog>
      ) : null}

      {editTemplate ? (
        <FormDialog
          title="Edit recurring transaction"
          description={`Update ${editTemplate.name}.`}
          cancelHref="/dashboard/recurring"
          wide
        >
          <RecurringForm
            mode="edit"
            template={editTemplate}
            accounts={formAccounts}
            categories={formCategories}
          />
        </FormDialog>
      ) : null}

      {postTemplate ? (
        <FormDialog
          title="Post recurring transaction"
          description="Confirm the details before posting this occurrence."
          cancelHref="/dashboard/recurring"
        >
          <PostForm
            recurringId={postTemplate.id}
            name={postTemplate.name}
            defaultAmount={Number(postTemplate.amount).toFixed(2)}
            defaultDate={
              postTemplate.next_run_date && postTemplate.next_run_date <= today
                ? postTemplate.next_run_date
                : today
            }
            currencyCode={postTemplate.currency_code}
            baseCurrency={baseCurrency}
          />
        </FormDialog>
      ) : null}

      {/* Lists */}
      {recurringError ? (
        <Callout variant="error">Could not load recurring transactions. Try refreshing.</Callout>
      ) : allRecurring.length === 0 ? (
        <EmptyState
          title="No recurring transactions yet"
          description="Create a template for rent, subscriptions, or your salary to post them in one click."
          actionHref="/dashboard/recurring?mode=create"
          actionLabel="New recurring"
        />
      ) : (
        <div className="space-y-6">
          {dueRows.length ? (
            <section className="space-y-3">
              <SectionHeading
                title="Due & overdue"
                description="Templates ready to post."
              />
              <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
                {dueRows.map((vm) => (
                  <RecurringRow key={vm.id} vm={vm} />
                ))}
              </div>
            </section>
          ) : null}

          {upcomingRows.length ? (
            <section className="space-y-3">
              <SectionHeading title="Upcoming" description="Scheduled for later." />
              <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
                {upcomingRows.map((vm) => (
                  <RecurringRow key={vm.id} vm={vm} />
                ))}
              </div>
            </section>
          ) : null}

          {inactiveRows.length ? (
            <section className="space-y-3">
              <SectionHeading title="Inactive" description="Paused templates." />
              <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
                {inactiveRows.map((vm) => (
                  <RecurringRow key={vm.id} vm={vm} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </main>
  )
}

/** Rough monthly-equivalent estimate for the summary card. */
function estimateMonthly(amount: number, frequency: string): number {
  switch (frequency) {
    case 'daily':
      return amount * 30
    case 'weekly':
      return amount * 4.345
    case 'biweekly':
      return amount * 2.17
    case 'semimonthly':
      return amount * 2
    case 'monthly':
      return amount
    case 'quarterly':
      return amount / 3
    case 'yearly':
      return amount / 12
    default:
      return amount
  }
}
