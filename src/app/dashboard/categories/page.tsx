import { redirect } from 'next/navigation'
import { createCategoryAction } from './actions'
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

type CategoriesPageProps = {
  searchParams: Promise<{
    created?: string
    error?: string
  }>
}

type Category = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  is_system: boolean
  exclude_from_budget: boolean
  exclude_from_reports: boolean
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

export default async function CategoriesPage({
  searchParams,
}: CategoriesPageProps) {
  const params = await searchParams
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const created = params.created === '1'
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
      'id, name, category_type, reporting_type, is_system, exclude_from_budget, exclude_from_reports'
    )
    .eq('household_id', household.id)
    .eq('is_archived', false)
    .order('category_type', { ascending: true })
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (categoriesError) {
    throw new Error('Could not load categories.')
  }

  const categoryGroups = groupCategories((categories ?? []) as Category[])

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
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

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Active categories</CardTitle>
            <CardDescription>
              Categories connected to your active household.
            </CardDescription>
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
                        <div key={category.id} className="space-y-3 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-medium">
                                  {category.name}
                                </h3>
                                {category.is_system ? (
                                  <Badge variant="secondary">System</Badge>
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
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                No active categories yet.
              </p>
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
