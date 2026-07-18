import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { StepIndicator } from '../step-indicator'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const nextSteps = [
  'Record your first transaction using the ＋ button on the dashboard',
  'Set up a monthly budget to track spending by category',
  'Check your Net Worth to see your overall financial picture',
]

export default async function OnboardingDonePage() {
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

  const householdId = profile.default_household_id

  const [{ data: household }, { count: accountCount }, { count: categoryCount }] =
    await Promise.all([
      supabase
        .from('households')
        .select('name')
        .eq('id', householdId)
        .single(),
      supabase
        .from('accounts')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', householdId)
        .is('deleted_at', null),
      supabase
        .from('categories')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', householdId)
        .eq('is_archived', false)
        .is('deleted_at', null),
    ])

  const stats = [
    { label: 'Household', value: household?.name ?? '—' },
    { label: 'Accounts created', value: String(accountCount ?? 0) },
    { label: 'Active categories', value: String(categoryCount ?? 0) },
  ]

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/8 via-background to-background p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <StepIndicator step={5} />
          <div className="flex flex-col items-center gap-3 pt-2 text-center">
            <CheckCircle2 className="size-16 text-emerald-500" aria-hidden="true" />
            <CardTitle className="text-2xl">You&apos;re all set!</CardTitle>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <dl className="divide-y rounded-xl border">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <dt className="text-sm text-muted-foreground">{stat.label}</dt>
                <dd className="truncate text-sm font-bold">{stat.value}</dd>
              </div>
            ))}
          </dl>

          <div className="space-y-2">
            <p className="text-sm font-semibold">What&apos;s next</p>
            <ul className="space-y-1.5">
              {nextSteps.map((step) => (
                <li
                  key={step}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                  {step}
                </li>
              ))}
            </ul>
          </div>

          <Link
            href="/dashboard"
            className={cn(buttonVariants(), 'h-11 w-full rounded-xl')}
          >
            Go to my dashboard →
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}
