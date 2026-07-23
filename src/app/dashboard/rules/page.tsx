import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Plus, Zap } from 'lucide-react'
import { RuleForm, type RuleFormValues } from './rule-form'
import { RuleRow, type RuleVM } from './rule-row'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { PageHeader } from '@/components/page-header'
import { InfoTooltip } from '@/components/info-tooltip'
import { Callout } from '@/components/callout'
import { cn } from '@/lib/utils'
import type { RuleMatchField, RuleOperator } from '@/lib/rules/match'

type RulesPageProps = {
  searchParams: Promise<{
    created?: string
    updated?: string
    deleted?: string
    mode?: string
    edit?: string
    error?: string
  }>
}

type RuleRowData = {
  id: string
  name: string | null
  match_field: RuleMatchField
  operator: RuleOperator
  match_value: string
  category_id: string
  priority: number | string
  is_active: boolean
  created_at: string
}

type CategoryData = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
  is_archived: boolean
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

function rulesPath({
  mode,
  edit,
}: { mode?: 'create'; edit?: string } = {}) {
  const params = new URLSearchParams()
  if (mode) params.set('mode', mode)
  if (edit) params.set('edit', edit)
  const qs = params.toString()
  return `/dashboard/rules${qs ? `?${qs}` : ''}`
}

export default async function RulesPage({ searchParams }: RulesPageProps) {
  const params = await searchParams
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const isCreating = params.mode === 'create'
  const editRuleId =
    typeof params.edit === 'string' && !isCreating ? params.edit : null

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
    .select('id, name')
    .eq('id', profile.default_household_id)
    .single()
  if (householdError || !household) redirect('/onboarding')

  const { data: ruleData, error: rulesError } = await supabase
    .from('categorization_rules')
    .select(
      'id, name, match_field, operator, match_value, category_id, priority, is_active, created_at'
    )
    .eq('household_id', household.id)
    .order('is_active', { ascending: false })
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })

  const { data: categoryData } = await supabase
    .from('categories')
    .select(
      'id, name, category_type, reporting_type, parent_category_id, is_archived'
    )
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .order('parent_category_id', { ascending: true, nullsFirst: true })
    .order('name', { ascending: true })

  const allCategories = (categoryData ?? []) as CategoryData[]
  const categoriesById = new Map(allCategories.map((c) => [c.id, c]))
  const categoryLabelById = new Map(
    allCategories.map((c) => [c.id, getCategoryPath(c, categoriesById)])
  )

  // Form options: active income/expense categories only.
  const categoryOptions = allCategories
    .filter(
      (c) =>
        !c.is_archived &&
        (c.category_type === 'income' || c.category_type === 'expense')
    )
    .map((c) => ({ id: c.id, label: categoryLabelById.get(c.id) ?? c.name }))

  const allRules = (ruleData ?? []) as RuleRowData[]
  const rows: RuleVM[] = allRules.map((r) => ({
    id: r.id,
    name: r.name,
    matchField: r.match_field,
    operator: r.operator,
    matchValue: r.match_value,
    categoryLabel: categoryLabelById.get(r.category_id) ?? 'Unknown category',
    priority: Number(r.priority ?? 100),
    isActive: r.is_active,
    editHref: rulesPath({ edit: r.id }),
  }))

  const activeCount = rows.filter((r) => r.isActive).length

  const selectedEditRuleData = allRules.find((r) => r.id === editRuleId) ?? null
  const selectedEditRule: RuleFormValues | null = selectedEditRuleData
    ? {
        id: selectedEditRuleData.id,
        name: selectedEditRuleData.name,
        matchField: selectedEditRuleData.match_field,
        operator: selectedEditRuleData.operator,
        matchValue: selectedEditRuleData.match_value,
        categoryId: selectedEditRuleData.category_id,
        priority: Number(selectedEditRuleData.priority ?? 100),
        isActive: selectedEditRuleData.is_active,
      }
    : null
  const cancelHref = rulesPath()

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      {/* ── Header (desktop) ───────────────────────────────────────────── */}
      <PageHeader
        className="hidden md:flex"
        eyebrow={household.name}
        title={
          <span className="flex items-center gap-1.5">
            Categorization rules
            <InfoTooltip
              label="Categorization rules"
              text="Rules auto-assign a category to imported transactions when the description, merchant, amount, or account matches. The highest-priority matching rule wins."
            />
          </span>
        }
        description="Automate how imported transactions get categorized."
        actions={
          <Link
            href={rulesPath({ mode: 'create' })}
            className={buttonVariants({ size: 'sm' })}
          >
            <Plus aria-hidden="true" />
            New rule
          </Link>
        }
      />

      {/* ── Header (mobile) ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 md:hidden">
        <Link
          href="/dashboard/more"
          className={buttonVariants({ variant: 'outline', size: 'icon' })}
          aria-label="Back to More"
        >
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold leading-tight">Rules</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            Auto-categorize imports
          </p>
        </div>
        <Link
          href={rulesPath({ mode: 'create' })}
          className={buttonVariants({ size: 'sm' })}
        >
          <Plus aria-hidden="true" />
          New
        </Link>
      </div>

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}
      {params.created === '1' ? (
        <Callout variant="success">Rule created.</Callout>
      ) : null}
      {params.updated === '1' ? (
        <Callout variant="success">Rule updated.</Callout>
      ) : null}
      {params.deleted === '1' ? (
        <Callout variant="success">Rule deleted.</Callout>
      ) : null}

      {categoryOptions.length === 0 ? (
        <Callout variant="warning">
          Add an income or expense category first — rules need a category to
          apply.
        </Callout>
      ) : null}

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      {isCreating && categoryOptions.length > 0 ? (
        <FormDialog
          title="New rule"
          description="Auto-categorize matching transactions on import."
          cancelHref={cancelHref}
          wide
        >
          <RuleForm
            mode="create"
            categories={categoryOptions}
            cancelHref={cancelHref}
          />
        </FormDialog>
      ) : null}

      {selectedEditRule ? (
        <FormDialog
          title="Edit rule"
          description="Update how this rule matches and categorizes."
          cancelHref={cancelHref}
          wide
        >
          <RuleForm
            mode="edit"
            rule={selectedEditRule}
            categories={categoryOptions}
            cancelHref={cancelHref}
          />
        </FormDialog>
      ) : null}

      {/* ── Rules list ─────────────────────────────────────────────────── */}
      {rulesError ? (
        <Callout variant="error">Could not load rules. Try refreshing.</Callout>
      ) : rows.length ? (
        <>
          <p className="px-1 text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'rule' : 'rules'} · {activeCount}{' '}
            active
          </p>
          <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
            {rows.map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          title="No rules yet"
          description="Create a rule to automatically categorize transactions during CSV import — for example, file anything whose merchant contains “Uber” under Transport."
          actionHref={
            categoryOptions.length > 0 ? rulesPath({ mode: 'create' }) : undefined
          }
          actionLabel={categoryOptions.length > 0 ? 'New rule' : undefined}
        />
      )}

      <p
        className={cn(
          'flex items-center gap-1.5 px-1 text-xs text-muted-foreground'
        )}
      >
        <Zap className="size-3.5" aria-hidden="true" />
        Rules apply to CSV imports today. Manual entry still lets you pick any
        category.
      </p>
    </main>
  )
}
