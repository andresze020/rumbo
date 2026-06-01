import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default async function DashboardPage() {
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

  const { data: household, error } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()

  if (error || !household) {
    redirect('/onboarding')
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <p className="text-sm text-muted-foreground">{household.name}</p>
        <h1 className="text-2xl font-semibold tracking-normal">Dashboard</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Household</CardTitle>
          <CardDescription>Your active household settings.</CardDescription>
        </CardHeader>

        <CardContent>
          <p className="text-sm text-muted-foreground">
            Base currency: {household.base_currency}
          </p>

          <p className="mt-4">Accounts and categories are ready.</p>
        </CardContent>
      </Card>
    </main>
  )
}
