import { redirect } from 'next/navigation'
import { CsvImportClient } from './csv-import-client'
import { createClient } from '@/lib/supabase/server'
import type {
  CsvMapping,
  ImportBatch,
  ImportPreset,
} from '@/lib/imports/types'

type ImportPageProps = {
  searchParams: Promise<{
    error?: string
    imported?: string
    batch?: string
    preset_saved?: string
    preset_deleted?: string
    reverted?: string
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
  const presetSaved = params.preset_saved === '1'
  const presetDeleted = params.preset_deleted === '1'
  const revertedCount =
    typeof params.reverted === 'string' && /^\d+$/.test(params.reverted)
      ? Number(params.reverted)
      : null
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

  // BR-024: saved column-mapping presets for this household.
  const { data: presetRows } = await supabase
    .from('csv_import_presets')
    .select('id, name, mapping, target_account_id')
    .eq('household_id', household.id)
    .order('name', { ascending: true })

  // BR-024: recent import batches (for the "Import history" / revert section).
  const { data: batchRows } = await supabase
    .from('import_batches')
    .select(
      'id, file_name, status, total_rows, imported_transactions_count, invalid_rows, duplicate_rows, created_at, metadata'
    )
    .eq('household_id', household.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10)

  const presets: ImportPreset[] = (presetRows ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    mapping: (row.mapping ?? {}) as Partial<CsvMapping>,
    targetAccountId: (row.target_account_id as string | null) ?? '',
  }))

  const batches: ImportBatch[] = (batchRows ?? []).map((row) => {
    const metadata = (row.metadata ?? {}) as {
      revert?: { revertedTransactions?: number }
    }
    return {
      id: row.id as string,
      fileName: row.file_name as string,
      status: row.status as string,
      totalRows: Number(row.total_rows ?? 0),
      importedCount: Number(row.imported_transactions_count ?? 0),
      invalidRows: Number(row.invalid_rows ?? 0),
      duplicateRows: Number(row.duplicate_rows ?? 0),
      createdAt: row.created_at as string,
      revertedCount:
        typeof metadata.revert?.revertedTransactions === 'number'
          ? metadata.revert.revertedTransactions
          : null,
    }
  })

  return (
    <CsvImportClient
      householdName={household.name}
      baseCurrency={household.base_currency}
      accounts={(accounts ?? []) as Account[]}
      categories={(categories ?? []) as Category[]}
      currencies={(currencies ?? []) as Currency[]}
      presets={presets}
      batches={batches}
      errorMessage={errorMessage}
      imported={imported}
      batchId={batchId}
      presetSaved={presetSaved}
      presetDeleted={presetDeleted}
      revertedCount={revertedCount}
    />
  )
}
