import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Copy,
  Gauge,
  HandCoins,
  Plus,
  Target,
  Wallet,
} from 'lucide-react'
import {
  copyPreviousMonthBudgetAction,
  createBudgetAction,
  upsertBudgetLineAction,
} from './actions'
import { BudgetLineRow } from './budget-line-row'
import { buttonVariants } from '@/components/ui/button'
import { AmountInput } from '@/components/amount-input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { MonthNav } from '@/components/month-nav'
import { PageHeader } from '@/components/page-header'
import { InfoTooltip } from '@/components/info-tooltip'
import { SectionHeading } from '@/components/section-heading'
import { Callout } from '@/components/callout'
import { SubmitButton } from '@/components/submit-button'
import { createClient } from '@/lib/supabase/server'
import { getLocale } from '@/lib/i18n/server'
import { translate } from '@/lib/i18n/translate'
import { formatCurrency, formatMonthLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { nativeSelectCls } from '@/lib/form-styles'

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
  icon: string | null
  color: string | null
}

const selectClassName = nativeSelectCls

const fallbackLineColors = [
  '#4f63e0',
  '#d65450',
  '#1f9d63',
  '#2f86c2',
  '#c98a2b',
  '#e05fa0',
  '#8b5cf6',
]

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

function formatPercent(value: number | null) {
  if (value === null) return 'N/A'
  return new Intl.NumberFormat('en-CA', {
    style: 'percent',
    minimumFractionDigits: 0,
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

function getUsageTone(percentUsed: number | null) {
  if (percentUsed === null)
    return {
      label: 'No lines',
      valueClassName: 'text-muted-foreground',
      barClassName: 'bg-muted-foreground',
    }
  if (percentUsed > 1)
    return {
      label: 'Over budget',
      valueClassName: 'text-destructive',
      barClassName: 'bg-destructive',
    }
  if (percentUsed >= 0.85)
    return {
      label: 'Near limit',
      valueClassName: 'text-amber-600 dark:text-amber-400',
      barClassName: 'bg-amber-500',
    }
  return {
    label: 'On track',
    valueClassName: 'text-emerald-600 dark:text-emerald-400',
    barClassName: 'bg-emerald-500',
  }
}

function BudgetKpiCard({
  label,
  value,
  description,
  icon,
  accent,
  valueClassName,
  progress,
}: {
  label: string
  value: string
  description: string
  icon: ReactNode
  accent: string
  valueClassName?: string
  progress?: { width: number; className: string }
}) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm shadow-black/[0.03] md:p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
            accent
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
        <p className="min-w-0 truncate text-[11px] font-medium text-muted-foreground md:text-xs">
          {label}
        </p>
      </div>
      <p
        className={cn(
          'mt-3 break-words font-mono text-base font-bold tabular-nums md:text-xl',
          valueClassName
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10.5px] text-muted-foreground md:text-xs">{description}</p>
      {progress ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all', progress.className)}
            style={{ width: `${progress.width}%` }}
          />
        </div>
      ) : null}
    </div>
  )
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
      'id, name, category_type, reporting_type, parent_category_id, is_archived, exclude_from_budget, exclude_from_reports, sort_order, icon, color'
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
  const usageTone = getUsageTone(percentUsed)
  const usageWidth = percentUsed !== null ? Math.min(Math.round(percentUsed * 100), 100) : 0
  const overBudgetCount = budgetLines.filter(
    (line) => Number(line.actual_amount ?? 0) > Number(line.planned_amount ?? 0)
  ).length

  const cancelHref = budgetsPath({ month: selectedMonth })
  const canAddLine = Boolean(!budgetError && budget && categoryOptions.length > 0)
  const canCopyPrevious = Boolean(!budgetError && budget && hasPreviousBudget)

  const addLineHref = budgetsPath({ month: selectedMonth, mode: 'addLine' })

  function renderCopyPreviousForm() {
    if (!canCopyPrevious) return null

    return (
      <form action={copyPreviousMonthBudgetAction}>
        <input type="hidden" name="month" value={selectedMonth} />
        <SubmitButton type="submit" variant="outline" size="sm" pendingText="Copying...">
          <Copy aria-hidden="true" />
          Copy previous
        </SubmitButton>
      </form>
    )
  }

  function renderAddLineButton(label = 'Add line') {
    if (!canAddLine) return null

    return (
      <Link
        href={addLineHref}
        className={cn(
          buttonVariants({ size: 'sm' }),
          'rounded-full px-3.5 shadow-sm shadow-primary/20'
        )}
      >
        <Plus aria-hidden="true" />
        {label}
      </Link>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 pb-24 sm:gap-6 sm:p-6">
      {/* Header */}
      <PageHeader
        className="hidden md:flex"
        eyebrow={household.name}
        title={
          <span className="flex items-center gap-1.5">
            Budgets
            <InfoTooltip term="allocations" label="Budgets" />
          </span>
        }
        description={`Planned vs actual for ${formatMonthLabel(selectedMonth)}.`}
        actions={
          <>
            <MonthNav
              month={selectedMonth}
              basePath="/dashboard/budgets"
              previousLabel={translate(locale, 'common.previousMonth')}
              nextLabel={translate(locale, 'common.nextMonth')}
            />
          </>
        }
      />

      <div className="flex items-center gap-2 md:hidden">
        <Link
          href="/dashboard/plan"
          className={buttonVariants({ variant: 'outline', size: 'icon' })}
          aria-label="Back to Plan"
        >
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold leading-tight">Budgets</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatMonthLabel(selectedMonth)}
          </p>
        </div>
        {renderAddLineButton('New')}
      </div>

      <div className="md:hidden">
        <MonthNav
          month={selectedMonth}
          basePath="/dashboard/budgets"
          previousLabel={translate(locale, 'common.previousMonth')}
          nextLabel={translate(locale, 'common.nextMonth')}
        />
      </div>

      {/* Notifications */}
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

      {!budgetError && !budget ? (
        <div className="rounded-2xl border border-dashed bg-card/50 p-6 text-center shadow-sm shadow-black/[0.03] md:p-8">
          <p className="font-semibold">No budget for {formatMonthLabel(selectedMonth)}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Create a budget to start planning expenses for this month.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <form action={createBudgetAction}>
              <input type="hidden" name="month" value={selectedMonth} />
              <SubmitButton type="submit" pendingText="Creating...">
                Create budget
              </SubmitButton>
            </form>
            {hasPreviousBudget ? (
              <form action={copyPreviousMonthBudgetAction}>
                <input type="hidden" name="month" value={selectedMonth} />
                <SubmitButton type="submit" variant="secondary" pendingText="Copying...">
                  Copy previous month
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      {!budgetError && budget ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
            <BudgetKpiCard
              label="Total budgeted"
              value={formatCurrency(totalBudgeted, budgetCurrency)}
              description="Planned spend"
              icon={<Target />}
              accent="bg-primary/10 text-primary"
            />
            <BudgetKpiCard
              label="Total spent"
              value={formatCurrency(totalSpent, budgetCurrency)}
              description={`${budgetLines.length} active lines`}
              icon={<HandCoins />}
              accent="bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
              progress={{ width: usageWidth, className: usageTone.barClassName }}
            />
            <BudgetKpiCard
              label="Remaining"
              value={formatCurrency(remaining, budgetCurrency)}
              description={remaining < 0 ? 'Over planned' : 'Still available'}
              icon={<Wallet />}
              accent="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
              valueClassName={remaining < 0 ? 'text-destructive' : undefined}
            />
            <BudgetKpiCard
              label="Usage"
              value={formatPercent(percentUsed)}
              description={usageTone.label}
              icon={<Gauge />}
              accent="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400"
              valueClassName={usageTone.valueClassName}
              progress={{ width: usageWidth, className: usageTone.barClassName }}
            />
          </div>

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
                            {c.icon ? `${c.icon} ` : ''}
                            {getCategoryPath(c, categoriesById)}
                            {c.exclude_from_reports ? ' - no reports' : ''}
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

                  <SubmitButton type="submit" pendingText="Adding...">
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

                <SubmitButton type="submit" pendingText="Saving...">
                  Save line
                </SubmitButton>
              </form>
            </FormDialog>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <SectionHeading
                title="Budget lines"
                description={`${formatMonthLabel(selectedMonth)} - ${overBudgetCount} over budget.`}
              />
              <div className="hidden shrink-0 items-center gap-2 md:flex">
                {renderCopyPreviousForm()}
                {renderAddLineButton()}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3 md:hidden">
                <div>
                  <p className="text-sm font-bold">Lines</p>
                  <p className="text-[11px] text-muted-foreground">
                    Tap a line for actions and details.
                  </p>
                </div>
                {renderCopyPreviousForm()}
              </div>

              {budgetLines.length ? (
                <>
                  <div className="hidden grid-cols-[minmax(11rem,1fr)_minmax(5rem,6.5rem)_minmax(5rem,6.5rem)_minmax(5rem,6.5rem)_minmax(9rem,11rem)_4rem] items-center gap-3 border-b bg-muted/20 px-4 py-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground md:grid">
                    <span>Category</span>
                    <span className="text-right">Planned</span>
                    <span className="text-right">Spent</span>
                    <span className="text-right">Remaining</span>
                    <span className="text-left">Progress</span>
                    <span className="sr-only">Actions</span>
                  </div>
                  <div className="divide-y">
                    {budgetLines.map((line, index) => {
                      const category = line.category_id ? categoriesById.get(line.category_id) : null
                      const categoryName = category
                        ? getCategoryPath(category, categoriesById)
                        : line.category_name ?? 'Unknown category'

                      return (
                        <BudgetLineRow
                          key={line.line_id}
                          line={line}
                          categoryName={categoryName}
                          categoryIcon={category?.icon}
                          categoryColor={category?.color ?? fallbackLineColors[index % fallbackLineColors.length]}
                          budgetCurrency={budgetCurrency}
                          selectedMonth={selectedMonth}
                          editHref={budgetsPath({ month: selectedMonth, edit: line.line_id ?? '' })}
                        />
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="p-6">
                  <EmptyState
                    title="No budget lines yet"
                    description="Add a budget line to start planning this month's expenses."
                    actionHref={addLineHref}
                    actionLabel="Add line"
                  />
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}
