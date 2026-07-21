import { redirect } from 'next/navigation'
import { createHouseholdAction } from '../actions'
import { StepIndicator } from '../step-indicator'
import { createClient } from '@/lib/supabase/server'
import { getActiveCurrencies } from '@/lib/currencies'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/submit-button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default async function OnboardingHouseholdPage() {
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
    redirect('/onboarding/account')
  }

  const currencies = await getActiveCurrencies()
  const defaultCurrency =
    currencies.find((currency) => currency.code === 'CAD')?.code ??
    currencies[0]?.code

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/8 via-background to-background p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <StepIndicator step={2} />
          <CardTitle>Your household</CardTitle>
          <CardDescription>
            A household is the shared space for all your accounts and
            transactions. If you share finances with a partner or family, you
            can invite them later.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form action={createHouseholdAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Household name</Label>
              <Input
                id="name"
                name="name"
                placeholder="My Household"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baseCurrency">Base currency</Label>
              <Select name="baseCurrency" defaultValue={defaultCurrency}>
                <SelectTrigger id="baseCurrency" className="w-full">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} — {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SubmitButton
              type="submit"
              className="h-11 w-full rounded-xl"
              pendingText="Creating household"
            >
              Create household
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
