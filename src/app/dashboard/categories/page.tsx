import Link from 'next/link'
import { redirect } from 'next/navigation'
import { archiveCategoryAction } from './actions'
import { CategoryForm } from './category-form'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { MetricCard } from '@/components/metric-card'
import { SubmitButton } from '@/components/submit-button'

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
  return value === 'all' || categoryTypes.some((type) => type.value === value)
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

  if (showArchived) {
    params.set('showArchived', 'true')
  }

  if (categoryType && categoryType !== 'all') {
    params.set('categoryType', categoryType)
  }

  if (mode) {
    params.set('mode', mode)
  }

  if (edit) {
    params.set('edit', edit)
  }

  const queryString = params.toString()

  return `/dashboard/categories${queryString ? `?${queryString}` : ''}`
}

function formatValue(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getParentName(
  category: { parent_category_id: string | null },
  categoriesById: Map<string, { name: string }>
) {
  return category.parent_category_id
    ? categoriesById.get(category.parent_category_id)?.name ?? null
    : null
}

function getCategoryGroups(
  categories: Category[],
  categoryTypeFilter: CategoryTypeFilter
) {
  return categoryTypes
    .filter(
      (categoryType) =>
        categoryTypeFilter === 'all' ||
        categoryType.value === categoryTypeFilter
    )
    .map((categoryType) => ({
      ...categoryType,
      categories: categories.filter(
        (category) => category.category_type === categoryType.value
      ),
    }))
    .filter((group) => group.categories.length > 0)
}

function buildCategoryHierarchy(categories: Category[]): CategoryHierarchy {
  const categoryIds = new Set(categories.map((category) => category.id))
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

function CategoryListItem({
  category,
  categoriesById,
  categoryTypeFilter,
  childCount,
  isChild,
  parentUnavailable,
  showArchived,
}: {
  category: Category
  categoriesById: Map<string, ParentCategoryOption>
  categoryTypeFilter: CategoryTypeFilter
  childCount: number
  isChild?: boolean
  parentUnavailable?: boolean
  showArchived: boolean
}) {
  const parentName = getParentName(category, categoriesById)

  return (
    <div
      className={`space-y-3 p-4 ${
        category.is_archived ? 'bg-muted/30 text-muted-foreground' : ''
      } ${isChild ? 'sm:pl-6' : ''}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {category.color ? (
              <span
                className="size-3 rounded-full border"
                style={{ backgroundColor: category.color }}
                aria-hidden="true"
              />
            ) : null}
            {category.icon ? (
              <span className="text-base leading-none" aria-hidden="true">
                {category.icon}
              </span>
            ) : null}
            <h3 className="font-medium">{category.name}</h3>
            {category.is_system ? (
              <Badge variant="secondary">System</Badge>
            ) : null}
            {childCount > 0 ? <Badge variant="outline">Parent</Badge> : null}
            {category.parent_category_id ? (
              <Badge variant="outline">Subcategory</Badge>
            ) : null}
            {parentUnavailable ? (
              <Badge variant="outline">Parent unavailable</Badge>
            ) : null}
            {category.is_archived ? (
              <Badge variant="outline">Archived</Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {parentName ? <span>Parent: {parentName}</span> : null}
            {category.parent_category_id && !parentName ? (
              <span>Parent: unavailable</span>
            ) : null}
            {childCount > 0 ? (
              <span>
                {childCount} {childCount === 1 ? 'subcategory' : 'subcategories'}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {formatValue(category.category_type)}
            </Badge>
            <Badge variant="outline">
              {formatValue(category.reporting_type)}
            </Badge>
            {category.exclude_from_budget ? (
              <Badge variant="outline">Excluded from budget</Badge>
            ) : null}
            {category.exclude_from_reports ? (
              <Badge variant="outline">Excluded from reports</Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={categoriesPath({
              showArchived,
              categoryType: categoryTypeFilter,
              edit: category.id,
            })}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Edit
          </Link>

          <form action={archiveCategoryAction}>
            <input type="hidden" name="category_id" value={category.id} />
            <input
              type="hidden"
              name="is_archived"
              value={category.is_archived ? 'false' : 'true'}
            />
            <input
              type="hidden"
              name="show_archived"
              value={showArchived ? 'true' : 'false'}
            />
            <SubmitButton
              type="submit"
              size="sm"
              variant={category.is_archived ? 'outline' : 'secondary'}
              pendingText={
                category.is_archived ? 'Restoring' : 'Archiving'
              }
            >
              {category.is_archived ? 'Restore category' : 'Archive category'}
            </SubmitButton>
          </form>
        </div>
      </div>
    </div>
  )
}

export default async function CategoriesPage({
  searchParams,
}: CategoriesPageProps) {
  const params = await searchParams
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const created = params.created === '1'
  const updated = params.updated === '1'
  const archived = params.archived === '1'
  const unarchived = params.unarchived === '1'
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
    .select('id, name')
    .eq('id', profile.default_household_id)
    .single()

  if (householdError || !household) {
    redirect('/onboarding')
  }

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
  const categoriesById = new Map(
    allCategories.map((category) => [category.id, category])
  )
  const parentCategoryOptions = allCategories.map((category) => ({
    id: category.id,
    name: category.name,
    category_type: category.category_type,
    reporting_type: category.reporting_type,
    parent_category_id: category.parent_category_id,
    is_archived: category.is_archived,
  }))
  const categoriesByIdRecord: Record<string, ParentCategoryOption> = Object.fromEntries(categoriesById)
  const activeCategories = allCategories.filter(
    (category) => !category.is_archived
  )
  const archivedCategories = allCategories.filter(
    (category) => category.is_archived
  )
  const displayCategories = (showArchived ? archivedCategories : activeCategories)
    .filter(
      (category) =>
        categoryTypeFilter === 'all' ||
        category.category_type === categoryTypeFilter
    )
  const categoryGroups = getCategoryGroups(displayCategories, categoryTypeFilter)
  const selectedEditCategory = displayCategories.find(
    (category) => category.id === editCategoryId
  )
  const rootCount = displayCategories.filter(
    (category) => !category.parent_category_id
  ).length
  const subcategoryCount = displayCategories.length - rootCount
  const systemCount = displayCategories.filter(
    (category) => category.is_system
  ).length
  const excludedCount = displayCategories.filter(
    (category) =>
      category.exclude_from_budget || category.exclude_from_reports
  ).length
  const hasLoadError = Boolean(categoriesError)
  const summaryCards = [
    {
      label: showArchived ? 'Archived' : 'Visible',
      value: String(displayCategories.length),
      description:
        categoryTypeFilter === 'all'
          ? 'All category types'
          : `${formatValue(categoryTypeFilter)} categories`,
    },
    {
      label: 'Root categories',
      value: String(rootCount),
      description: 'Top-level categories',
    },
    {
      label: 'Subcategories',
      value: String(subcategoryCount),
      description: 'Nested under parents',
    },
    {
      label: 'System / excluded',
      value: `${systemCount} / ${excludedCount}`,
      description: 'Marked categories',
    },
  ]

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{household.name}</p>
          <h1 className="text-2xl font-semibold tracking-normal">
            Categories
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
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
            className={buttonVariants()}
          >
            Create category
          </Link>
          <Link
            href={categoriesPath({
              showArchived: !showArchived,
              categoryType: categoryTypeFilter,
            })}
            className={buttonVariants({ variant: 'outline' })}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {created ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Category created.
        </div>
      ) : null}

      {updated ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Category updated.
        </div>
      ) : null}

      {archived ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Category archived.
        </div>
      ) : null}

      {unarchived ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          Category restored.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {[
          { value: 'all' as const, label: 'All' },
          ...categoryTypes,
        ].map((filter) => (
          <Link
            key={filter.value}
            href={categoriesPath({
              showArchived,
              categoryType: filter.value,
            })}
            className={buttonVariants({
              variant:
                categoryTypeFilter === filter.value ? 'secondary' : 'outline',
              size: 'sm',
            })}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            description={card.description}
          />
        ))}
      </div>

      {isCreating ? (
        <Card>
          <CardHeader>
            <CardTitle>Create category</CardTitle>
            <CardDescription>Add a household category.</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryForm
              categoryTypeFilter={categoryTypeFilter}
              categoriesById={categoriesByIdRecord}
              mode="create"
              parentCategories={parentCategoryOptions}
              showArchived={showArchived}
            />
          </CardContent>
        </Card>
      ) : null}

      {selectedEditCategory ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit category</CardTitle>
            <CardDescription>
              Update metadata for {selectedEditCategory.name}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryForm
              category={selectedEditCategory}
              categoryTypeFilter={categoryTypeFilter}
              categoriesById={categoriesByIdRecord}
              mode="edit"
              parentCategories={parentCategoryOptions}
              showArchived={showArchived}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>
                {showArchived ? 'Archived categories' : 'Active categories'}
              </CardTitle>
              <CardDescription>
                {showArchived
                  ? 'Archived categories remain available for history.'
                  : 'Categories connected to your active household.'}
              </CardDescription>
            </div>

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
        </CardHeader>
        <CardContent>
          {hasLoadError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              Could not load categories.
            </p>
          ) : categoryGroups.length ? (
            <div className="space-y-5">
              {categoryGroups.map((group) => {
                const hierarchy = buildCategoryHierarchy(group.categories)

                return (
                  <section key={group.value} className="space-y-2">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      {group.label}
                    </h2>

                    <div className="divide-y rounded-lg border">
                      {hierarchy.roots.map((category) => {
                        const children =
                          hierarchy.childrenByParentId.get(category.id) ?? []

                        return (
                          <div key={category.id} className="divide-y">
                            <CategoryListItem
                              category={category}
                              categoriesById={categoriesById}
                              categoryTypeFilter={categoryTypeFilter}
                              childCount={children.length}
                              showArchived={showArchived}
                            />

                            {children.length ? (
                              <div className="divide-y border-l bg-muted/20 sm:ml-6">
                                {children.map((child) => (
                                  <CategoryListItem
                                    key={child.id}
                                    category={child}
                                    categoriesById={categoriesById}
                                    categoryTypeFilter={categoryTypeFilter}
                                    childCount={0}
                                    isChild
                                    showArchived={showArchived}
                                  />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}

                      {hierarchy.unparented.length ? (
                        <div className="space-y-2 border-t bg-muted/10 p-3">
                          <p className="text-sm font-medium text-muted-foreground">
                            Unparented / other
                          </p>
                          <div className="divide-y rounded-lg border bg-background">
                            {hierarchy.unparented.map((category) => (
                              <CategoryListItem
                                key={category.id}
                                category={category}
                                categoriesById={categoriesById}
                                categoryTypeFilter={categoryTypeFilter}
                                childCount={0}
                                parentUnavailable
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
                  ? 'No archived categories yet'
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
        </CardContent>
      </Card>
    </main>
  )
}
