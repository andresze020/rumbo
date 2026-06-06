import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CategoryForm } from './category-form'
import { CategoryRow } from './category-row'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { MetricCard } from '@/components/metric-card'

type CategoriesPageProps = {
  searchParams: Promise<{
    created?: string
    updated?: string
    archived?: string
    unarchived?: string
    showArchived?: string
    categoryType?: string
    mode?: string
    edit?: string
    error?: string
  }>
}

type Category = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
  is_system: boolean
  is_archived: boolean
  exclude_from_budget: boolean
  exclude_from_reports: boolean
  color: string | null
  icon: string | null
  sort_order: number | null
}

type ParentCategoryOption = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
  is_archived: boolean
}

type CategoryHierarchy = {
  childrenByParentId: Map<string, Category[]>
  roots: Category[]
  unparented: Category[]
}

const categoryTypes = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'financial', label: 'Financial' },
  { value: 'adjustment', label: 'Adjustment' },
] as const

type CategoryTypeValue = (typeof categoryTypes)[number]['value']
type CategoryTypeFilter = CategoryTypeValue | 'all'

function isCategoryTypeFilter(value: string): value is CategoryTypeFilter {
  return value === 'all' || categoryTypes.some((t) => t.value === value)
}

function categoriesPath({
  showArchived,
  categoryType,
  mode,
  edit,
}: {
  showArchived?: boolean
  categoryType?: CategoryTypeFilter
  mode?: 'create'
  edit?: string
} = {}) {
  const params = new URLSearchParams()
  if (showArchived) params.set('showArchived', 'true')
  if (categoryType && categoryType !== 'all') params.set('categoryType', categoryType)
  if (mode) params.set('mode', mode)
  if (edit) params.set('edit', edit)
  const qs = params.toString()
  return `/dashboard/categories${qs ? `?${qs}` : ''}`
}

function formatValue(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

function buildCategoryHierarchy(categories: Category[]): CategoryHierarchy {
  const categoryIds = new Set(categories.map((c) => c.id))
  const childrenByParentId = new Map<string, Category[]>()
  const roots: Category[] = []
  const unparented: Category[] = []

  for (const category of categories) {
    if (!category.parent_category_id) {
      roots.push(category)
      continue
    }
    if (!categoryIds.has(category.parent_category_id)) {
      unparented.push(category)
      continue
    }
    const siblings = childrenByParentId.get(category.parent_category_id)
    if (siblings) {
      siblings.push(category)
    } else {
      childrenByParentId.set(category.parent_category_id, [category])
    }
  }

  return { childrenByParentId, roots, unparented }
}

export default async function CategoriesPage({
  searchParams,
}: CategoriesPageProps) {
  const params = await searchParams
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const showArchived = params.showArchived === 'true'
  const categoryTypeFilter =
    typeof params.categoryType === 'string' &&
    isCategoryTypeFilter(params.categoryType)
      ? params.categoryType
      : 'all'
  const isCreating = params.mode === 'create'
  const editCategoryId =
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

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select(
      'id, name, category_type, reporting_type, parent_category_id, is_system, is_archived, exclude_from_budget, exclude_from_reports, color, icon, sort_order'
    )
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .order('category_type', { ascending: true })
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  const allCategories = (categories ?? []) as Category[]
  const categoriesById = new Map(allCategories.map((c) => [c.id, c]))
  const parentCategoryOptions: ParentCategoryOption[] = allCategories.map((c) => ({
    id: c.id,
    name: c.name,
    category_type: c.category_type,
    reporting_type: c.reporting_type,
    parent_category_id: c.parent_category_id,
    is_archived: c.is_archived,
  }))
  const categoriesByIdRecord: Record<string, ParentCategoryOption> =
    Object.fromEntries(categoriesById)

  const displayCategories = (showArchived
    ? allCategories.filter((c) => c.is_archived)
    : allCategories.filter((c) => !c.is_archived)
  ).filter(
    (c) => categoryTypeFilter === 'all' || c.category_type === categoryTypeFilter
  )

  const selectedEditCategory = allCategories.find((c) => c.id === editCategoryId) ?? null

  const rootCount = displayCategories.filter((c) => !c.parent_category_id).length
  const subcategoryCount = displayCategories.length - rootCount
  const systemCount = displayCategories.filter((c) => c.is_system).length
  const excludedCount = displayCategories.filter(
    (c) => c.exclude_from_budget || c.exclude_from_reports
  ).length

  const categoryGroups = categoryTypes
    .filter(
      (t) => categoryTypeFilter === 'all' || t.value === categoryTypeFilter
    )
    .map((t) => ({
      ...t,
      categories: displayCategories.filter((c) => c.category_type === t.value),
    }))
    .filter((g) => g.categories.length > 0)

  const cancelHref = categoriesPath({ showArchived, categoryType: categoryTypeFilter })

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{household.name}</p>
          <h1 className="text-2xl font-semibold tracking-normal">Categories</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage household categories and reporting behavior.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={categoriesPath({
              showArchived,
              categoryType: categoryTypeFilter,
              mode: 'create',
            })}
            className={buttonVariants({ size: 'sm' })}
          >
            Create category
          </Link>
          <Link
            href={categoriesPath({
              showArchived: !showArchived,
              categoryType: categoryTypeFilter,
            })}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Link>
        </div>
      </div>

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      {params.created === '1' ? (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          Category created.
        </div>
      ) : null}
      {params.updated === '1' ? (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          Category updated.
        </div>
      ) : null}
      {params.archived === '1' ? (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          Category archived.
        </div>
      ) : null}
      {params.unarchived === '1' ? (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          Category restored.
        </div>
      ) : null}

      {/* ── Type filter tabs ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {([{ value: 'all' as const, label: 'All' }, ...categoryTypes]).map((filter) => (
          <Link
            key={filter.value}
            href={categoriesPath({ showArchived, categoryType: filter.value })}
            className={buttonVariants({
              variant: categoryTypeFilter === filter.value ? 'secondary' : 'outline',
              size: 'sm',
            })}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={showArchived ? 'Archived' : 'Active'}
          value={String(displayCategories.length)}
          description={
            categoryTypeFilter === 'all'
              ? 'All types'
              : `${formatValue(categoryTypeFilter)} categories`
          }
        />
        <MetricCard
          label="Root categories"
          value={String(rootCount)}
          description="Top-level categories"
        />
        <MetricCard
          label="Subcategories"
          value={String(subcategoryCount)}
          description="Nested under parents"
        />
        <MetricCard
          label="System / excluded"
          value={`${systemCount} / ${excludedCount}`}
          description="System or excluded from reports"
        />
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      {isCreating ? (
        <FormDialog
          title="Create category"
          description="Add a new category to this household."
          cancelHref={cancelHref}
        >
          <CategoryForm
            mode="create"
            categoryTypeFilter={categoryTypeFilter}
            categoriesById={categoriesByIdRecord}
            parentCategories={parentCategoryOptions}
            showArchived={showArchived}
          />
        </FormDialog>
      ) : null}

      {selectedEditCategory ? (
        <FormDialog
          title="Edit category"
          description={`Update ${selectedEditCategory.name}.`}
          cancelHref={cancelHref}
        >
          <CategoryForm
            mode="edit"
            category={selectedEditCategory}
            categoryTypeFilter={categoryTypeFilter}
            categoriesById={categoriesByIdRecord}
            parentCategories={parentCategoryOptions}
            showArchived={showArchived}
          />
        </FormDialog>
      ) : null}

      {/* ── Category list ──────────────────────────────────────────────── */}
      {categoriesError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load categories. Try refreshing.
        </div>
      ) : categoryGroups.length ? (
        <div className="space-y-5">
          {categoryGroups.map((group) => {
            const hierarchy = buildCategoryHierarchy(group.categories)

            return (
              <section key={group.value} className="space-y-1.5">
                <h2 className="px-1 text-sm font-medium text-muted-foreground">
                  {group.label}
                </h2>

                <div className="divide-y rounded-lg border">
                  {hierarchy.roots.map((category) => {
                    const children =
                      hierarchy.childrenByParentId.get(category.id) ?? []
                    const parentName = category.parent_category_id
                      ? (categoriesById.get(category.parent_category_id)?.name ?? null)
                      : null

                    return (
                      <div key={category.id} className="divide-y">
                        <CategoryRow
                          category={category}
                          parentName={parentName}
                          childCount={children.length}
                          editHref={categoriesPath({
                            showArchived,
                            categoryType: categoryTypeFilter,
                            edit: category.id,
                          })}
                          showArchived={showArchived}
                        />

                        {children.length ? (
                          <div className="divide-y border-l-2 border-muted ml-4">
                            {children.map((child) => (
                              <CategoryRow
                                key={child.id}
                                category={child}
                                parentName={
                                  categoriesById.get(
                                    child.parent_category_id ?? ''
                                  )?.name ?? null
                                }
                                childCount={0}
                                editHref={categoriesPath({
                                  showArchived,
                                  categoryType: categoryTypeFilter,
                                  edit: child.id,
                                })}
                                showArchived={showArchived}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}

                  {hierarchy.unparented.length ? (
                    <div className="space-y-1 bg-muted/10 p-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        Unparented
                      </p>
                      <div className="divide-y rounded-lg border bg-background">
                        {hierarchy.unparented.map((category) => (
                          <CategoryRow
                            key={category.id}
                            category={category}
                            parentName={null}
                            parentUnavailable
                            childCount={0}
                            editHref={categoriesPath({
                              showArchived,
                              categoryType: categoryTypeFilter,
                              edit: category.id,
                            })}
                            showArchived={showArchived}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title={
            showArchived
              ? 'No archived categories'
              : categoryTypeFilter !== 'all'
              ? `No active ${formatValue(categoryTypeFilter).toLowerCase()} categories`
              : 'No active categories yet'
          }
          description={
            showArchived
              ? 'Archived categories will appear here after you archive one.'
              : 'Create your first category to classify transactions.'
          }
          actionHref={
            showArchived
              ? categoriesPath({ categoryType: categoryTypeFilter })
              : categoriesPath({
                  showArchived,
                  categoryType: categoryTypeFilter,
                  mode: 'create',
                })
          }
          actionLabel={showArchived ? 'Hide archived' : 'Create category'}
        />
      )}
    </main>
  )
}
