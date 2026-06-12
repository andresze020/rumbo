import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  copyPreviousMonthBudgetAction,
  createBudgetAction,
  upsertBudgetLineAction,
} from './actions'
import { HandCoins, PieChart, Plus, Target, Wallet } from 'lucide-react'
import { BudgetLineRow } from './budget-line-row'
import { buttonVariants } from '@/components/ui/button'
import { AmountInput } from '@/components/amount-input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { MetricCard } from '@/components/metric-card'
import { MonthNav } from '@/components/month-nav'
import { PageHeader } from '@/components/page-header'
import { InfoTooltip } from '@/components/info-tooltip'
import { SectionHeading } from '@/components/section-heading'
import { Callout } from '@/components/callout'
import { SubmitButton } from '@/components/submit-button'
import { createClient } from '@/lib/supabase/server'
import { getLocale } from '@/lib/i18n/server'
import { translate } from '@/lib/i18n/translate'

type BudgetsPageProps = {
  searchParams: Promise<{
    month?: string
    error?: string
    created?: string
    lineUpdated?: string
    lineRemoved?: string
    copied?: string
    mode?: string
    edit?: string
  }>
}

type BudgetDetailRow = {
  budget_id: string
  household_id: string
  budget_month: string
  budget_status: string
  currency_code: string
  line_id: string | null
  category_id: string | null
  category_name: string | null
  parent_category_id: string | null
  category_is_archived: boolean | null
  category_exclude_from_budget: boolean | null
  category_exclude_from_reports: boolean | null
  planned_amount: number | string | null
  actual_amount: number | string | null
  transaction_count: number | string | null
}

type Category = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
  is_archived: boolean
  exclude_from_budget: boolean
  exclude_from_reports: boolean
  sort_order: number | null
}

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function currentMonthParam() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function parseBudgetMonth(month: string | undefined) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return currentMonthParam()
  const parsedDate = new Date(`${month}-01T00:00:00.000Z`)
  if (Number.isNaN(parsedDate.getTime())) return currentMonthParam()
  return month
}

function previousMonthParam(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const previous = new Date(Date.UTC(year, monthNumber - 1, 1))
  previous.setUTCMonth(previous.getUTCMonth() - 1)
  const previousYear = previous.getUTCFullYear()
  const previousMonth = String(previous.getUTCMonth() + 1).padStart(2, '0')
  return `${previousYear}-${previousMonth}`
}

function budgetsPath({
  month,
  mode,
  edit,
}: {
  month: string
  mode?: 'addLine'
  edit?: string
}) {
  const params = new URLSearchParams({ month })
  if (mode) params.set('mode', mode)
  if (edit) params.set('edit', edit)
  return `/dashboard/budgets?${params.toString()}`
}

function formatCurrency(value: number, currencyCode: string) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currencyCode,
  }).format(value)
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1)
  )
}

function formatPercent(value: number | null) {
  if (value === null) return 'N/A'
  return new Intl.NumberFormat('en-CA', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

function getCategoryPath(
  category: { name: string; parent_category_id: string | null },
  categoriesById: Map<string, { name: string }>
) {
  const parentName = category.parent_category_id
    ? categoriesById.get(category.parent_category_id)?.name
    : null
  return parentName ? `${parentName} / ${category.name}` : category.name
}

export default async function BudgetsPage({ searchParams }: BudgetsPageProps) {
  const params = await searchParams
  const locale = await getLocale()
  const selectedMonth = parseBudgetMonth(params.month)
  const selectedMonthDate = `${selectedMonth}-01`
  const previousMonth = previousMonthParam(selectedMonth)
  const previousMonthDate = `${previousMonth}-01`
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const created = params.created === '1'
  const lineUpdated = params.lineUpdated === '1'
  const lineRemoved = params.lineRemoved === '1'
  const copiedCount = typeof params.copied === 'string' ? Number(params.copied) : null
  const isAddingLine = params.mode === 'addLine'
  const editLineId = typeof params.edit === 'string' ? params.edit : null

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

  const { data: budgetRows, error: budgetError } = await supabase.rpc(
    'get_monthly_budget_details',
    {
      p_household_id: household.id,
      p_budget_month: selectedMonthDate,
    }
  )

  const { data: categoryRows, error: categoriesError } = await supabase
    .from('categories')
    .select(
      'id, name, category_type, reporting_type, parent_category_id, is_archived, exclude_from_budget, exclude_from_reports, sort_order'
    )
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  const { data: previousBudget } = await supabase
    .from('budgets')
    .select('id')
    .eq('household_id', household.id)
    .eq('budget_month', previousMonthDate)
    .is('deleted_at', null)
    .maybeSingle()

  const hasPreviousBudget = Boolean(previousBudget)
  const allCategories = (categoryRows ?? []) as Category[]
  const categoriesById = new Map(allCategories.map((c) => [c.id, c]))
  const budgetDetails = (budgetRows ?? []) as BudgetDetailRow[]
  const budget = budgetDetails[0] ?? null
  const budgetLines = budgetDetails.filter((row) => row.line_id)
  const lineCategoryIds = new Set(
    budgetLines
      .map((line) => line.category_id)
      .filter((id): id is string => Boolean(id))
  )
  const categoryOptions = allCategories.filter(
    (c) =>
      c.category_type === 'expense' &&
      !c.is_archived &&
      !c.exclude_from_budget &&
      !lineCategoryIds.has(c.id)
  )
  const selectedEditLine = editLineId
    ? budgetLines.find((line) => line.line_id === editLineId && line.category_id) ?? null
    : null
  const budgetCurrency = budget?.currency_code ?? household.base_currency
  const totalBudgeted = budgetLines.reduce((sum, l) => sum + Number(l.planned_amount ?? 0), 0)
  const totalSpent = budgetLines.reduce((sum, l) => sum + Number(l.actual_amount ?? 0), 0)
  const remaining = totalBudgeted - totalSpent
  const percentUsed = totalBudgeted > 0 ? totalSpent / totalBudgeted : null

  const cancelHref = budgetsPath({ month: selectedMonth })

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow={household.name}
        title={
          <span className="flex items-center gap-1.5">
            Budgets
            <InfoTooltip term="allocations" label="Budgets" />
          </span>
        }
        description={formatMonthLabel(selectedMonth)}
        actions={
          <>
            <MonthNav
              month={selectedMonth}
              basePath="/dashboard/budgets"
              previousLabel={translate(locale, 'common.previousMonth')}
              nextLabel={translate(locale, 'common.nextMonth')}
            />

            {!budgetError && budget && hasPreviousBudget ? (
              <form action={copyPreviousMonthBudgetAction}>
                <input type="hidden" name="month" value={selectedMonth} />
                <SubmitButton type="submit" variant="outline" size="sm" pendingText="Copying…">
                  Copy previous month
                </SubmitButton>
              </form>
            ) : null}

            {!budgetError && budget && categoryOptions.length > 0 ? (
              <Link
                href={budgetsPath({ month: selectedMonth, mode: 'addLine' })}
                className={buttonVariants({ size: 'sm' })}
              >
                <Plus aria-hidden="true" />
                Add budget line
              </Link>
            ) : null}
          </>
        }
      />

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}
      {budgetError || categoriesError ? (
        <Callout variant="error">Could not load budget data.</Callout>
      ) : null}
      {created ? <Callout variant="success">Budget created.</Callout> : null}
      {lineUpdated ? <Callout variant="success">Budget line saved.</Callout> : null}
      {lineRemoved ? <Callout variant="info">Budget line removed.</Callout> : null}
      {copiedCount !== null && Number.isFinite(copiedCount) ? (
        <Callout variant="info">
          {copiedCount > 0
            ? `${copiedCount} budget line${copiedCount === 1 ? '' : 's'} copied from the previous month.`
            : 'No previous-month lines were available to copy, or this budget already has them.'}
        </Callout>
      ) : null}

      {/* ── No budget for this month ────────────────────────────────────── */}
      {!budgetError && !budget ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
          <p className="font-medium">No budget for {formatMonthLabel(selectedMonth)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a budget to start planning expenses for this month.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <form action={createBudgetAction}>
              <input type="hidden" name="month" value={selectedMonth} />
              <SubmitButton type="submit" pendingText="Creating…">
                Create budget
              </SubmitButton>
            </form>
            {hasPreviousBudget ? (
              <form action={copyPreviousMonthBudgetAction}>
                <input type="hidden" name="month" value={selectedMonth} />
                <SubmitButton type="submit" variant="secondary" pendingText="Copying…">
                  Copy previous month
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      {!budgetError && budget ? (
        <>
          {/* ── Summary cards ────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Total budgeted"
              value={formatCurrency(totalBudgeted, budgetCurrency)}
              description="Planned expense budget"
              icon={<Target />}
              accent="bg-primary/10 text-primary"
            />
            <MetricCard
              label="Total spent"
              value={formatCurrency(totalSpent, budgetCurrency)}
              description="Posted expense actuals"
              icon={<HandCoins />}
              accent="bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
            />
            <MetricCard
              label="Remaining"
              value={formatCurrency(remaining, budgetCurrency)}
              description="Budgeted minus spent"
              icon={<Wallet />}
              accent="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
              valueClassName={remaining < 0 ? 'text-red-600 dark:text-red-400' : undefined}
            />
            <MetricCard
              label="Percent used"
              value={formatPercent(percentUsed)}
              description="Spent divided by budgeted"
              icon={<PieChart />}
              accent="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400"
            />
          </div>

          {/* ── Dialogs ──────────────────────────────────────────────────── */}
          {isAddingLine ? (
            <FormDialog
              title="Add budget line"
              description="Add an expense category that is not already budgeted."
              cancelHref={cancelHref}
            >
              {categoryOptions.length === 0 ? (
                <Callout variant="info" className="border-dashed text-muted-foreground">
                  No available categories to add. Categories already budgeted, archived, or
                  excluded from budgets will not appear here.
                </Callout>
              ) : (
                <form action={upsertBudgetLineAction} className="space-y-4">
                  <input type="hidden" name="month" value={selectedMonth} />
                  <input type="hidden" name="budget_id" value={budget.budget_id} />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="category_id">Category</Label>
                      <select
                        id="category_id"
                        name="category_id"
                        defaultValue=""
                        required
                        className={selectClassName}
                      >
                        <option value="" disabled>
                          Select category
                        </option>
                        {categoryOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {getCategoryPath(c, categoriesById)}
                            {c.exclude_from_reports ? ' · no reports' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="planned_amount">Planned amount</Label>
                      <AmountInput
                        id="planned_amount"
                        name="planned_amount"
                        currencyCode={budgetCurrency}
                        required
                      />
                    </div>
                  </div>

                  <SubmitButton type="submit" pendingText="Adding…">
                    Add line
                  </SubmitButton>
                </form>
              )}
            </FormDialog>
          ) : null}

          {selectedEditLine ? (
            <FormDialog
              title="Edit budget line"
              description="Update the planned amount for this category."
              cancelHref={cancelHref}
            >
              <form action={upsertBudgetLineAction} className="space-y-4">
                <input type="hidden" name="month" value={selectedMonth} />
                <input type="hidden" name="budget_id" value={budget.budget_id} />
                <input type="hidden" name="category_id" value={selectedEditLine.category_id ?? ''} />

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-medium">
                    {selectedEditLine.category_id
                      ? getCategoryPath(
                          categoriesById.get(selectedEditLine.category_id) ?? {
                            name: selectedEditLine.category_name ?? 'Unknown',
                            parent_category_id: null,
                          },
                          categoriesById
                        )
                      : selectedEditLine.category_name ?? 'Unknown category'}
                  </p>
                </div>

                <div className="space-y-2 sm:max-w-xs">
                  <Label htmlFor={`planned_${selectedEditLine.line_id}`}>Planned amount</Label>
                  <AmountInput
                    id={`planned_${selectedEditLine.line_id}`}
                    name="planned_amount"
                    currencyCode={budgetCurrency}
                    defaultValue={Number(selectedEditLine.planned_amount ?? 0).toFixed(2)}
                    required
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Actual spending is calculated from posted expense transactions and cannot be
                  edited here.
                </p>

                <SubmitButton type="submit" pendingText="Saving…">
                  Save line
                </SubmitButton>
              </form>
            </FormDialog>
          ) : null}

          {/* ── Budget lines ─────────────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionHeading
              title="Budget lines"
              description={`Planned vs actual for ${formatMonthLabel(selectedMonth)}.`}
            />

            {budgetLines.length ? (
              <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
                {budgetLines.map((line) => {
                  const category = line.category_id ? categoriesById.get(line.category_id) : null
                  const categoryName = category
                    ? getCategoryPath(category, categoriesById)
                    : line.category_name ?? 'Unknown category'

                  return (
                    <BudgetLineRow
                      key={line.line_id}
                      line={line}
                      categoryName={categoryName}
                      budgetCurrency={budgetCurrency}
                      selectedMonth={selectedMonth}
                      editHref={budgetsPath({ month: selectedMonth, edit: line.line_id ?? '' })}
                    />
                  )
                })}
              </div>
            ) : (
              <EmptyState
                title="No budget lines yet"
                description="Add a budget line to start planning this month's expenses."
                actionHref={budgetsPath({ month: selectedMonth, mode: 'addLine' })}
                actionLabel="Add budget line"
              />
            )}
          </section>
        </>
      ) : null}
    </main>
  )
}
