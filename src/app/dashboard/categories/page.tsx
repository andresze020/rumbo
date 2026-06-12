import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FolderTree, Layers, Plus, Settings, Tag } from 'lucide-react'
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
      value: t.value,
      label: t.label,
      categories: displayCategories
        .filter((c) => c.category_type === t.value)
        .map(
          (c): CategoryVM => ({
            ...c,
            editHref: categoriesPath({
              showArchived,
              categoryType: categoryTypeFilter,
              edit: c.id,
            }),
          })
        ),
    }))
    .filter((g) => g.categories.length > 0)

  const cancelHref = categoriesPath({ showArchived, categoryType: categoryTypeFilter })

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow={household.name}
        title={
          <span className="flex items-center gap-1.5">
            Categories
            <InfoTooltip term="allocations" label="Categories" />
          </span>
        }
        description="Manage household categories and reporting behavior."
        actions={
          <>
            <Link
              href={categoriesPath({
                showArchived,
                categoryType: categoryTypeFilter,
                mode: 'create',
              })}
              className={buttonVariants({ size: 'sm' })}
            >
              <Plus aria-hidden="true" />
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
          </>
        }
      />

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}
      {params.created === '1' ? <Callout variant="success">Category created.</Callout> : null}
      {params.updated === '1' ? <Callout variant="success">Category updated.</Callout> : null}
      {params.archived === '1' ? <Callout variant="info">Category archived.</Callout> : null}
      {params.unarchived === '1' ? <Callout variant="success">Category restored.</Callout> : null}

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
          description="System or excluded from reports"
          icon={<Settings />}
          accent="bg-muted text-muted-foreground"
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
        <Callout variant="error">Could not load categories. Try refreshing.</Callout>
      ) : categoryGroups.length ? (
        <SortableCategoryList groups={categoryGroups} showArchived={showArchived} />
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
