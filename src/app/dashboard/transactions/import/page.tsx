import { redirect } from 'next/navigation'
import { CsvImportClient } from './csv-import-client'
import { createClient } from '@/lib/supabase/server'

type ImportPageProps = {
  searchParams: Promise<{
    error?: string
    imported?: string
    batch?: string
  }>
}

type Account = {
  id: string
  name: string
  currency_code: string
  institution_name: string | null
}

type Category = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
  is_archived: boolean
  exclude_from_reports: boolean
}

type Currency = {
  code: string
}

export default async function CsvImportPage({ searchParams }: ImportPageProps) {
  const params = await searchParams
  const errorMessage = typeof params.error === 'string' ? params.error : null
  const imported = params.imported === '1'
  const batchId = typeof params.batch === 'string' ? params.batch : null
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

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()

  if (householdError || !household) {
    redirect('/onboarding')
  }

  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, name, currency_code, institution_name')
    .eq('household_id', household.id)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .order('name', { ascending: true })

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select(
      'id, name, category_type, reporting_type, parent_category_id, is_archived, exclude_from_reports'
    )
    .eq('household_id', household.id)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .in('category_type', ['income', 'expense'])
    .order('parent_category_id', { ascending: true, nullsFirst: true })
    .order('name', { ascending: true })

  const { data: currencies, error: currenciesError } = await supabase
    .from('currencies')
    .select('code')
    .eq('is_active', true)
    .order('code', { ascending: true })

  if (accountsError || categoriesError || currenciesError) {
    throw new Error('Could not load CSV import options.')
  }

  return (
    <CsvImportClient
      householdName={household.name}
      baseCurrency={household.base_currency}
      accounts={(accounts ?? []) as Account[]}
      categories={(categories ?? []) as Category[]}
      currencies={(currencies ?? []) as Currency[]}
      errorMessage={errorMessage}
      imported={imported}
      batchId={batchId}
    />
  )
}
