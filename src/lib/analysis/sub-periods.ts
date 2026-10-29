import { periodLabelForDate, resolvePeriod } from '@/lib/periods/month'

/** BR-042: one row of the Reports breakdown — a week or a month of the range. */
export type SubPeriod = {
  /** ISO start/end of the row, already clipped to the selected range. */
  dateFrom: string
  dateTo: string
  /**
   * Month rows only: the BR-036 period label (`YYYY-MM`) when the row covers
   * that whole period, so the screen can name it ("June 2026"). Null when the
   * row is clipped by the range, or for week rows.
   */
  fullPeriodLabel: string | null
  income: number
  expenses: number
  net: number
  txCount: number
}

export type SubPeriodBreakdown = {
  unit: 'week' | 'month'
  periods: SubPeriod[]
}

/** The fields of a report row the breakdown needs. */
export type SubPeriodRow = {
  type: 'income' | 'expense'
  /** `YYYY-MM-DD` — the transaction's own date. */
  date: string
  baseSigned: number
}

/** Adds whole days to a `YYYY-MM-DD` date, staying on the calendar grid. */
export function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`), exclusive of `from`. */
export function daysBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / msPerDay
  )
}

function emptyRow(dateFrom: string, dateTo: string, fullPeriodLabel: string | null): SubPeriod {
  return { dateFrom, dateTo, fullPeriodLabel, income: 0, expenses: 0, net: 0, txCount: 0 }
}

/** ISO weeks (Monday start) clipped to the range. */
function weekRows(dateFrom: string, dateTo: string): SubPeriod[] {
  const periods: SubPeriod[] = []
  let cursor = dateFrom
  while (cursor <= dateTo) {
    // 0 = Sunday … 6 = Saturday; shift so Monday is the start of the week.
    const [y, m, d] = cursor.split('-').map(Number)
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    const daysToSunday = (7 - ((weekday + 6) % 7)) - 1
    const weekEnd = addDays(cursor, daysToSunday)
    const periodEnd = weekEnd > dateTo ? dateTo : weekEnd
    periods.push(emptyRow(cursor, periodEnd, null))
    cursor = addDays(periodEnd, 1)
  }
  return periods
}

/**
 * The household's periods (BR-036: calendar months unless `month_start_day`
 * moves the boundary) clipped to the range.
 */
function monthRows(dateFrom: string, dateTo: string, monthStartDay: number): SubPeriod[] {
  const periods: SubPeriod[] = []
  let cursor = dateFrom
  while (cursor <= dateTo) {
    const label = periodLabelForDate(cursor, monthStartDay)
    const period = resolvePeriod(label, monthStartDay)
    const periodEnd = period.dateTo > dateTo ? dateTo : period.dateTo
    const isFull = cursor === period.dateFrom && periodEnd === period.dateTo
    periods.push(emptyRow(cursor, periodEnd, isFull ? label : null))
    cursor = addDays(periodEnd, 1)
  }
  return periods
}

/**
 * BR-042 — splits the range into rows and totals each one:
 * - about a month (28–31 days): ISO weeks;
 * - longer, up to a year (32–366 days): the household's months.
 * Anything else (shorter, or "All time" past a year) returns null.
 *
 * The rows are clipped to the range, which is what guarantees the invariant
 * that matters: they partition it exactly, so their totals always sum back to
 * the range totals shown above them. Rows with no activity are kept, rendering
 * as zero rows rather than silently disappearing.
 *
 * 28–31 days covers a calendar month and every BR-036 period. Testing for
 * "exactly one calendar month" would switch the weeks off for a household
 * whose period starts on another day.
 */
export function buildSubPeriods(
  rows: SubPeriodRow[],
  dateFrom: string,
  dateTo: string,
  monthStartDay: number
): SubPeriodBreakdown | null {
  const spanDays = daysBetween(dateFrom, dateTo) + 1
  let unit: SubPeriodBreakdown['unit']
  let periods: SubPeriod[]
  if (spanDays >= 28 && spanDays <= 31) {
    unit = 'week'
    periods = weekRows(dateFrom, dateTo)
  } else if (spanDays > 31 && spanDays <= 366) {
    unit = 'month'
    periods = monthRows(dateFrom, dateTo, monthStartDay)
  } else {
    return null
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

  return { unit, periods }
}
