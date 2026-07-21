import { redirect } from 'next/navigation'
import { StepIndicator } from '../step-indicator'
import { CategoriesStep, type OnboardingCategory } from './categories-step'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Callout } from '@/components/callout'

type OnboardingCategoriesPageProps = {
  searchParams: Promise<{ error?: string; created?: string }>
}

export default async function OnboardingCategoriesPage({
  searchParams,
}: OnboardingCategoriesPageProps) {
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
    redirect('/onboarding/household')
  }

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select('id, name, category_type, icon, is_archived')
    .eq('household_id', profile.default_household_id)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  const allCategories = (categories ?? []) as OnboardingCategory[]

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/8 via-background to-background p-4 sm:p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-2">
          <StepIndicator step={4} />
          <CardTitle>Your categories</CardTitle>
          <CardDescription>
            Categories tell you where your money comes from and where it goes.
            26 categories have been created for you automatically. They cover
            the most common spending areas — you can archive the ones you
            don&apos;t use and add your own at any time.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}
          {created ? <Callout variant="success">Category created.</Callout> : null}
          {categoriesError ? (
            <Callout variant="error">
              Could not load your categories. Try refreshing the page.
            </Callout>
          ) : (
            <CategoriesStep categories={allCategories} />
          )}
        </CardContent>
      </Card>
    </main>
  )
}
