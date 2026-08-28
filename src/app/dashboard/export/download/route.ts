import { type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCsv, todayDateStamp } from '@/lib/exports/csv'
import { buildXlsx, type XlsxColumn } from '@/lib/exports/xlsx'

const EXPORT_TYPES = ['transactions', 'accounts', 'categories'] as const
const EXPORT_FORMATS = ['csv', 'xlsx'] as const
const PAGE_SIZE = 1000

type ExportType = (typeof EXPORT_TYPES)[number]
type ExportFormat = (typeof EXPORT_FORMATS)[number]

/**
 * BR-041 — each export builds one column/row table, then gets serialized as
 * CSV or `.xlsx`. Keeping a single table definition per export is what makes
 * the two formats agree; the format only decides how cells are written.
 */
type ExportTable<T> = {
  sheetName: string
  columns: XlsxColumn<T>[]
  rows: T[]
}

type Household = {
  id: string
  name: string
  base_currency: string
}

type QueryResult<T> = {
  data: T[] | null
  error: { message?: string } | null
}

type Transaction = {
  id: string
  transaction_date: string
  transaction_type: string
  status: string
  source: string
  description: string | null
  merchant_name: string | null
  notes: string | null
  created_at: string
  updated_at: string
  voided_at: string | null
  void_reason: string | null
  import_batch_id: string | null
  import_row_id: string | null
}

type TransactionEntry = {
  id: string
  transaction_id: string
  account_id: string
  entry_type: string
  amount_account_currency: number | string
  currency_code: string
  exchange_rate_to_base: number | string
  amount_base_currency: number | string
  notes: string | null
  created_at: string
  updated_at: string
}

type TransactionAllocation = {
  id: string
  transaction_id: string
  category_id: string
  allocation_type: string
  amount_original_currency: number | string
  currency_code: string
  exchange_rate_to_base: number | string
  amount_base_currency: number | string
  notes: string | null
  created_at: string
}

type Account = {
  id: string
  name: string
  account_type: string
  account_class: string
  currency_code: string
  institution_name: string | null
  last_four: string | null
  opening_balance_date: string
  is_archived: boolean
  include_in_net_worth: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

type AccountBalance = {
  account_id: string
  posted_balance_account_currency: number | string
  pending_balance_account_currency: number | string
  projected_balance_account_currency: number | string
  posted_balance_base_currency: number | string
  pending_balance_base_currency: number | string
  projected_balance_base_currency: number | string
}

type Category = {
  id: string
  name: string
  category_type: string
  reporting_type: string
  parent_category_id: string | null
  is_system: boolean
  is_archived: boolean
  exclude_from_budget: boolean
  exclude_from_reports: boolean
  created_at: string
  updated_at: string
}

type TransactionExportRow = {
  transaction: Transaction
  entry: TransactionEntry | null
  allocation: TransactionAllocation | null
  accountName: string | null
  categoryName: string | null
  parentCategoryId: string | null
  parentCategoryName: string | null
}

type AccountExportRow = {
  account: Account
  balance: AccountBalance | null
}

type CategoryExportRow = {
  category: Category
  parentName: string | null
}

async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<QueryResult<T>>
) {
  const rows: T[] = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await makeQuery(from, to)

    if (error) {
      throw new Error('Could not load export data.')
    }

    const page = data ?? []
    rows.push(...page)

    if (page.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return rows
}

function isExportType(value: string | null): value is ExportType {
  return EXPORT_TYPES.includes(value as ExportType)
}

/** Absent or unrecognized falls back to CSV, the format this route shipped with. */
function resolveFormat(value: string | null): ExportFormat {
  return EXPORT_FORMATS.includes(value as ExportFormat) ? (value as ExportFormat) : 'csv'
}

function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

function csvResponse(csv: string, filename: string) {
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'text/csv; charset=utf-8',
    },
  })
}

function xlsxResponse(workbook: Buffer, filename: string) {
  return new Response(new Uint8Array(workbook), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}

async function getAuthenticatedHousehold() {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      error: errorResponse('Authentication is required.', 401),
      household: null,
      supabase,
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile?.default_household_id) {
    return {
      error: errorResponse('Could not load your household.', 403),
      household: null,
      supabase,
    }
  }

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, name, base_currency')
    .eq('id', profile.default_household_id)
    .single()

  if (householdError || !household) {
    return {
      error: errorResponse('Could not load your household.', 403),
      household: null,
      supabase,
    }
  }

  return {
    error: null,
    household: household as Household,
    supabase,
  }
}

async function buildTransactionsTable({
  household,
  supabase,
}: {
  household: Household
  supabase: Awaited<ReturnType<typeof createClient>>
}) {
  const transactions = await fetchAllRows<Transaction>((from, to) =>
    supabase
      .from('transactions')
      .select(
        'id, transaction_date, transaction_type, status, source, description, merchant_name, notes, created_at, updated_at, voided_at, void_reason, import_batch_id, import_row_id'
      )
      .eq('household_id', household.id)
      .is('deleted_at', null)
      .order('transaction_date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, to)
  )
  const entries = await fetchAllRows<TransactionEntry>((from, to) =>
    supabase
      .from('transaction_entries')
      .select(
        'id, transaction_id, account_id, entry_type, amount_account_currency, currency_code, exchange_rate_to_base, amount_base_currency, notes, created_at, updated_at'
      )
      .eq('household_id', household.id)
      .order('created_at', { ascending: true })
      .range(from, to)
  )
  const allocations = await fetchAllRows<TransactionAllocation>((from, to) =>
    supabase
      .from('transaction_allocations')
      .select(
        'id, transaction_id, category_id, allocation_type, amount_original_currency, currency_code, exchange_rate_to_base, amount_base_currency, notes, created_at'
      )
      .eq('household_id', household.id)
      .order('created_at', { ascending: true })
      .range(from, to)
  )
  const accounts = await fetchAllRows<Account>((from, to) =>
    supabase
      .from('accounts')
      .select(
        'id, name, account_type, account_class, currency_code, institution_name, last_four, opening_balance_date, is_archived, include_in_net_worth, notes, created_at, updated_at'
      )
      .eq('household_id', household.id)
      .range(from, to)
  )
  const categories = await fetchAllRows<Category>((from, to) =>
    supabase
      .from('categories')
      .select(
        'id, name, category_type, reporting_type, parent_category_id, is_system, is_archived, exclude_from_budget, exclude_from_reports, created_at, updated_at'
      )
      .eq('household_id', household.id)
      .range(from, to)
  )
  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const categoriesById = new Map(
    categories.map((category) => [category.id, category])
  )
  const entriesByTransactionId = new Map<string, TransactionEntry[]>()
  const allocationsByTransactionId = new Map<string, TransactionAllocation[]>()

  for (const entry of entries) {
    const transactionEntries =
      entriesByTransactionId.get(entry.transaction_id) ?? []

    transactionEntries.push(entry)
    entriesByTransactionId.set(entry.transaction_id, transactionEntries)
  }

  for (const allocation of allocations) {
    const transactionAllocations =
      allocationsByTransactionId.get(allocation.transaction_id) ?? []

    transactionAllocations.push(allocation)
    allocationsByTransactionId.set(
      allocation.transaction_id,
      transactionAllocations
    )
  }

  // Transactions export one row per transaction-entry/allocation combination.
  // Transfers, opening balances, and principal-only debt payments have entries
  // without allocations, so they export with blank allocation/category columns.
  const rows = transactions.flatMap((transaction) => {
    const transactionEntries =
      entriesByTransactionId.get(transaction.id) ?? [null]
    const transactionAllocations =
      allocationsByTransactionId.get(transaction.id) ?? [null]

    return transactionEntries.flatMap((entry) =>
      transactionAllocations.map((allocation) => {
        const category = allocation
          ? categoriesById.get(allocation.category_id)
          : null
        const parentCategory = category?.parent_category_id
          ? categoriesById.get(category.parent_category_id)
          : null

        return {
          transaction,
          entry,
          allocation,
          accountName: entry
            ? accountsById.get(entry.account_id)?.name ?? null
            : null,
          categoryName: category?.name ?? null,
          parentCategoryId: category?.parent_category_id ?? null,
          parentCategoryName: parentCategory?.name ?? null,
        }
      })
    )
  })
  const columns: XlsxColumn<TransactionExportRow>[] = [
    { header: 'transaction_id', value: (row) => row.transaction.id },
    {
      header: 'transaction_date',
      value: (row) => row.transaction.transaction_date,
    },
    {
      header: 'transaction_type',
      value: (row) => row.transaction.transaction_type,
    },
    { header: 'status', value: (row) => row.transaction.status },
    { header: 'source', value: (row) => row.transaction.source },
    { header: 'description', value: (row) => row.transaction.description },
    { header: 'merchant_name', value: (row) => row.transaction.merchant_name },
    { header: 'notes', value: (row) => row.transaction.notes },
    { header: 'entry_id', value: (row) => row.entry?.id },
    { header: 'entry_type', value: (row) => row.entry?.entry_type },
    { header: 'account_id', value: (row) => row.entry?.account_id },
    { header: 'account_name', value: (row) => row.accountName },
    {
      header: 'amount_account_currency',
      value: (row) => row.entry?.amount_account_currency,
    },
    { header: 'currency_code', value: (row) => row.entry?.currency_code },
    {
      header: 'exchange_rate_to_base',
      value: (row) => row.entry?.exchange_rate_to_base,
    },
    {
      header: 'amount_base_currency',
      value: (row) => row.entry?.amount_base_currency,
    },
    { header: 'entry_notes', value: (row) => row.entry?.notes },
    { header: 'allocation_id', value: (row) => row.allocation?.id },
    {
      header: 'allocation_type',
      value: (row) => row.allocation?.allocation_type,
    },
    { header: 'category_id', value: (row) => row.allocation?.category_id },
    { header: 'category_name', value: (row) => row.categoryName },
    { header: 'parent_category_id', value: (row) => row.parentCategoryId },
    {
      header: 'parent_category_name',
      value: (row) => row.parentCategoryName,
    },
    {
      header: 'allocation_amount_original_currency',
      value: (row) => row.allocation?.amount_original_currency,
    },
    {
      header: 'allocation_currency_code',
      value: (row) => row.allocation?.currency_code,
    },
    {
      header: 'allocation_exchange_rate_to_base',
      value: (row) => row.allocation?.exchange_rate_to_base,
    },
    {
      header: 'allocation_amount_base_currency',
      value: (row) => row.allocation?.amount_base_currency,
    },
    {
      header: 'allocation_notes',
      value: (row) => row.allocation?.notes,
    },
    { header: 'created_at', value: (row) => row.transaction.created_at },
    { header: 'updated_at', value: (row) => row.transaction.updated_at },
    { header: 'voided_at', value: (row) => row.transaction.voided_at },
    { header: 'void_reason', value: (row) => row.transaction.void_reason },
    {
      header: 'import_batch_id',
      value: (row) => row.transaction.import_batch_id,
    },
    { header: 'import_row_id', value: (row) => row.transaction.import_row_id },
  ]

  return { sheetName: 'Transactions', columns, rows }
}

async function buildAccountsTable({
  household,
  supabase,
}: {
  household: Household
  supabase: Awaited<ReturnType<typeof createClient>>
}) {
  const accounts = await fetchAllRows<Account>((from, to) =>
    supabase
      .from('accounts')
      .select(
        'id, name, account_type, account_class, currency_code, institution_name, last_four, opening_balance_date, is_archived, include_in_net_worth, notes, created_at, updated_at'
      )
      .eq('household_id', household.id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .range(from, to)
  )
  const { data: balances, error: balancesError } = await supabase.rpc(
    'get_account_balances',
    {
      p_household_id: household.id,
      p_as_of_date: todayDateStamp(),
    }
  )

  if (balancesError) {
    throw new Error('Could not load account balances.')
  }

  const balancesByAccountId = new Map(
    ((balances ?? []) as AccountBalance[]).map((balance) => [
      balance.account_id,
      balance,
    ])
  )
  const rows = accounts.map((account) => ({
    account,
    balance: balancesByAccountId.get(account.id) ?? null,
  }))
  const columns: XlsxColumn<AccountExportRow>[] = [
    { header: 'account_id', value: (row) => row.account.id },
    { header: 'name', value: (row) => row.account.name },
    { header: 'account_type', value: (row) => row.account.account_type },
    { header: 'account_class', value: (row) => row.account.account_class },
    { header: 'currency_code', value: (row) => row.account.currency_code },
    {
      header: 'institution_name',
      value: (row) => row.account.institution_name,
    },
    // A card suffix is an identifier, not a quantity — "0042" must survive.
    { header: 'last_four', value: (row) => row.account.last_four, type: 'text' },
    {
      header: 'opening_balance_date',
      value: (row) => row.account.opening_balance_date,
    },
    { header: 'is_archived', value: (row) => row.account.is_archived },
    {
      header: 'include_in_net_worth',
      value: (row) => row.account.include_in_net_worth,
    },
    {
      header: 'posted_balance_account_currency',
      value: (row) => row.balance?.posted_balance_account_currency,
    },
    {
      header: 'pending_balance_account_currency',
      value: (row) => row.balance?.pending_balance_account_currency,
    },
    {
      header: 'projected_balance_account_currency',
      value: (row) => row.balance?.projected_balance_account_currency,
    },
    {
      header: 'posted_balance_base_currency',
      value: (row) => row.balance?.posted_balance_base_currency,
    },
    {
      header: 'pending_balance_base_currency',
      value: (row) => row.balance?.pending_balance_base_currency,
    },
    {
      header: 'projected_balance_base_currency',
      value: (row) => row.balance?.projected_balance_base_currency,
    },
    { header: 'notes', value: (row) => row.account.notes },
    { header: 'created_at', value: (row) => row.account.created_at },
    { header: 'updated_at', value: (row) => row.account.updated_at },
  ]

  return { sheetName: 'Accounts', columns, rows }
}

async function buildCategoriesTable({
  household,
  supabase,
}: {
  household: Household
  supabase: Awaited<ReturnType<typeof createClient>>
}) {
  const categories = await fetchAllRows<Category>((from, to) =>
    supabase
      .from('categories')
      .select(
        'id, name, category_type, reporting_type, parent_category_id, is_system, is_archived, exclude_from_budget, exclude_from_reports, created_at, updated_at'
      )
      .eq('household_id', household.id)
      .is('deleted_at', null)
      .order('parent_category_id', { ascending: true, nullsFirst: true })
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })
      .range(from, to)
  )
  const categoriesById = new Map(
    categories.map((category) => [category.id, category])
  )
  const rows = categories.map((category) => ({
    category,
    parentName: category.parent_category_id
      ? categoriesById.get(category.parent_category_id)?.name ?? null
      : null,
  }))
  const columns: XlsxColumn<CategoryExportRow>[] = [
    { header: 'category_id', value: (row) => row.category.id },
    { header: 'name', value: (row) => row.category.name },
    { header: 'category_type', value: (row) => row.category.category_type },
    { header: 'reporting_type', value: (row) => row.category.reporting_type },
    {
      header: 'parent_category_name',
      value: (row) => row.parentName,
    },
    {
      header: 'parent_category_id',
      value: (row) => row.category.parent_category_id,
    },
    { header: 'is_system', value: (row) => row.category.is_system },
    { header: 'is_archived', value: (row) => row.category.is_archived },
    {
      header: 'exclude_from_budget',
      value: (row) => row.category.exclude_from_budget,
    },
    {
      header: 'exclude_from_reports',
      value: (row) => row.category.exclude_from_reports,
    },
    { header: 'created_at', value: (row) => row.category.created_at },
    { header: 'updated_at', value: (row) => row.category.updated_at },
  ]

  return { sheetName: 'Categories', columns, rows }
}

export async function GET(request: NextRequest) {
  const exportType = request.nextUrl.searchParams.get('type')
  const format = resolveFormat(request.nextUrl.searchParams.get('format'))

  if (!isExportType(exportType)) {
    return errorResponse('Select a valid export type.')
  }

  const { error, household, supabase } = await getAuthenticatedHousehold()

  if (error || !household) {
    return error ?? errorResponse('Could not load your household.', 403)
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table: ExportTable<any> =
      exportType === 'transactions'
        ? await buildTransactionsTable({ household, supabase })
        : exportType === 'accounts'
          ? await buildAccountsTable({ household, supabase })
          : await buildCategoriesTable({ household, supabase })

    const filename = `rumbo-${exportType}-${todayDateStamp()}.${format}`

    return format === 'xlsx'
      ? xlsxResponse(buildXlsx(table), filename)
      : csvResponse(buildCsv(table.columns, table.rows), filename)
  } catch {
    return errorResponse('Export failed. Please try again.', 500)
  }
}
