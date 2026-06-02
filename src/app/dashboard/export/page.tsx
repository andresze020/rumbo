import { redirect } from 'next/navigation'
import { ExportDownloadClient } from './export-download-client'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

export default async function ExportPage() {
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
    .select('id, name')
    .eq('id', profile.default_household_id)
    .single()

  if (error || !household) {
    redirect('/onboarding')
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <p className="text-sm text-muted-foreground">{household.name}</p>
        <h1 className="text-2xl font-semibold tracking-normal">Export CSV</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Download household data as UTF-8 CSV files.
        </p>
      </div>

      <ExportDownloadClient />

      <Card>
        <CardHeader>
          <CardTitle>Export format</CardTitle>
          <CardDescription>
            Transactions export one row per entry/allocation combination.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Transfers, opening balances, and principal-only debt payments export
            entry rows with blank allocation fields.
          </p>
          <p>
            Voided transactions are included with their status and void details.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
