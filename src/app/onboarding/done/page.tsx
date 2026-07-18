import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronRight,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'
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

const addAccountStep = {
  href: '/dashboard/accounts?mode=create',
  icon: Wallet,
  accent: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
  title: 'Add your first account',
  description:
    'You skipped this earlier — add a bank account, card, or cash wallet so you can start tracking.',
}

const recordTransactionStep = {
  href: '/dashboard/transactions',
  icon: ArrowLeftRight,
  accent: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
  title: 'Record your first transaction',
  description:
    'Log what you spend or receive with the ＋ button — this is where your day-to-day money lives.',
}

const planningSteps = [
  {
    href: '/dashboard/budgets',
    icon: Target,
    accent: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
    title: 'Set up a monthly budget',
    description: 'Give each category a spending limit and track how close you are.',
  },
  {
    href: '/dashboard/net-worth',
    icon: TrendingUp,
    accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    title: 'Check your Net Worth',
    description: 'See everything you own minus what you owe, all in one place.',
  },
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

  // If the user skipped account creation, lead with that — recording a
  // transaction is impossible without an account.
  const nextSteps =
    (accountCount ?? 0) > 0
      ? [recordTransactionStep, ...planningSteps]
      : [addAccountStep, ...planningSteps]

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/8 via-background to-background p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <StepIndicator step={5} />
          <div className="flex flex-col items-center gap-3 pt-2 text-center">
            <CheckCircle2 className="size-16 text-emerald-500" aria-hidden="true" />
            <CardTitle className="text-2xl">You&apos;re all set!</CardTitle>
            <p className="text-sm text-muted-foreground">
              Your household is ready. Here&apos;s what you set up — and where to
              go next.
            </p>
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
            <div className="space-y-2">
              {nextSteps.map((step) => (
                <Link
                  key={step.href}
                  href={step.href}
                  className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
                      step.accent
                    )}
                    aria-hidden="true"
                  >
                    <step.icon />
                  </span>
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-sm font-semibold">
                      {step.title}
                    </span>
                    <span className="block text-xs leading-snug text-muted-foreground">
                      {step.description}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          </div>

          <Link
            href="/dashboard"
            className={cn(buttonVariants(), 'h-11 w-full rounded-xl')}
          >
            Go to my dashboard →
          </Link>

          <p className="text-center text-xs text-muted-foreground">
            You can always come back to these from the sidebar. The dashboard is
            your home base.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
