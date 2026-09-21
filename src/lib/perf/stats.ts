/**
 * RUM-001 — the arithmetic behind the baseline.
 *
 * Kept separate from the runtime so it is testable without a Next request:
 * everything here is a pure function over plain data.
 *
 * The interesting one is `summarizeConcurrency`. The backlog's §3.4 #7 claim —
 * "8 of the Dashboard's ~16 round-trips are strictly sequential" — was read off
 * the source. This turns it into a measurement: given when each request started
 * and ended, it reports how much of the total wall time was spent waiting on
 * one request at a time. That number is what RUM-005 has to move, and what
 * proves afterwards that it moved.
 */

export type QueryTiming = {
  label: string
  /** Milliseconds since the collector was created, so entries are comparable. */
  startedAt: number
  endedAt: number
  durationMs: number
  status: number
  /** Bytes, from `content-length`. Null when the server did not send one. */
  bytes: number | null
  /** Rows in this response. Null when `content-range` was absent. */
  rows: number | null
  /** Total matching rows, when a count was requested. */
  totalRows: number | null
  ok: boolean
}

/**
 * Linear-interpolated percentile over an unsorted sample. `p` is a fraction
 * (0.75, not 75). An empty sample has no percentile, so it returns null rather
 * than a misleading 0.
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  if (values.length === 1) return values[0]

  const sorted = [...values].sort((a, b) => a - b)
  const clamped = Math.max(0, Math.min(1, p))
  const position = clamped * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)

  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export type ConcurrencySummary = {
  count: number
  /** Wall time from the first request starting to the last one ending. */
  wallMs: number
  /** Time during which at least one request was in flight. */
  busyMs: number
  /** Sum of every request's own duration. Exceeds busyMs when work overlaps. */
  sumMs: number
  /** Highest number of requests in flight at once. 1 means fully serialized. */
  maxConcurrency: number
  /**
   * busyMs / sumMs, in [0,1]. 1.0 = nothing ever overlapped; 0.25 = the work
   * took a quarter of the time its pieces add up to, so it was well
   * parallelised. This is the single number to watch across RUM-004…007.
   */
  serialRatio: number
}

/**
 * Collapses a set of timings into the shape of the request: how long it really
 * took, how long the pieces add up to, and how much of it ran one-at-a-time.
 */
export function summarizeConcurrency(entries: QueryTiming[]): ConcurrencySummary {
  if (entries.length === 0) {
    return { count: 0, wallMs: 0, busyMs: 0, sumMs: 0, maxConcurrency: 0, serialRatio: 0 }
  }

  const sumMs = entries.reduce((total, entry) => total + entry.durationMs, 0)
  const start = Math.min(...entries.map((entry) => entry.startedAt))
  const end = Math.max(...entries.map((entry) => entry.endedAt))

  // Sweep the start/end points in order, tracking how many are open. An
  // interval of the timeline counts as "busy" whenever depth > 0.
  const events = entries
    .flatMap((entry) => [
      { at: entry.startedAt, delta: 1 },
      { at: entry.endedAt, delta: -1 },
    ])
    // A request ending exactly when another starts is a handoff, not overlap,
    // so close before opening at the same instant.
    .sort((a, b) => a.at - b.at || a.delta - b.delta)

  let depth = 0
  let busyMs = 0
  let maxConcurrency = 0
  let openedAt = 0

  for (const event of events) {
    if (depth > 0) busyMs += event.at - openedAt
    depth += event.delta
    if (depth > maxConcurrency) maxConcurrency = depth
    openedAt = event.at
  }

  return {
    count: entries.length,
    wallMs: end - start,
    busyMs,
    sumMs,
    maxConcurrency,
    // Zero-duration requests would divide by zero; nothing overlapped either.
    serialRatio: sumMs === 0 ? 1 : busyMs / sumMs,
  }
}

/**
 * Groups timings by label so a repeated call is obvious at a glance. This is
 * how the Dashboard's two `get_account_balances` calls and Net worth's seven
 * show up as one row with `calls: 7` instead of seven rows to eyeball.
 */
export type LabelRollup = {
  label: string
  calls: number
  totalMs: number
  p50: number | null
  p75: number | null
  p95: number | null
  maxMs: number
  bytes: number | null
  rows: number | null
}

export function rollupByLabel(entries: QueryTiming[]): LabelRollup[] {
  const groups = new Map<string, QueryTiming[]>()
  for (const entry of entries) {
    const group = groups.get(entry.label)
    if (group) group.push(entry)
    else groups.set(entry.label, [entry])
  }

  const sumOrNull = (values: (number | null)[]): number | null => {
    const known = values.filter((value): value is number => value != null)
    return known.length === 0 ? null : known.reduce((total, value) => total + value, 0)
  }

  return [...groups.entries()]
    .map(([label, group]) => {
      const durations = group.map((entry) => entry.durationMs)
      return {
        label,
        calls: group.length,
        totalMs: durations.reduce((total, value) => total + value, 0),
        p50: percentile(durations, 0.5),
        p75: percentile(durations, 0.75),
        p95: percentile(durations, 0.95),
        maxMs: Math.max(...durations),
        bytes: sumOrNull(group.map((entry) => entry.bytes)),
        rows: sumOrNull(group.map((entry) => entry.rows)),
      }
    })
    .sort((a, b) => b.totalMs - a.totalMs)
}

/**
 * Calls that ran identically more than once inside one request — the cheapest
 * win any of the optimisation tickets can claim, and the thing a static read of
 * the code keeps missing when the repeats sit in different components.
 */
export function findRepeats(entries: QueryTiming[]): LabelRollup[] {
  return rollupByLabel(entries).filter((rollup) => rollup.calls > 1)
}
