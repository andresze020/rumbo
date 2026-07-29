import { redirect } from 'next/navigation'
import { ExportDownloadClient } from './export-download-client'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ServerPageHeader as PageHeader } from '@/components/server-page-header'
import { LocalizedClientBoundary } from '@/components/localized-client-boundary'
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
    <LocalizedClientBoundary>
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow={household.name}
        title="Export data"
        description="Download household data as an Excel workbook or a UTF-8 CSV file."
      />

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
    </LocalizedClientBoundary>
  )
}
