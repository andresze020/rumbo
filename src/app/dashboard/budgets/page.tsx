import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  copyPreviousMonthBudgetAction,
  createBudgetAction,
  deleteBudgetLineAction,
  upsertBudgetLineAction,
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
import { EmptyState } from '@/components/empty-state'
import { SubmitButton } from '@/components/submit-button'
import { createClient } from '@/lib/supabase/server'

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

const NEAR_LIMIT_THRESHOLD = 0.8

function currentMonthParam() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}

function parseBudgetMonth(month: string | undefined) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return currentMonthParam()
  }

  const parsedDate = new Date(`${month}-01T00:00:00.000Z`)

  if (Number.isNaN(parsedDate.getTime())) {
    return currentMonthParam()
  }

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

  if (mode) {
    params.set('mode', mode)
  }

  if (edit) {
    params.set('edit', edit)
  }

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

  return new Intl.DateTimeFormat('en-CA', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthNumber - 1, 1))
}

function formatPercent(value: number | null) {
  if (value === null) {
    return 'N/A'
  }

  return new Intl.NumberFormat('en-CA', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

function formatValue(value: string) {
  return value.replaceAll('_', ' ')
}

function formatTransactionCount(count: number) {
  return `${count} transaction${count === 1 ? '' : 's'}`
}

function getLineStatus(plannedAmount: number, actualAmount: number) {
  if (actualAmount > plannedAmount) {
    return { label: 'Over budget', variant: 'destructive' as const }
  }

  if (
    plannedAmount > 0 &&
    actualAmount / plannedAmount >= NEAR_LIMIT_THRESHOLD
  ) {
    return { label: 'Near limit', variant: 'secondary' as const }
  }

  return { label: 'On track', variant: 'outline' as const }
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

function AddBudgetLineForm({
  budgetId,
  selectedMonth,
  categoryOptions,
  categoriesById,
}: {
  budgetId: string
  selectedMonth: string
  categoryOptions: Category[]
  categoriesById: Map<string, Category>
}) {
  if (!categoryOptions.length) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No available categories to add. Categories already budgeted,
          archived, or excluded from budgets will not appear here.
        </p>
        <Link
          href={budgetsPath({ month: selectedMonth })}
          className={buttonVariants({ variant: 'outline' })}
        >
          Cancel
        </Link>
      </div>
    )
  }

  return (
    <form action={upsertBudgetLineAction} className="space-y-4">
      <input type="hidden" name="month" value={selectedMonth} />
      <input type="hidden" name="budget_id" value={budgetId} />

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
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {getCategoryPath(category, categoriesById)}
                {category.exclude_from_reports ? ' · no reports' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="planned_amount">Planned amount</Label>
          <Input
            id="planned_amount"
            name="planned_amount"
            type="number"
            min="0"
            step="0.01"
            required
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton type="submit" pendingText="Adding line">
          Add line
        </SubmitButton>
        <Link
          href={budgetsPath({ month: selectedMonth })}
          className={buttonVariants({ variant: 'outline' })}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}

function EditBudgetLineForm({
  budgetId,
  selectedMonth,
  line,
  categoriesById,
}: {
  budgetId: string
  selectedMonth: string
  line: BudgetDetailRow
  categoriesById: Map<string, Category>
}) {
  const plannedAmount = Number(line.planned_amount ?? 0)
  const category = line.category_id
    ? categoriesById.get(line.category_id)
    : null
  const categoryName = category
    ? getCategoryPath(category, categoriesById)
    : line.category_name || 'Unknown category'

  return (
    <form action={upsertBudgetLineAction} className="space-y-4">
      <input type="hidden" name="month" value={selectedMonth} />
      <input type="hidden" name="budget_id" value={budgetId} />
      <input type="hidden" name="category_id" value={line.category_id ?? ''} />

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Category</p>
        <p className="font-medium">{categoryName}</p>
      </div>

      <div className="space-y-2 sm:max-w-xs">
        <Label htmlFor={`planned_${line.line_id}`}>Planned amount</Label>
        <Input
          id={`planned_${line.line_id}`}
          name="planned_amount"
          type="number"
          min="0"
          step="0.01"
          defaultValue={plannedAmount}
          required
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Actual spending stays calculated from posted expense transactions and
        cannot be edited here.
      </p>

      <div className="flex flex-wrap gap-2">
        <SubmitButton type="submit" pendingText="Saving line">
          Save line
        </SubmitButton>
        <Link
          href={budgetsPath({ month: selectedMonth })}
          className={buttonVariants({ variant: 'outline' })}
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}

export default async function BudgetsPage({ searchParams }: BudgetsPageProps) {
  const params = await searchParams
  const selectedMonth = parseBudgetMonth(params.month)
  const selectedMonthDate = `${selectedMonth}-01`
  const previousMonth = previousMonthParam(selectedMonth)
  const previousMonthDate = `${previousMonth}-01`
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const created = params.created === '1'
  const lineUpdated = params.lineUpdated === '1'
  const lineRemoved = params.lineRemoved === '1'
  const copiedCount =
    typeof params.copied === 'string' ? Number(params.copied) : null
  const isAddingLine = params.mode === 'addLine'
  const editLineId = typeof params.edit === 'string' ? params.edit : null
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
  const categoriesById = new Map(
    allCategories.map((category) => [category.id, category])
  )
  const budgetDetails = (budgetRows ?? []) as BudgetDetailRow[]
  const budget = budgetDetails[0] ?? null
  const budgetLines = budgetDetails.filter((row) => row.line_id)
  const lineCategoryIds = new Set(
    budgetLines
      .map((line) => line.category_id)
      .filter((categoryId): categoryId is string => Boolean(categoryId))
  )
  const categoryOptions = allCategories.filter(
    (category) =>
      category.category_type === 'expense' &&
      !category.is_archived &&
      !category.exclude_from_budget &&
      !lineCategoryIds.has(category.id)
  )
  const selectedEditLine = editLineId
    ? budgetLines.find(
        (line) => line.line_id === editLineId && line.category_id
      ) ?? null
    : null
  const budgetCurrency = budget?.currency_code ?? household.base_currency
  const totalBudgeted = budgetLines.reduce(
    (total, line) => total + Number(line.planned_amount ?? 0),
    0
  )
  const totalSpent = budgetLines.reduce(
    (total, line) => total + Number(line.actual_amount ?? 0),
    0
  )
  const remaining = totalBudgeted - totalSpent
  const percentUsed = totalBudgeted > 0 ? totalSpent / totalBudgeted : null
  const summaryCards = [
    {
      label: 'Total budgeted',
      value: formatCurrency(totalBudgeted, budgetCurrency),
      description: 'Planned expense budget',
    },
    {
      label: 'Total spent',
      value: formatCurrency(totalSpent, budgetCurrency),
      description: 'Posted expense actuals',
    },
    {
      label: 'Remaining',
      value: formatCurrency(remaining, budgetCurrency),
      description: 'Budgeted minus spent',
    },
    {
      label: 'Percent used',
      value: formatPercent(percentUsed),
      description: 'Spent divided by budgeted',
    },
  ]

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{household.name}</p>
          <h1 className="text-2xl font-semibold tracking-normal">Budgets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatMonthLabel(selectedMonth)}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          <form
            action="/dashboard/budgets"
            className="flex flex-wrap items-end gap-2"
          >
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

          {!budgetError && budget && hasPreviousBudget ? (
            <form action={copyPreviousMonthBudgetAction}>
              <input type="hidden" name="month" value={selectedMonth} />
              <SubmitButton
                type="submit"
                variant="secondary"
                pendingText="Copying lines"
              >
                Copy previous month
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {budgetError || categoriesError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load budget data.
        </div>
      ) : null}

      {created ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Budget created.
        </div>
      ) : null}

      {lineUpdated ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Budget line saved.
        </div>
      ) : null}

      {lineRemoved ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Budget line removed.
        </div>
      ) : null}

      {copiedCount !== null && Number.isFinite(copiedCount) ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          {copiedCount > 0
            ? `${copiedCount} budget line${copiedCount === 1 ? '' : 's'} copied from the previous month.`
            : 'No previous-month lines were available to copy, or this budget already has them.'}
        </div>
      ) : null}

      {!budgetError && !budget ? (
        <Card>
          <CardHeader>
            <CardTitle>No budget for this month</CardTitle>
            <CardDescription>
              No budget exists for this month yet. Create one to start planning
              expenses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <form action={createBudgetAction}>
                <input type="hidden" name="month" value={selectedMonth} />
                <SubmitButton type="submit" pendingText="Creating budget">
                  Create budget
                </SubmitButton>
              </form>

              {hasPreviousBudget ? (
                <form action={copyPreviousMonthBudgetAction}>
                  <input type="hidden" name="month" value={selectedMonth} />
                  <SubmitButton
                    type="submit"
                    variant="secondary"
                    pendingText="Copying lines"
                  >
                    Copy previous month
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!budgetError && budget ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((summary) => (
              <Card key={summary.label}>
                <CardHeader>
                  <CardTitle>{summary.label}</CardTitle>
                  <CardDescription>{summary.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-semibold">{summary.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {isAddingLine ? (
            <Card>
              <CardHeader>
                <CardTitle>Add budget line</CardTitle>
                <CardDescription>
                  Add an expense category that is not already budgeted.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AddBudgetLineForm
                  budgetId={budget.budget_id}
                  selectedMonth={selectedMonth}
                  categoryOptions={categoryOptions}
                  categoriesById={categoriesById}
                />
              </CardContent>
            </Card>
          ) : null}

          {selectedEditLine ? (
            <Card>
              <CardHeader>
                <CardTitle>Edit budget line</CardTitle>
                <CardDescription>
                  Update the planned amount for this category.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EditBudgetLineForm
                  budgetId={budget.budget_id}
                  selectedMonth={selectedMonth}
                  line={selectedEditLine}
                  categoriesById={categoriesById}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Budget lines</CardTitle>
                  <CardDescription>
                    Planned amounts compared with posted expense actuals.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {formatValue(budget.budget_status)}
                  </Badge>
                  {categoryOptions.length ? (
                    <Link
                      href={budgetsPath({ month: selectedMonth, mode: 'addLine' })}
                      className={buttonVariants({ size: 'sm' })}
                    >
                      Add budget line
                    </Link>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {budgetLines.length ? (
                <div className="divide-y rounded-lg border">
                  {budgetLines.map((line) => {
                    const plannedAmount = Number(line.planned_amount ?? 0)
                    const actualAmount = Number(line.actual_amount ?? 0)
                    const lineRemaining = plannedAmount - actualAmount
                    const linePercent =
                      plannedAmount > 0 ? actualAmount / plannedAmount : null
                    const status = getLineStatus(plannedAmount, actualAmount)
                    const category = line.category_id
                      ? categoriesById.get(line.category_id)
                      : null
                    const categoryName = category
                      ? getCategoryPath(category, categoriesById)
                      : line.category_name || 'Unknown category'

                    return (
                      <div key={line.line_id} className="space-y-4 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="font-medium">{categoryName}</h2>
                              {line.category_is_archived ? (
                                <Badge variant="outline">archived</Badge>
                              ) : null}
                              {line.category_exclude_from_budget ? (
                                <Badge variant="outline">excluded</Badge>
                              ) : null}
                              {line.category_exclude_from_reports ? (
                                <Badge variant="outline">no reports</Badge>
                              ) : null}
                              <Badge variant={status.variant}>
                                {status.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {formatTransactionCount(
                                Number(line.transaction_count ?? 0)
                              )}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {line.category_id ? (
                              <Link
                                href={budgetsPath({
                                  month: selectedMonth,
                                  edit: line.line_id ?? '',
                                })}
                                className={buttonVariants({
                                  variant: 'outline',
                                  size: 'sm',
                                })}
                              >
                                Edit
                              </Link>
                            ) : null}

                            <form action={deleteBudgetLineAction}>
                              <input
                                type="hidden"
                                name="month"
                                value={selectedMonth}
                              />
                              <input
                                type="hidden"
                                name="line_id"
                                value={line.line_id ?? ''}
                              />
                              <SubmitButton
                                type="submit"
                                variant="outline"
                                size="sm"
                                pendingText="Removing"
                              >
                                Remove
                              </SubmitButton>
                            </form>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-4">
                          <div className="rounded-lg bg-muted/40 p-3">
                            <p className="text-xs text-muted-foreground">
                              Planned
                            </p>
                            <p className="mt-1 font-medium">
                              {formatCurrency(plannedAmount, budgetCurrency)}
                            </p>
                          </div>

                          <div className="rounded-lg bg-muted/40 p-3">
                            <p className="text-xs text-muted-foreground">
                              Actual
                            </p>
                            <p className="mt-1 font-medium">
                              {formatCurrency(actualAmount, budgetCurrency)}
                            </p>
                          </div>

                          <div className="rounded-lg bg-muted/40 p-3">
                            <p className="text-xs text-muted-foreground">
                              Remaining
                            </p>
                            <p className="mt-1 font-medium">
                              {formatCurrency(lineRemaining, budgetCurrency)}
                            </p>
                          </div>

                          <div className="rounded-lg bg-muted/40 p-3">
                            <p className="text-xs text-muted-foreground">
                              Used
                            </p>
                            <p className="mt-1 font-medium">
                              {formatPercent(linePercent)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <EmptyState
                  title="This budget has no lines yet"
                  description="Use the Add budget line button above to start planning this month."
                />
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Link
        href="/dashboard"
        className={buttonVariants({ variant: 'outline', className: 'w-fit' })}
      >
        Back to dashboard
      </Link>
    </main>
  )
}
