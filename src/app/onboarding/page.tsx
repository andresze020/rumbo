import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/households/server'
import { WelcomeButton } from './welcome-button'
import { RecoverActiveHousehold } from './recover-active-household'
import { getLocale } from '@/lib/i18n/server'
import { isHouseholdSharingEnabled } from '@/lib/households/sharing-flag'
import {
  FormerHouseholdsSection,
  parseFormerHouseholds,
} from '@/app/dashboard/settings/former-households-section'
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

  // MEM-7: a default household the user no longer belongs to. The dashboard
  // layout and its pages all land here with one, so this is where it is
  // repaired (RecoverActiveHousehold); the welcome below only shows if that
  // repair fails.
  const { staleId } = await getHouseholdContext()

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.default_household_id && !staleId) {
    const { count: accountCount } = await supabase
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', profile.default_household_id)
      .is('deleted_at', null)

    if ((accountCount ?? 0) > 0) {
      redirect('/dashboard')
    }
  }

  // HH-5 (LIF-2): someone removed from their only household lands here; for 30
  // days they can still download their private data from it.
  const formerHouseholds = isHouseholdSharingEnabled()
    ? parseFormerHouseholds((await supabase.rpc('get_my_former_households')).data)
    : []
  const locale = await getLocale()

  const welcome = (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary/8 via-background to-background p-4 sm:p-6">
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
      {formerHouseholds.length > 0 ? (
        <div className="w-full max-w-md">
          <FormerHouseholdsSection locale={locale} households={formerHouseholds} />
        </div>
      ) : null}
    </main>
  )

  return staleId ? <RecoverActiveHousehold>{welcome}</RecoverActiveHousehold> : welcome
}
