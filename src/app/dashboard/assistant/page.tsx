import { redirect } from 'next/navigation'
import { AssistantChat } from './assistant-chat'
import { Callout } from '@/components/callout'
import { PageHeader } from '@/components/page-header'
import { createClient } from '@/lib/supabase/server'

type AssistantPageProps = {
  searchParams: Promise<{ created?: string }>
}

export default async function AssistantPage({ searchParams }: AssistantPageProps) {
  const params = await searchParams
  const created = params.created === '1'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.default_household_id) redirect('/onboarding')

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()
  if (householdError || !household) redirect('/onboarding')

  const { data: accountRows } = await supabase
    .from('accounts')
    .select('id, name, currency_code, institution_name')
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .eq('is_archived', false)
    .order('name', { ascending: true })

  const { data: categoryRows } = await supabase
    .from('categories')
    .select('id, name, category_type, reporting_type, parent_category_id')
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .eq('is_archived', false)
    .order('name', { ascending: true })

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow={household.name}
        title="Assistant"
        description="Ask about your finances, or log a transaction from a receipt photo or a voice note."
      />

      {created ? <Callout variant="success">Transaction created from the assistant.</Callout> : null}

      <AssistantChat
        baseCurrency={household.base_currency}
        accounts={accountRows ?? []}
        categories={categoryRows ?? []}
      />
    </main>
  )
}
