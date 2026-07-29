import 'server-only'
import {
  shiftMonth,
  shortMonthLabel,
  type CategorySlice,
  type HouseholdContext,
  type MerchantSlice,
  type MonthlyPoint,
} from './server'

/**
 * Filter-aware reporting for /dashboard/reports.
 *
 * The monthly-summary RPCs the rest of the analysis screens use are not
 * filter-aware, so this computes KPIs, the category/merchant breakdown, and the
 * trend from the raw ledger (posted income/expense transactions in the selected
 * window), applying account / category / tag / type filters in one place — per
 * the project's ledger rules: amounts come from `transaction_entries` /
 * `transaction_allocations` in base currency, and voided/soft-deleted rows are
 * excluded.
 */

export type ReportFilters = {
  dateFrom: string // YYYY-MM-DD
  dateTo: string // YYYY-MM-DD
  type: 'all' | 'income' | 'expense'
  accountIds: string[]
  categoryIds: string[]
  tagIds: string[]
}

/** BR-042: one week inside the selected month. */
export type SubPeriod = {
  /** ISO start/end of the week, already clipped to the selected month. */
  dateFrom: string
  dateTo: string
  income: number
  expenses: number
  net: number
  txCount: number
}

export type ReportData = {
  income: number
  expenses: number
  net: number
  txCount: number
  categoryCount: number
  /** Whether the category/merchant breakdown shows income or expense flows. */
  breakdownType: 'income' | 'expense'
  categories: CategorySlice[]
  merchants: MerchantSlice[]
  trend: MonthlyPoint[]
  /**
   * Week-by-week rollup of the selected range, or `null` when the range isn't a
   * single month (BR-042's first slice is weeks-within-month only —
   * months-within-year comes later).
   */
  subPeriods: SubPeriod[] | null
}

export type CategoryLookup = {
  id: string
  name: string
  parent_category_id: string | null
  is_archived: boolean
}

type TxRow = {
  id: string
  transaction_type: string
  merchant_name: string | null
  transaction_date: string
}
type EntryRow = { transaction_id: string; account_id: string; amount_base_currency: number | string }
type AllocationRow = {
  transaction_id: string
  category_id: string
  allocation_type: string
  amount_base_currency: number | string
}
type TagLinkRow = { transaction_id: string; tag_id: string }

type FilteredRow = {
  id: string
  type: 'income' | 'expense'
  merchant: string
  /** `YYYY-MM-DD` — the transaction's own date, for sub-period grouping. */
  date: string
  month: string
  baseSigned: number
  categoryId: string | null
  allocationType: string | null
  allocationAmount: number
}

function categoryPath(id: string, byId: Map<string, CategoryLookup>): string {
  const self = byId.get(id)
  if (!self) return 'Uncategorized'
  const parentName = self.parent_category_id ? byId.get(self.parent_category_id)?.name : null
  return parentName ? `${parentName} / ${self.name}` : self.name
}

/** Selected category ids plus every child category of a selected parent. */
function expandCategoryIds(ids: string[], byId: Map<string, CategoryLookup>): Set<string> {
  const selected = new Set(ids)
  if (selected.size === 0) return selected
  for (const cat of byId.values()) {
    if (cat.parent_category_id && selected.has(cat.parent_category_id)) selected.add(cat.id)
  }
  return selected
}

/**
 * Fetch posted income/expense transactions in [from, to] and return the rows
 * that pass the account / category / tag filters, each carrying its base-currency
 * amount, category allocation, and month. Shared by the KPI/breakdown pass and
 * the (wider-window) trend pass.
 */
async function fetchFilteredRows(
  ctx: HouseholdContext,
  from: string,
  to: string,
  filters: {
    type: 'all' | 'income' | 'expense'
    accountIds: string[]
    expandedCategoryIds: Set<string>
    tagIds: string[]
  }
): Promise<FilteredRow[]> {
  let txQuery = ctx.supabase
    .from('transactions')
    .select('id, transaction_type, merchant_name, transaction_date')
    .eq('household_id', ctx.household.id)
    .eq('status', 'posted')
    .is('deleted_at', null)
    .in('transaction_type', ['income', 'expense'])
    .gte('transaction_date', from)
    .lte('transaction_date', to)

  if (filters.type !== 'all') {
    txQuery = txQuery.eq('transaction_type', filters.type)
  }

  const { data: txData } = await txQuery
  const txs = (txData ?? []) as TxRow[]
  if (txs.length === 0) return []
  const txIds = txs.map((t) => t.id)

  // Entries (base amounts + account membership) and allocations (category) are
  // always needed; tag links only when a tag filter is active.
  const [{ data: entryData }, { data: allocData }, tagResult] = await Promise.all([
    ctx.supabase
      .from('transaction_entries')
      .select('transaction_id, account_id, amount_base_currency')
      .eq('household_id', ctx.household.id)
      .in('transaction_id', txIds),
    ctx.supabase
      .from('transaction_allocations')
      .select('transaction_id, category_id, allocation_type, amount_base_currency')
      .eq('household_id', ctx.household.id)
      .in('transaction_id', txIds),
    filters.tagIds.length > 0
      ? ctx.supabase
          .from('transaction_tags')
          .select('transaction_id, tag_id')
          .eq('household_id', ctx.household.id)
          .in('transaction_id', txIds)
      : Promise.resolve({ data: [] as TagLinkRow[] }),
  ])

  const entries = (entryData ?? []) as EntryRow[]
  const allocations = (allocData ?? []) as AllocationRow[]
  const tagLinks = ((tagResult.data ?? []) as TagLinkRow[])

  const baseByTx = new Map<string, number>()
  const accountsByTx = new Map<string, Set<string>>()
  for (const e of entries) {
    baseByTx.set(e.transaction_id, (baseByTx.get(e.transaction_id) ?? 0) + Number(e.amount_base_currency))
    const set = accountsByTx.get(e.transaction_id) ?? new Set<string>()
    set.add(e.account_id)
    accountsByTx.set(e.transaction_id, set)
  }
  const allocByTx = new Map<string, AllocationRow>(allocations.map((a) => [a.transaction_id, a]))
  const tagsByTx = new Map<string, Set<string>>()
  for (const link of tagLinks) {
    const set = tagsByTx.get(link.transaction_id) ?? new Set<string>()
    set.add(link.tag_id)
    tagsByTx.set(link.transaction_id, set)
  }

  const accountFilter = new Set(filters.accountIds)
  const tagFilter = new Set(filters.tagIds)
  const rows: FilteredRow[] = []

  for (const tx of txs) {
    if (accountFilter.size > 0) {
      const accts = accountsByTx.get(tx.id)
      if (!accts || ![...accts].some((id) => accountFilter.has(id))) continue
    }
    if (tagFilter.size > 0) {
      const tags = tagsByTx.get(tx.id)
      if (!tags || ![...tags].some((id) => tagFilter.has(id))) continue
    }
    const alloc = allocByTx.get(tx.id) ?? null
    if (filters.expandedCategoryIds.size > 0) {
      if (!alloc || !filters.expandedCategoryIds.has(alloc.category_id)) continue
    }

    rows.push({
      id: tx.id,
      type: tx.transaction_type === 'income' ? 'income' : 'expense',
      merchant: tx.merchant_name?.trim() || 'Uncategorized',
      date: tx.transaction_date,
      month: tx.transaction_date.slice(0, 7),
      baseSigned: baseByTx.get(tx.id) ?? 0,
      categoryId: alloc?.category_id ?? null,
      allocationType: alloc?.allocation_type ?? null,
      allocationAmount: alloc ? Math.abs(Number(alloc.amount_base_currency)) : 0,
    })
  }

  return rows
}

/** Adds whole days to a `YYYY-MM-DD` date, staying on the calendar grid. */
function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/**
 * BR-042 — splits a single-month range into ISO weeks (Monday-start) clipped to
 * the month, and totals each one. Clipping is what guarantees the invariant
 * that matters: the weeks partition the month exactly, so their totals always
 * sum back to the month totals shown above them. Weeks with no activity are
 * kept, rendering as zero rows rather than silently disappearing.
 *
 * Returns null unless the range is one calendar month — a multi-month range
 * would want month rows instead, which is a later slice.
 */
function buildSubPeriods(
  rows: FilteredRow[],
  dateFrom: string,
  dateTo: string
): SubPeriod[] | null {
  const month = dateFrom.slice(0, 7)
  const [year, monthNumber] = month.split('-').map(Number)
  const monthStart = `${month}-01`
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
  if (dateFrom !== monthStart || dateTo !== monthEnd) return null

  const periods: SubPeriod[] = []
  let cursor = monthStart
  while (cursor <= monthEnd) {
    // 0 = Sunday … 6 = Saturday; shift so Monday is the start of the week.
    const [y, m, d] = cursor.split('-').map(Number)
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    const daysToSunday = (7 - ((weekday + 6) % 7)) - 1
    const weekEnd = addDays(cursor, daysToSunday)
    const periodEnd = weekEnd > monthEnd ? monthEnd : weekEnd

    periods.push({
      dateFrom: cursor,
      dateTo: periodEnd,
      income: 0,
      expenses: 0,
      net: 0,
      txCount: 0,
    })
    cursor = addDays(periodEnd, 1)
  }

  for (const row of rows) {
    const period = periods.find((p) => row.date >= p.dateFrom && row.date <= p.dateTo)
    if (!period) continue
    if (row.type === 'income') period.income += row.baseSigned
    else period.expenses += Math.abs(row.baseSigned)
    period.txCount += 1
  }
  for (const period of periods) {
    period.net = period.income - period.expenses
  }

  return periods
}

export async function getReportData(
  ctx: HouseholdContext,
  filters: ReportFilters,
  categoryLookup: Map<string, CategoryLookup>
): Promise<ReportData> {
  const expandedCategoryIds = expandCategoryIds(filters.categoryIds, categoryLookup)
  const rowFilters = {
    type: filters.type,
    accountIds: filters.accountIds,
    expandedCategoryIds,
    tagIds: filters.tagIds,
  }

  // Trend window: the 6 months ending at the range end's month, so it stays a
  // stable 6-point chart regardless of the (possibly narrow) selected range.
  const endMonth = filters.dateTo.slice(0, 7)
  const trendStart = `${shiftMonth(endMonth, -5)}-01`

  const [rangeRows, trendRows] = await Promise.all([
    fetchFilteredRows(ctx, filters.dateFrom, filters.dateTo, rowFilters),
    fetchFilteredRows(ctx, trendStart, filters.dateTo, rowFilters),
  ])

  let income = 0
  let expenses = 0
  for (const row of rangeRows) {
    if (row.type === 'income') income += row.baseSigned
    else expenses += Math.abs(row.baseSigned)
  }
  const breakdownType: 'income' | 'expense' = filters.type === 'income' ? 'income' : 'expense'

  // Category breakdown from allocations of the shown flow type.
  const catAgg = new Map<string, { value: number; count: number }>()
  for (const row of rangeRows) {
    if (row.allocationType !== breakdownType || !row.categoryId) continue
    const cur = catAgg.get(row.categoryId) ?? { value: 0, count: 0 }
    cur.value += row.allocationAmount
    cur.count += 1
    catAgg.set(row.categoryId, cur)
  }
  const categories: CategorySlice[] = [...catAgg.entries()]
    .map(([categoryId, agg]) => ({
      categoryId,
      name: categoryPath(categoryId, categoryLookup),
      value: agg.value,
      count: agg.count,
    }))
    .sort((a, b) => b.value - a.value)

  // Merchant breakdown from the shown flow type.
  const merchAgg = new Map<string, { value: number; count: number }>()
  for (const row of rangeRows) {
    if (row.type !== breakdownType) continue
    const cur = merchAgg.get(row.merchant) ?? { value: 0, count: 0 }
    cur.value += Math.abs(row.baseSigned)
    cur.count += 1
    merchAgg.set(row.merchant, cur)
  }
  const merchants: MerchantSlice[] = [...merchAgg.entries()]
    .map(([name, agg]) => ({ name, value: agg.value, count: agg.count }))
    .sort((a, b) => b.value - a.value)

  // Trend: filter-aware monthly income/expense over the 6-month window.
  const months: string[] = []
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(endMonth, -i))
  const trendByMonth = new Map<string, { income: number; expenses: number }>()
  for (const row of trendRows) {
    const cur = trendByMonth.get(row.month) ?? { income: 0, expenses: 0 }
    if (row.type === 'income') cur.income += row.baseSigned
    else cur.expenses += Math.abs(row.baseSigned)
    trendByMonth.set(row.month, cur)
  }
  const trend: MonthlyPoint[] = months.map((m) => {
    const agg = trendByMonth.get(m) ?? { income: 0, expenses: 0 }
    const savings = agg.income - agg.expenses
    return {
      month: m,
      label: shortMonthLabel(m),
      income: agg.income,
      expenses: agg.expenses,
      savings,
      savingsRate: agg.income > 0 ? savings / agg.income : null,
    }
  })

  return {
    income,
    expenses,
    net: income - expenses,
    txCount: rangeRows.length,
    categoryCount: categories.length,
    breakdownType,
    categories,
    merchants,
    trend,
    subPeriods: buildSubPeriods(rangeRows, filters.dateFrom, filters.dateTo),
  }
}
