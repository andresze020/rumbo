import { redirect } from 'next/navigation'
import { StepIndicator } from '../step-indicator'
import { AccountStepForm, type OnboardingAccount } from './account-step-form'
import { createClient } from '@/lib/supabase/server'
import { getActiveCurrencies } from '@/lib/currencies'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Callout } from '@/components/callout'

type OnboardingAccountPageProps = {
  searchParams: Promise<{ error?: string; created?: string }>
}

export default async function OnboardingAccountPage({
  searchParams,
}: OnboardingAccountPageProps) {
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

  const { data: household } = await supabase
    .from('households')
    .select('base_currency')
    .eq('id', profile.default_household_id)
    .single()

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, account_type, currency_code')
    .eq('household_id', profile.default_household_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  const existingAccounts = (accounts ?? []) as OnboardingAccount[]

  const currencies = await getActiveCurrencies()
  const defaultCurrency =
    currencies.find((currency) => currency.code === household?.base_currency)
      ?.code ??
    currencies[0]?.code ??
    'CAD'

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/8 via-background to-background p-4 sm:p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-2">
          <StepIndicator step={3} />
          <CardTitle>Your accounts</CardTitle>
          <CardDescription>
            An account is a place where your money lives. Add as many as you
            need — a checking account, a credit card, cash. You can always add
            more later.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {errorMessage ? <Callout variant="error">{errorMessage}</Callout> : null}
          {created ? <Callout variant="success">Account added.</Callout> : null}
          <AccountStepForm
            existingAccounts={existingAccounts}
            currencies={currencies}
            defaultCurrency={defaultCurrency}
          />
        </CardContent>
      </Card>
    </main>
  )
}
