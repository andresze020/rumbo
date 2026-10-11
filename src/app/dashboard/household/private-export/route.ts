import { type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCsv, type CsvColumn } from '@/lib/exports/csv'
import { isHouseholdSharingEnabled } from '@/lib/households/sharing-flag'
import { getRequestToday } from '@/lib/periods/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type PrivateExportRow = {
  transaction_date: string
  account_name: string
  currency_code: string
  amount: number | string
  transaction_type: string
  status: string
  description: string | null
  payee_name: string | null
  category_names: string | null
  notes: string | null
}

const COLUMNS: CsvColumn<PrivateExportRow>[] = [
  { header: 'transaction_date', value: (row) => row.transaction_date },
  { header: 'account_name', value: (row) => row.account_name },
  { header: 'currency_code', value: (row) => row.currency_code },
  { header: 'amount', value: (row) => Number(row.amount) },
  { header: 'transaction_type', value: (row) => row.transaction_type },
  { header: 'status', value: (row) => row.status },
  { header: 'description', value: (row) => row.description },
  { header: 'payee', value: (row) => row.payee_name },
  { header: 'categories', value: (row) => row.category_names },
  { header: 'notes', value: (row) => row.notes },
]

/**
 * HH-5 (LIF-1, LIF-2): the caller's own private data in one household, as CSV.
 *
 * Works for an active member (offered before leaving) and for someone who left
 * or was removed less than 30 days ago (Settings › Former households, or the
 * onboarding page when they have no household left). export_my_private_data
 * decides both and returns only rows whose private owner is the caller. A GET
 * that only reads; nothing is cached.
 */
export async function GET(request: NextRequest) {
  const householdId = request.nextUrl.searchParams.get('household') ?? ''
  if (!isHouseholdSharingEnabled() || !UUID_PATTERN.test(householdId)) {
    return new Response('Not found', { status: 404 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data, error } = await supabase.rpc('export_my_private_data', { p_household_id: householdId })
  if (error) return new Response('This export is no longer available.', { status: 403 })

  const csv = buildCsv(COLUMNS, (data ?? []) as PrivateExportRow[])
  const date = await getRequestToday()
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="rumbo-private-data-${date}.csv"`,
      'Content-Type': 'text/csv; charset=utf-8',
    },
  })
}
