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

/** BR-039: one account that has opted into "transfers in count as expense". */
export type TransferExpenseAccount = { id: string; name: string }

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
  /**
   * BR-039: how much of `expenses` came from transfers into accounts flagged
   * "count transfers in as expense". Already included in `expenses`, `net`,
   * `txCount`, the trend and the week rows — reported separately so the screen
   * can say so, and because these have no category (see `categories`).
   */
  transferExpenses: number
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
  /**
   * BR-039: this row is the inflow leg of a transfer into a flagged account,
   * surfaced as an expense for reporting only. It carries no allocation, so it
   * never reaches the category breakdown (and therefore never disagrees with a
   * budget, which is category-driven).
   */
  isTransferExpense?: true
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

/**
 * BR-039 — the inflow legs of transfers into accounts flagged "count transfers
 * in as expense", shaped as expense rows so every downstream rollup (KPIs,
 * trend, week rows, calendar days) picks them up without special-casing.
 *
 * Deliberately a separate query from `fetchFilteredRows`: that one derives each
 * transaction's amount from the *sum* of its entries, which is ~0 for a transfer
 * by construction. What matters here is one specific leg — the amount that
 * arrived in the flagged account — so the entry is read directly.
 *
 * The ledger is not consulted differently and not written: this only re-labels a
 * balance-neutral movement on the way into a report.
 */
async function fetchTransferExpenseRows(
  ctx: HouseholdContext,
  from: string,
  to: string,
  filters: {
    accountIds: string[]
    expandedCategoryIds: Set<string>
    tagIds: string[]
    transferExpenseAccounts: Map<string, string>
  }
): Promise<FilteredRow[]> {
  if (filters.transferExpenseAccounts.size === 0) return []
  // A transfer carries no allocation, so narrowing the report to categories
  // excludes these rows by definition rather than by omission.
  if (filters.expandedCategoryIds.size > 0) return []

  const { data: txData } = await ctx.supabase
    .from('transactions')
    .select('id, transaction_type, merchant_name, transaction_date')
    .eq('household_id', ctx.household.id)
    .eq('status', 'posted')
    .is('deleted_at', null)
    .eq('transaction_type', 'transfer')
    .gte('transaction_date', from)
    .lte('transaction_date', to)

  const txs = (txData ?? []) as TxRow[]
  if (txs.length === 0) return []
  const txIds = txs.map((t) => t.id)

  const [{ data: entryData }, tagResult] = await Promise.all([
    ctx.supabase
      .from('transaction_entries')
      .select('transaction_id, account_id, amount_base_currency')
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
  const accountsByTx = new Map<string, Set<string>>()
  for (const entry of entries) {
    const set = accountsByTx.get(entry.transaction_id) ?? new Set<string>()
    set.add(entry.account_id)
    accountsByTx.set(entry.transaction_id, set)
  }
  const tagsByTx = new Map<string, Set<string>>()
  for (const link of (tagResult.data ?? []) as TagLinkRow[]) {
    const set = tagsByTx.get(link.transaction_id) ?? new Set<string>()
    set.add(link.tag_id)
    tagsByTx.set(link.transaction_id, set)
  }

  const accountFilter = new Set(filters.accountIds)
  const tagFilter = new Set(filters.tagIds)
  const dateByTx = new Map(txs.map((t) => [t.id, t.transaction_date]))
  const rows: FilteredRow[] = []

  for (const entry of entries) {
    const accountName = filters.transferExpenseAccounts.get(entry.account_id)
    if (!accountName) continue
    // Only the leg that received money. The paying leg of the same transfer is
    // negative and must never be counted — that would double the movement.
    const amount = Number(entry.amount_base_currency)
    if (!(amount > 0)) continue

    const date = dateByTx.get(entry.transaction_id)
    if (!date) continue
    if (accountFilter.size > 0) {
      const accounts = accountsByTx.get(entry.transaction_id)
      if (!accounts || ![...accounts].some((id) => accountFilter.has(id))) continue
    }
    if (tagFilter.size > 0) {
      const tags = tagsByTx.get(entry.transaction_id)
      if (!tags || ![...tags].some((id) => tagFilter.has(id))) continue
    }

    rows.push({
      id: entry.transaction_id,
      type: 'expense',
      // Named after the destination so the merchant breakdown reads as "where
      // the money went" rather than lumping these under "Uncategorized".
      merchant: `→ ${accountName}`,
      date,
      month: date.slice(0, 7),
      // Negative, matching how a real expense's entries sum, so every consumer
      // that does `Math.abs(baseSigned)` stays correct.
      baseSigned: -amount,
      categoryId: null,
      allocationType: null,
      allocationAmount: 0,
      isTransferExpense: true,
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

/** BR-037: one calendar day of a month grid. */
export type CalendarDay = {
  /** `YYYY-MM-DD`. Every day of the month is present, including empty ones. */
  date: string
  income: number
  expenses: number
  net: number
  txCount: number
}

export type CalendarMonth = {
  days: CalendarDay[]
  income: number
  expenses: number
  net: number
  txCount: number
  /** BR-039 portion already included in `expenses` (see `ReportData`). */
  transferExpenses: number
}

/**
 * BR-037 — per-day income/expense/net for one calendar month.
 *
 * Built from the same rows as `/dashboard/reports` (`fetchFilteredRows`, with no
 * filters applied) so the grid and the report agree for the same range by
 * construction rather than by coincidence, including BR-039's transfers-as-
 * expense. Days with no activity are kept as zero rows — a month grid with holes
 * in it would be unreadable.
 */
export async function getCalendarMonth(
  ctx: HouseholdContext,
  month: string,
  transferExpenseAccounts: Map<string, string> = new Map()
): Promise<CalendarMonth> {
  const [year, monthNumber] = month.split('-').map(Number)
  const monthStart = `${month}-01`
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
  const dayCount = Number(monthEnd.slice(8))

  const noFilters = {
    type: 'all' as const,
    accountIds: [] as string[],
    expandedCategoryIds: new Set<string>(),
    tagIds: [] as string[],
  }

  const [ledgerRows, transferRows] = await Promise.all([
    fetchFilteredRows(ctx, monthStart, monthEnd, noFilters),
    fetchTransferExpenseRows(ctx, monthStart, monthEnd, {
      ...noFilters,
      transferExpenseAccounts,
    }),
  ])
  const rows = [...ledgerRows, ...transferRows]

  const byDate = new Map<string, CalendarDay>()
  for (let day = 1; day <= dayCount; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`
    byDate.set(date, { date, income: 0, expenses: 0, net: 0, txCount: 0 })
  }

  for (const row of rows) {
    const entry = byDate.get(row.date)
    // A row outside the month cannot happen with this range, but skipping beats
    // silently folding it into the wrong day.
    if (!entry) continue
    if (row.type === 'income') entry.income += row.baseSigned
    else entry.expenses += Math.abs(row.baseSigned)
    entry.txCount += 1
  }

  const days = [...byDate.values()]
  for (const day of days) day.net = day.income - day.expenses

  return {
    days,
    income: days.reduce((sum, d) => sum + d.income, 0),
    expenses: days.reduce((sum, d) => sum + d.expenses, 0),
    net: days.reduce((sum, d) => sum + d.net, 0),
    txCount: days.reduce((sum, d) => sum + d.txCount, 0),
    transferExpenses: transferRows.reduce((sum, r) => sum + Math.abs(r.baseSigned), 0),
  }
}

/**
 * BR-039 — the household's accounts that opted into "transfers in count as
 * expense". Returned as id → name so the reporting rows can label themselves.
 */
export async function getTransferExpenseAccounts(
  ctx: HouseholdContext
): Promise<Map<string, string>> {
  const { data } = await ctx.supabase
    .from('accounts')
    .select('id, name')
    .eq('household_id', ctx.household.id)
    .eq('treat_transfers_as_expense', true)
    .is('deleted_at', null)
  return new Map(
    ((data ?? []) as TransferExpenseAccount[]).map((a) => [a.id, a.name])
  )
}

export async function getReportData(
  ctx: HouseholdContext,
  filters: ReportFilters,
  categoryLookup: Map<string, CategoryLookup>,
  /** BR-039: id → name. Pass an empty map (the default) to report the pure ledger. */
  transferExpenseAccounts: Map<string, string> = new Map()
): Promise<ReportData> {
  const expandedCategoryIds = expandCategoryIds(filters.categoryIds, categoryLookup)
  const rowFilters = {
    type: filters.type,
    accountIds: filters.accountIds,
    expandedCategoryIds,
    tagIds: filters.tagIds,
  }
  // An income-only report never gains expense rows.
  const transferFilters = {
    accountIds: filters.accountIds,
    expandedCategoryIds,
    tagIds: filters.tagIds,
    transferExpenseAccounts:
      filters.type === 'income' ? new Map<string, string>() : transferExpenseAccounts,
  }

  // Trend window: the 6 months ending at the range end's month, so it stays a
  // stable 6-point chart regardless of the (possibly narrow) selected range.
  const endMonth = filters.dateTo.slice(0, 7)
  const trendStart = `${shiftMonth(endMonth, -5)}-01`

  const [ledgerRangeRows, ledgerTrendRows, transferRangeRows, transferTrendRows] =
    await Promise.all([
      fetchFilteredRows(ctx, filters.dateFrom, filters.dateTo, rowFilters),
      fetchFilteredRows(ctx, trendStart, filters.dateTo, rowFilters),
      fetchTransferExpenseRows(ctx, filters.dateFrom, filters.dateTo, transferFilters),
      fetchTransferExpenseRows(ctx, trendStart, filters.dateTo, transferFilters),
    ])
  const rangeRows = [...ledgerRangeRows, ...transferRangeRows]
  const trendRows = [...ledgerTrendRows, ...transferTrendRows]

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
    transferExpenses: transferRangeRows.reduce(
      (sum, row) => sum + Math.abs(row.baseSigned),
      0
    ),
  }
}
