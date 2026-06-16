import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowLeft,
  FolderTree,
  Layers,
  Plus,
  Search,
  Settings,
  Tag,
} from 'lucide-react'
import { CategoryForm } from './category-form'
import { SortableCategoryList, type CategoryVM } from './sortable-category-list'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { FormDialog } from '@/components/form-dialog'
import { MetricCard } from '@/components/metric-card'
import { PageHeader } from '@/components/page-header'
import { InfoTooltip } from '@/components/info-tooltip'
import { Callout } from '@/components/callout'
import { formatLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

type CategoriesPageProps = {
  searchParams: Promise<{
    created?: string
    updated?: string
    archived?: string
    unarchived?: string
    showArchived?: string
    categoryType?: string
    q?: string
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
  icon: string | null
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
  q,
  mode,
  edit,
}: {
  showArchived?: boolean
  categoryType?: CategoryTypeFilter
  q?: string
  mode?: 'create'
  edit?: string
} = {}) {
  const params = new URLSearchParams()
  if (showArchived) params.set('showArchived', 'true')
  if (categoryType && categoryType !== 'all') params.set('categoryType', categoryType)
  if (q?.trim()) params.set('q', q.trim())
  if (mode) params.set('mode', mode)
  if (edit) params.set('edit', edit)
  const qs = params.toString()
  return `/dashboard/categories${qs ? `?${qs}` : ''}`
}

function countByType(categories: Category[]) {
  return categoryTypes.map((type) => ({
    ...type,
    count: categories.filter((category) => category.category_type === type.value).length,
  }))
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
  const searchQuery = typeof params.q === 'string' ? params.q.trim() : ''
  const normalizedSearch = searchQuery.toLowerCase()
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
  const childrenByParentId = new Map<string, Category[]>()
  for (const category of allCategories) {
    if (!category.parent_category_id) continue
    const siblings = childrenByParentId.get(category.parent_category_id)
    if (siblings) siblings.push(category)
    else childrenByParentId.set(category.parent_category_id, [category])
  }

  const parentCategoryOptions: ParentCategoryOption[] = allCategories.map((c) => ({
    id: c.id,
    name: c.name,
    category_type: c.category_type,
    reporting_type: c.reporting_type,
    parent_category_id: c.parent_category_id,
    is_archived: c.is_archived,
    icon: c.icon,
  }))
  const categoriesByIdRecord: Record<string, ParentCategoryOption> =
    Object.fromEntries(categoriesById)

  function directNameMatch(category: Category) {
    if (!normalizedSearch) return true
    return category.name.toLowerCase().includes(normalizedSearch)
  }

  function matchesSearch(category: Category) {
    if (!normalizedSearch) return true
    const parent = category.parent_category_id
      ? categoriesById.get(category.parent_category_id)
      : null
    const childMatch = (childrenByParentId.get(category.id) ?? []).some(directNameMatch)
    return directNameMatch(category) || Boolean(parent && directNameMatch(parent)) || childMatch
  }

  const displayCategories = (showArchived
    ? allCategories.filter((c) => c.is_archived)
    : allCategories.filter((c) => !c.is_archived)
  ).filter(
    (c) =>
      (categoryTypeFilter === 'all' || c.category_type === categoryTypeFilter) &&
      matchesSearch(c)
  )

  const selectedEditCategory = allCategories.find((c) => c.id === editCategoryId) ?? null

  const rootCount = displayCategories.filter((c) => !c.parent_category_id).length
  const subcategoryCount = displayCategories.length - rootCount
  const systemCount = displayCategories.filter((c) => c.is_system).length
  const excludedCount = displayCategories.filter(
    (c) => c.exclude_from_budget || c.exclude_from_reports
  ).length
  const activeCategories = allCategories.filter((c) => !c.is_archived)
  const archivedCount = allCategories.filter((c) => c.is_archived).length
  const typeCounts = countByType(activeCategories)
  const missingIconCount = displayCategories.filter((c) => !c.icon).length
  const missingColorCount = displayCategories.filter((c) => !c.color).length
  const configurationNotes = [
    excludedCount
      ? `${excludedCount} ${excludedCount === 1 ? 'category has' : 'categories have'} configuration exclusions.`
      : 'All visible categories are available for reports unless configured otherwise.',
    missingIconCount
      ? `${missingIconCount} visible ${missingIconCount === 1 ? 'category has' : 'categories have'} no icon.`
      : 'Visible categories have icons assigned.',
    missingColorCount
      ? `${missingColorCount} visible ${missingColorCount === 1 ? 'category has' : 'categories have'} no color.`
      : 'Visible categories have colors assigned.',
  ]

  const categoryGroups = categoryTypes
    .filter(
      (t) => categoryTypeFilter === 'all' || t.value === categoryTypeFilter
    )
    .map((t) => ({
      value: t.value,
      label: t.label,
      categories: displayCategories
        .filter((c) => c.category_type === t.value)
        .map(
          (c): CategoryVM => ({
            ...c,
            childCount: childrenByParentId.get(c.id)?.length ?? 0,
            editHref: categoriesPath({
              showArchived,
              categoryType: categoryTypeFilter,
              q: searchQuery,
              edit: c.id,
            }),
          })
        ),
    }))
    .filter((g) => g.categories.length > 0)

  const cancelHref = categoriesPath({
    showArchived,
    categoryType: categoryTypeFilter,
    q: searchQuery,
  })

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 sm:gap-6 sm:p-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        className="hidden md:flex"
        eyebrow={household.name}
        title={
          <span className="flex items-center gap-1.5">
            Categories
            <InfoTooltip
              label="Categories"
              text="Master list used to classify transactions and control category behavior in reports."
            />
          </span>
        }
        description="Manage the master category list used across transactions, reports, and account organization."
        actions={
          <>
            <Link
              href={categoriesPath({
                showArchived,
                categoryType: categoryTypeFilter,
                q: searchQuery,
                mode: 'create',
              })}
              className={buttonVariants({ size: 'sm' })}
            >
              <Plus aria-hidden="true" />
              New
            </Link>
            <Link
              href={categoriesPath({
                showArchived: !showArchived,
                categoryType: categoryTypeFilter,
                q: searchQuery,
              })}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {showArchived ? 'Hide archived' : 'Show archived'}
            </Link>
          </>
        }
      />

      <div className="flex items-center gap-2 md:hidden">
        <Link
          href="/dashboard/more"
          className={buttonVariants({ variant: 'outline', size: 'icon' })}
          aria-label="Back to More"
        >
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold leading-tight">Categories</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            Master list
          </p>
        </div>
        <Link
          href={categoriesPath({
            showArchived,
            categoryType: categoryTypeFilter,
            q: searchQuery,
            mode: 'create',
          })}
          className={buttonVariants({ size: 'sm' })}
        >
          <Plus aria-hidden="true" />
          New
        </Link>
      </div>

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}
      {params.created === '1' ? <Callout variant="success">Category created.</Callout> : null}
      {params.updated === '1' ? <Callout variant="success">Category updated.</Callout> : null}
      {params.archived === '1' ? <Callout variant="info">Category archived.</Callout> : null}
      {params.unarchived === '1' ? <Callout variant="success">Category restored.</Callout> : null}

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 md:hidden">
        <div className="rounded-xl border bg-card p-3 shadow-sm shadow-black/[0.03]">
          <p className="mb-1 text-[10px] text-muted-foreground">Active</p>
          <p className="font-mono text-sm font-bold leading-snug tabular-nums">
            {activeCategories.length}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm shadow-black/[0.03]">
          <p className="mb-1 text-[10px] text-muted-foreground">Subcategories</p>
          <p className="font-mono text-sm font-bold leading-snug tabular-nums">
            {subcategoryCount}
          </p>
        </div>
      </div>

      <div className="hidden gap-4 md:grid sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={showArchived ? 'Archived' : 'Active'}
          value={String(displayCategories.length)}
          description={
            categoryTypeFilter === 'all'
              ? 'All types'
              : `${formatLabel(categoryTypeFilter)} categories`
          }
          icon={<Tag />}
          accent="bg-primary/10 text-primary"
        />
        <MetricCard
          label="Root categories"
          value={String(rootCount)}
          description="Top-level categories"
          icon={<FolderTree />}
          accent="bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400"
        />
        <MetricCard
          label="Subcategories"
          value={String(subcategoryCount)}
          description="Nested under parents"
          icon={<Layers />}
          accent="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400"
        />
        <MetricCard
          label="System / excluded"
          value={`${systemCount} / ${excludedCount}`}
          description={`${archivedCount} archived in master list`}
          icon={<Settings />}
          accent="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
        />
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      {isCreating ? (
        <FormDialog
          title="New category"
          description="Add a category to this household master list."
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
        <section className="min-w-0 space-y-4">
          {/* ── Toolbar ─────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 md:rounded-xl md:border md:bg-card md:p-3 md:shadow-sm md:shadow-black/[0.03] sm:flex-row sm:items-center">
            <div className="flex overflow-x-auto rounded-xl border bg-card p-1 md:rounded-lg md:bg-background">
              {([{ value: 'all' as const, label: 'All' }, ...categoryTypes]).map((filter) => (
                <Link
                  key={filter.value}
                  href={categoriesPath({
                    showArchived,
                    categoryType: filter.value,
                    q: searchQuery,
                  })}
                  className={cn(
                    'min-w-0 flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-center text-xs font-semibold transition-colors md:flex-none md:rounded-md md:py-1.5',
                    categoryTypeFilter === filter.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {filter.label}
                </Link>
              ))}
            </div>

            <form action="/dashboard/categories" className="hidden min-w-0 flex-1 items-center gap-2 md:flex sm:max-w-xs">
              {showArchived ? <input type="hidden" name="showArchived" value="true" /> : null}
              {categoryTypeFilter !== 'all' ? (
                <input type="hidden" name="categoryType" value={categoryTypeFilter} />
              ) : null}
              <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background px-3">
                <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                  name="q"
                  defaultValue={searchQuery}
                  placeholder="Search categories..."
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <button
                type="submit"
                aria-label="Search categories"
                className={buttonVariants({ variant: 'outline', size: 'icon' })}
              >
                <Search aria-hidden="true" />
              </button>
            </form>

            <Link
              href={categoriesPath({
                showArchived,
                categoryType: categoryTypeFilter,
                q: searchQuery,
                mode: 'create',
              })}
              className={cn(buttonVariants({ size: 'sm' }), 'hidden sm:ml-auto md:inline-flex')}
            >
              <Plus aria-hidden="true" />
              New
            </Link>
          </div>

          {/* ── Category list ───────────────────────────────────────────── */}
          {categoriesError ? (
            <Callout variant="error">Could not load categories. Try refreshing.</Callout>
          ) : categoryGroups.length ? (
            <SortableCategoryList groups={categoryGroups} showArchived={showArchived} />
          ) : (
            <EmptyState
              title={
                showArchived
                  ? 'No archived categories'
                  : categoryTypeFilter !== 'all'
                  ? `No active ${formatLabel(categoryTypeFilter).toLowerCase()} categories`
                  : searchQuery
                  ? 'No categories match this search'
                  : 'No active categories yet'
              }
              description={
                showArchived
                  ? 'Archived categories will appear here after you archive one.'
                  : searchQuery
                  ? 'Try another search term or clear the filter.'
                  : 'Add your first category to classify transactions.'
              }
              actionHref={
                showArchived
                  ? categoriesPath({ categoryType: categoryTypeFilter })
                  : categoriesPath({
                      showArchived,
                      categoryType: categoryTypeFilter,
                      q: searchQuery,
                      mode: 'create',
                    })
              }
              actionLabel={showArchived ? 'Hide archived' : 'New'}
            />
          )}
        </section>

        <aside className="hidden min-w-0 flex-col gap-4 xl:flex">
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <Tag className="size-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-bold">Category mix</h2>
            </div>
            <div className="divide-y">
              {typeCounts.map((type) => (
                <div key={type.value} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-xs font-medium text-muted-foreground">{type.label}</span>
                  <span className="font-mono text-sm font-bold tabular-nums">{type.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border bg-card shadow-sm shadow-black/[0.03]">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <Settings className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-bold">Configuration checks</h2>
            </div>
            <div className="flex flex-col gap-2 p-3">
              {configurationNotes.map((note) => (
                <div
                  key={note}
                  className="rounded-lg border bg-muted/25 p-2.5 text-xs leading-relaxed text-muted-foreground"
                >
                  {note}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}
