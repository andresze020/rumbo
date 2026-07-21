'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cleanSupabaseActionError as cleanRpcError } from '@/lib/supabase/errors'

function redirectWithError(message: string): never {
  redirect(`/dashboard/transactions/import?error=${encodeURIComponent(message)}`)
}

type ImportedRow = {
  created_transaction_id: string | null
  mapped_data: {
    merchant_name?: unknown
  } | null
}

async function getAuthenticatedHousehold() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    redirectWithError('Could not load your household.')
  }

  if (!profile?.default_household_id) {
    redirect('/onboarding')
  }

  return {
    supabase,
    householdId: profile.default_household_id as string,
  }
}

export async function createCsvImportAction(formData: FormData) {
  const fileName = String(formData.get('file_name') ?? '').trim()
  const fileHash = String(formData.get('file_hash') ?? '').trim()
  const targetAccountId = String(formData.get('target_account_id') ?? '').trim()
  const mappingJson = String(formData.get('mapping_json') ?? '').trim()
  const rowsJson = String(formData.get('rows_json') ?? '').trim()

  if (!fileName) {
    redirectWithError('Select a CSV file before importing.')
  }

  if (!rowsJson) {
    redirectWithError('Preview valid rows before importing.')
  }

  let mapping: unknown
  let rows: unknown

  try {
    mapping = mappingJson ? JSON.parse(mappingJson) : {}
    rows = JSON.parse(rowsJson)
  } catch {
    redirectWithError('Import payload could not be read.')
  }

  if (!Array.isArray(rows) || !rows.length) {
    redirectWithError('There are no rows to import.')
  }

  const { supabase, householdId } = await getAuthenticatedHousehold()
  const { data: batchId, error } = await supabase.rpc('create_csv_import', {
    p_household_id: householdId,
    p_file_name: fileName,
    p_file_hash: fileHash || null,
    p_target_account_id: targetAccountId || null,
    p_mapping: mapping,
    p_rows: rows,
  })

  if (error) {
    redirectWithError(
      cleanRpcError(error.message, 'Could not import the CSV transactions.')
    )
  }

  const { data: importedRows, error: importedRowsError } = await supabase
    .from('import_rows')
    .select('created_transaction_id, mapped_data')
    .eq('household_id', householdId)
    .eq('import_batch_id', batchId)
    .eq('validation_status', 'imported')
    .not('created_transaction_id', 'is', null)

  if (importedRowsError) {
    redirectWithError('CSV imported, but merchant names could not be saved.')
  }

  const merchantUpdates = ((importedRows ?? []) as ImportedRow[])
    .map((row) => {
      const merchantName =
        typeof row.mapped_data?.merchant_name === 'string'
          ? row.mapped_data.merchant_name.trim()
          : ''

      return {
        transactionId: row.created_transaction_id,
        merchantName,
      }
    })
    .filter((row) => row.transactionId && row.merchantName)

  // BR-009: resolve each imported merchant name to a payee so CSV rows land with
  // a payee_id (matching manual entry). Resolve once per distinct name — payees
  // are case/whitespace-insensitive — then reuse the id across its rows.
  const payeeIdByMerchant = new Map<string, string>()
  const distinctMerchants = [...new Set(merchantUpdates.map((row) => row.merchantName))]
  const payeeResults = await Promise.all(
    distinctMerchants.map((name) =>
      supabase.rpc('get_or_create_payee', {
        p_household_id: householdId,
        p_name: name,
      })
    )
  )

  if (payeeResults.some((result) => result.error)) {
    redirectWithError('CSV imported, but payees could not be saved.')
  }

  distinctMerchants.forEach((name, index) => {
    const payeeId = payeeResults[index].data as string | null
    if (payeeId) payeeIdByMerchant.set(name, payeeId)
  })

  const merchantUpdateResults = await Promise.all(
    merchantUpdates.map((row) =>
      supabase
        .from('transactions')
        .update({
          merchant_name: row.merchantName,
          payee_id: payeeIdByMerchant.get(row.merchantName) ?? null,
        })
        .eq('household_id', householdId)
        .eq('id', row.transactionId)
    )
  )

  if (merchantUpdateResults.some((result) => result.error)) {
    redirectWithError('CSV imported, but merchant names could not be saved.')
  }

  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/budgets')
  redirect(`/dashboard/transactions/import?imported=1&batch=${batchId}`)
}
