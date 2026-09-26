/**
 * Spending pace (Dashboard, 2026-09-26): cumulative spending by day for the
 * month on screen and the month before it, and how far ahead or behind the
 * previous month's pace the current month is at the same day.
 *
 * Pure: the daily amounts come from `getDailyExpenses` (lib/dashboard/
 * daily-expenses), which reads the same expense allocations, with the same
 * filters, as `get_monthly_dashboard_summary`, so the last point of the
 * current series is the Dashboard's "Spent" figure.
 */

export type DailyAmounts = Map<string, number>

export type SpendingPace = {
  /** Cumulative spend per day, day 1 first, through `throughDay`. */
  current: number[]
  /** Cumulative spend per day of the previous month, the whole month. */
  previous: number[]
  daysInMonth: number
  daysInPreviousMonth: number
  /**
   * Last day of the current series: for the open month, today (or a later day
   * that already has a posted expense); else the month's last day.
   */
  throughDay: number
  /** Previous month's cumulative spend at `throughDay` (its last day when shorter). */
  previousAtSameDay: number
  /** current − previousAtSameDay; negative means spending less than last month by now. */
  diffAtSameDay: number
}

export function daysInMonth(month: string): number {
  const [year, mon] = month.split('-').map(Number)
  return new Date(Date.UTC(year, mon, 0)).getUTCDate()
}

export function previousMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(Date.UTC(year, mon - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function cumulative(month: string, days: number, amounts: DailyAmounts): number[] {
  const out: number[] = []
  let running = 0
  for (let day = 1; day <= days; day += 1) {
    running += amounts.get(`${month}-${String(day).padStart(2, '0')}`) ?? 0
    out.push(running)
  }
  return out
}

/**
 * `null` for a month that has not started yet (nothing to plot). `todayIso` is
 * `YYYY-MM-DD`; for the open month the current series stops at today, so the
 * line ends where the month actually is rather than flat-lining to day 30.
 */
export function buildSpendingPace(month: string, todayIso: string, amounts: DailyAmounts): SpendingPace | null {
  const todayMonth = todayIso.slice(0, 7)
  if (month > todayMonth) return null

  const prev = previousMonth(month)
  const days = daysInMonth(month)
  const prevDays = daysInMonth(prev)
  // A posted expense dated later this month (entered ahead) still counts in
  // the month's total, so the line runs to it: its end is always "Spent".
  let lastDataDay = 0
  for (const [date, amount] of amounts) {
    if (date.startsWith(`${month}-`) && amount !== 0) lastDataDay = Math.max(lastDataDay, Number(date.slice(8, 10)))
  }
  const throughDay = month === todayMonth ? Math.max(Number(todayIso.slice(8, 10)), lastDataDay) : days

  const current = cumulative(month, throughDay, amounts)
  const previous = cumulative(prev, prevDays, amounts)
  const previousAtSameDay = previous[Math.min(throughDay, prevDays) - 1] ?? 0
  const spentSoFar = current[current.length - 1] ?? 0

  return {
    current,
    previous,
    daysInMonth: days,
    daysInPreviousMonth: prevDays,
    throughDay,
    previousAtSameDay,
    diffAtSameDay: spentSoFar - previousAtSameDay,
  }
}
