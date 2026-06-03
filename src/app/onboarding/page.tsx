import { redirect } from 'next/navigation'
import { createHouseholdAction } from './actions'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

export default async function OnboardingPage() {
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
    redirect('/dashboard')
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your household</CardTitle>
        </CardHeader>

        <CardContent>
          <form action={createHouseholdAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Household name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Andrés & María"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baseCurrency">Base currency</Label>
              <Select name="baseCurrency" defaultValue="CAD">
                <SelectTrigger id="baseCurrency">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAD">CAD — Canadian Dollar</SelectItem>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="COP">COP — Colombian Peso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <SubmitButton
              type="submit"
              className="w-full"
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
