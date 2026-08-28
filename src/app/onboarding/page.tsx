import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WelcomeButton } from './welcome-button'
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card'

const benefits = [
  {
    icon: '💰',
    text: 'Know your real balance across all your accounts',
  },
  {
    icon: '📊',
    text: 'See exactly where your money goes each month',
  },
  {
    icon: '🎯',
    text: 'Plan ahead with budgets and savings goals',
  },
]

export default async function OnboardingWelcomePage() {
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

  if (profile?.default_household_id) {
    const { count: accountCount } = await supabase
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', profile.default_household_id)
      .is('deleted_at', null)

    if ((accountCount ?? 0) > 0) {
      redirect('/dashboard')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/8 via-background to-background p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Rumbo</h1>
          <p className="text-muted-foreground">
            Track your money. Understand where it goes.
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          <ul className="space-y-4">
            {benefits.map((benefit) => (
              <li key={benefit.text} className="flex items-start gap-3">
                <span className="text-xl leading-none" aria-hidden="true">
                  {benefit.icon}
                </span>
                <span className="text-sm leading-relaxed">{benefit.text}</span>
              </li>
            ))}
          </ul>

          <WelcomeButton />
        </CardContent>
      </Card>
    </main>
  )
}
