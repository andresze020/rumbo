import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  archiveCategoryAction,
  createCategoryAction,
  updateCategoryAction,
} from './actions'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/empty-state'

type CategoriesPageProps = {
  searchParams: Promise<{
    created?: string
    updated?: string
    archived?: string
    unarchived?: string
    showArchived?: string
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
]

const reportingTypes = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'debt_principal', label: 'Debt principal' },
  { value: 'debt_interest', label: 'Debt interest' },
  { value: 'investment', label: 'Investment' },
  { value: 'savings', label: 'Savings' },
  { value: 'adjustment', label: 'Adjustment' },
]

function formatValue(value: string) {
  return value.replaceAll('_', ' ')
}

function groupCategories(categories: Category[]) {
  return categoryTypes
    .map((categoryType) => ({
      ...categoryType,
      categories: categories.filter(
        (category) => category.category_type === categoryType.value
      ),
    }))
    .filter((group) => group.categories.length > 0)
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
    .eq('is_archived', showArchived)
    .is('deleted_at', null)
    .order('category_type', { ascending: true })
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (categoriesError) {
    throw new Error('Could not load categories.')
  }

  const { data: parentCategories, error: parentCategoriesError } =
    await supabase
      .from('categories')
      .select(
        'id, name, category_type, reporting_type, parent_category_id, is_archived'
      )
      .eq('household_id', household.id)
      .is('deleted_at', null)
      .order('category_type', { ascending: true })
      .order('name', { ascending: true })

  if (parentCategoriesError) {
    throw new Error('Could not load parent categories.')
  }

  const categoryGroups = groupCategories((categories ?? []) as Category[])
  const parentCategoryOptions =
    (parentCategories ?? []) as ParentCategoryOption[]
  const categoriesById = new Map(
    parentCategoryOptions.map((category) => [category.id, category])
  )
  const activeTopLevelParentOptions = parentCategoryOptions.filter(
    (category) => !category.is_archived && !category.parent_category_id
  )

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <p className="text-sm text-muted-foreground">{household.name}</p>
        <h1 className="text-2xl font-semibold tracking-normal">Categories</h1>
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
          Category unarchived.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
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
                href={
                  showArchived
                    ? '/dashboard/categories'
                    : '/dashboard/categories?showArchived=true'
                }
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-border px-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                {showArchived ? 'Show active' : 'Show archived'}
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {categoryGroups.length ? (
              <div className="space-y-5">
                {categoryGroups.map((group) => (
                  <section key={group.value} className="space-y-2">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      {group.label}
                    </h2>

                    <div className="divide-y rounded-lg border">
                      {group.categories.map((category) => (
                        <div
                          key={category.id}
                          className={`space-y-4 p-4 ${category.is_archived ? 'bg-muted/30 text-muted-foreground' : ''}`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-medium">
                                  {getCategoryPath(category, categoriesById)}
                                </h3>
                                {category.is_system ? (
                                  <Badge variant="secondary">System</Badge>
                                ) : null}
                                {category.parent_category_id ? (
                                  <Badge variant="outline">Child</Badge>
                                ) : null}
                                {parentCategoryOptions.some(
                                  (option) =>
                                    option.parent_category_id === category.id
                                ) ? (
                                  <Badge variant="outline">Parent</Badge>
                                ) : null}
                                {category.is_archived ? (
                                  <Badge variant="outline">Archived</Badge>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">
                                  {formatValue(category.category_type)}
                                </Badge>
                                <Badge variant="outline">
                                  {formatValue(category.reporting_type)}
                                </Badge>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {category.exclude_from_budget ? (
                                <Badge variant="outline">No budget</Badge>
                              ) : null}
                              {category.exclude_from_reports ? (
                                <Badge variant="outline">No reports</Badge>
                              ) : null}
                            </div>
                          </div>

                          <form
                            action={updateCategoryAction}
                            className="space-y-3 rounded-lg border p-3"
                          >
                            <input
                              type="hidden"
                              name="category_id"
                              value={category.id}
                            />
                            <input
                              type="hidden"
                              name="show_archived"
                              value={showArchived ? 'true' : 'false'}
                            />

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor={`name_${category.id}`}>
                                  Name
                                </Label>
                                <Input
                                  id={`name_${category.id}`}
                                  name="name"
                                  defaultValue={category.name}
                                  required
                                />
                              </div>

                              <div className="space-y-2">
                                <Label
                                  htmlFor={`parent_category_${category.id}`}
                                >
                                  Parent
                                </Label>
                                <select
                                  id={`parent_category_${category.id}`}
                                  name="parent_category_id"
                                  defaultValue={
                                    category.parent_category_id ?? ''
                                  }
                                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                >
                                  <option value="">None</option>
                                  {activeTopLevelParentOptions
                                    .filter(
                                      (option) =>
                                        option.id !== category.id &&
                                        option.category_type ===
                                          category.category_type &&
                                        option.reporting_type ===
                                          category.reporting_type
                                    )
                                    .map((option) => (
                                      <option
                                        key={option.id}
                                        value={option.id}
                                      >
                                        {getCategoryPath(
                                          option,
                                          categoriesById
                                        )}{' '}
                                        -{' '}
                                        {formatValue(option.category_type)}
                                      </option>
                                    ))}
                                </select>
                              </div>

                              <div className="space-y-2">
                                <Label
                                  htmlFor={`category_type_${category.id}`}
                                >
                                  Type
                                </Label>
                                <select
                                  id={`category_type_${category.id}`}
                                  name="category_type"
                                  defaultValue={category.category_type}
                                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                >
                                  {categoryTypes.map((categoryType) => (
                                    <option
                                      key={categoryType.value}
                                      value={categoryType.value}
                                    >
                                      {categoryType.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-2">
                                <Label
                                  htmlFor={`reporting_type_${category.id}`}
                                >
                                  Reporting
                                </Label>
                                <select
                                  id={`reporting_type_${category.id}`}
                                  name="reporting_type"
                                  defaultValue={category.reporting_type}
                                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                >
                                  {reportingTypes.map((reportingType) => (
                                    <option
                                      key={reportingType.value}
                                      value={reportingType.value}
                                    >
                                      {reportingType.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor={`sort_order_${category.id}`}>
                                  Sort order
                                </Label>
                                <Input
                                  id={`sort_order_${category.id}`}
                                  name="sort_order"
                                  type="number"
                                  step="1"
                                  defaultValue={category.sort_order ?? ''}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor={`color_${category.id}`}>
                                  Color
                                </Label>
                                <Input
                                  id={`color_${category.id}`}
                                  name="color"
                                  defaultValue={category.color ?? ''}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor={`icon_${category.id}`}>
                                  Icon
                                </Label>
                                <Input
                                  id={`icon_${category.id}`}
                                  name="icon"
                                  defaultValue={category.icon ?? ''}
                                />
                              </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <Label className="items-start gap-3 rounded-lg border p-3">
                                <input
                                  type="checkbox"
                                  name="exclude_from_budget"
                                  defaultChecked={
                                    category.exclude_from_budget
                                  }
                                  className="mt-0.5 size-4"
                                />
                                <span className="space-y-1">
                                  <span className="block">
                                    Exclude from budget
                                  </span>
                                  <span className="block text-sm font-normal text-muted-foreground">
                                    Keeps this out of budget workflows.
                                  </span>
                                </span>
                              </Label>

                              <Label className="items-start gap-3 rounded-lg border p-3">
                                <input
                                  type="checkbox"
                                  name="exclude_from_reports"
                                  defaultChecked={
                                    category.exclude_from_reports
                                  }
                                  className="mt-0.5 size-4"
                                />
                                <span className="space-y-1">
                                  <span className="block">
                                    Exclude from reports
                                  </span>
                                  <span className="block text-sm font-normal text-muted-foreground">
                                    Keeps this out of reporting totals.
                                  </span>
                                </span>
                              </Label>
                            </div>

                            <Button type="submit">Save category</Button>
                          </form>

                          <form action={archiveCategoryAction}>
                            <input
                              type="hidden"
                              name="category_id"
                              value={category.id}
                            />
                            <input
                              type="hidden"
                              name="is_archived"
                              value={
                                category.is_archived ? 'false' : 'true'
                              }
                            />
                            <input
                              type="hidden"
                              name="show_archived"
                              value={showArchived ? 'true' : 'false'}
                            />
                            <Button
                              type="submit"
                              variant={
                                category.is_archived ? 'outline' : 'secondary'
                              }
                            >
                              {category.is_archived
                                ? 'Unarchive category'
                                : 'Archive category'}
                            </Button>
                          </form>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
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
                    : 'Create an income or expense category so transactions, budgets, and reports have somewhere to land.'
                }
                actionHref={showArchived ? '/dashboard/categories' : undefined}
                actionLabel={showArchived ? 'Show active categories' : undefined}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create category</CardTitle>
            <CardDescription>Add a basic household category.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createCategoryAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category_type">Category type</Label>
                <Select name="category_type" defaultValue="expense">
                  <SelectTrigger id="category_type" className="w-full">
                    <SelectValue placeholder="Select category type" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryTypes.map((categoryType) => (
                      <SelectItem
                        key={categoryType.value}
                        value={categoryType.value}
                      >
                        {categoryType.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reporting_type">Reporting type</Label>
                <Select name="reporting_type" defaultValue="expense">
                  <SelectTrigger id="reporting_type" className="w-full">
                    <SelectValue placeholder="Select reporting type" />
                  </SelectTrigger>
                  <SelectContent>
                    {reportingTypes.map((reportingType) => (
                      <SelectItem
                        key={reportingType.value}
                        value={reportingType.value}
                      >
                        {reportingType.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent_category_id">Parent</Label>
                <select
                  id="parent_category_id"
                  name="parent_category_id"
                  defaultValue=""
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">None</option>
                  {activeTopLevelParentOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {getCategoryPath(option, categoriesById)} -{' '}
                      {formatValue(option.category_type)} /{' '}
                      {formatValue(option.reporting_type)}
                    </option>
                  ))}
                </select>
              </div>

              <Button type="submit" className="w-full">
                Create category
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
