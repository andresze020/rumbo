import { headers } from 'next/headers'
import { cache } from 'react'

import { labelFromUrl, rowsFromContentRange, totalFromContentRange } from './label'
import { type QueryTiming, findRepeats, rollupByLabel, summarizeConcurrency } from './stats'

/**
 * RUM-001 — per-request query instrumentation.
 *
 * Every server-side Supabase call leaves as one HTTP request to PostgREST, so a
 * single hook on the client's `fetch` sees all of them: RPCs, table reads,
 * writes and auth round-trips. That is the whole reason this sits here instead
 * of at ~100 call sites — no page needs to be edited to be measured, and there
 * is no instrumentation to forget when a new query is added.
 *
 * **Off unless asked for.** With `RUMBO_PERF` unset, `perfClientOptions()`
 * returns an empty object, `createClient` is byte-for-byte the call it always
 * was, and nothing in this file runs. There is no sampling, no buffer and no
 * cost.
 *
 * **What it cannot see**, and why the baseline needs a browser too: this
 * measures the server's wait on the database. The browser's share — navigation,
 * streaming, hydration, client render — is invisible from here. The two halves
 * are captured separately and added up in `docs/performance-baseline.md`.
 */

/** The single switch. Unset or anything else means fully disabled. */
export function isPerfEnabled(): boolean {
  return process.env.RUMBO_PERF === '1'
}

type Collector = {
  origin: number
  entries: QueryTiming[]
}

/**
 * React's per-request memo. Inside a render every `createClient()` gets the
 * same collector back, which is what makes a repeat in the layout and a repeat
 * in the page add up to one `×2` instead of two separate `×1`s.
 */
const getScopedCollector = cache(
  (): Collector => ({ origin: performance.now(), entries: [] }),
)

/**
 * Outside a render — a route handler, a server action, a test — React does not
 * memoise, so `getScopedCollector()` hands back a fresh object every call and
 * nothing would ever accumulate. This one falls back to a shared collector in
 * exactly that case, and only that case.
 */
let sharedCollector: Collector | null = null

function getCollector(): Collector {
  const first = getScopedCollector()

  // Two calls to a memoised function are free, and their identity is the only
  // reliable way to ask "am I inside a render?" without importing internals.
  if (first === getScopedCollector()) {
    // Memoised: this is genuinely scoped to one request. Drop any shared
    // collector so a previous non-render call cannot leak into this request.
    sharedCollector = null
    return first
  }

  // Not memoised. Everything here shares one collector for the life of the
  // process, so under concurrent load two requests would mix. That is a real
  // limit, and the reason this is an opt-in switch rather than always-on:
  // the baseline is driven one navigation at a time.
  sharedCollector ??= first
  return sharedCollector
}

function readUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function readBytes(response: Response): number | null {
  const header = response.headers.get('content-length')
  if (!header) return null
  const parsed = Number.parseInt(header, 10)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * A `fetch` that records what it did. It never alters the request, never reads
 * the body — reading it would consume the stream the caller is about to parse,
 * and an RPC body holds the user's own search text — and rethrows failures
 * untouched. A request that throws is recorded with status 0 so a timeout shows
 * up in the baseline instead of vanishing from it.
 */
async function instrumentedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const collector = getCollector()
  const url = readUrl(input)
  const { label } = labelFromUrl(url)
  const startedAt = performance.now()

  const record = (endedAt: number, status: number, response: Response | null) => {
    const contentRange = response?.headers.get('content-range') ?? null
    collector.entries.push({
      label,
      startedAt: startedAt - collector.origin,
      endedAt: endedAt - collector.origin,
      durationMs: endedAt - startedAt,
      status,
      bytes: response ? readBytes(response) : null,
      rows: rowsFromContentRange(contentRange),
      totalRows: totalFromContentRange(contentRange),
      ok: response?.ok ?? false,
    })
  }

  try {
    const response = await fetch(input, init)
    record(performance.now(), response.status, response)
    return response
  } catch (error) {
    record(performance.now(), 0, null)
    throw error
  }
}

/**
 * The options spread into `createServerClient`. Empty — and therefore a no-op —
 * whenever the switch is off.
 */
export function perfClientOptions(): { global?: { fetch: typeof fetch } } {
  if (!isPerfEnabled()) return {}
  return { global: { fetch: instrumentedFetch as typeof fetch } }
}

/**
 * Everything measured, as plain data. Safe to log: the labels went through
 * `labelFromUrl`, which drops filter values.
 *
 * Pass the collector explicitly when reading it outside the render that filled
 * it — see `reportPerfAfterResponse`. Resolving it again at that point would
 * hand back a different one.
 */
export function perfSnapshot(collector: Collector = getCollector()) {
  const entries = collector.entries
  return {
    concurrency: summarizeConcurrency(entries),
    byLabel: rollupByLabel(entries),
    repeats: findRepeats(entries),
    entries,
  }
}

/**
 * Best-effort route name. Next does not promise any particular header here, so
 * this tries the ones it does set and falls back to a placeholder rather than
 * guessing — an unlabelled run is still readable when the operator drove one
 * route at a time, which is how `docs/performance-baseline.md` says to run it.
 */
async function resolveRoute(): Promise<string> {
  try {
    const requestHeaders = await headers()
    for (const name of ['x-matched-path', 'x-invoke-path', 'x-pathname', 'next-url']) {
      const value = requestHeaders.get(name)
      if (value) return value
    }
  } catch {
    // Outside a request scope. Not worth failing a log line over.
  }
  return '(unknown route)'
}

/**
 * Prints the request's query timings as one JSON line, prefixed so a run can be
 * pulled out of a noisy dev log with `grep '\[rumbo-perf\]'`.
 *
 * Pass it to `after()` so it runs once the response is done and every query has
 * landed — see `docs/performance-baseline.md`. It is a no-op when the switch is
 * off or nothing was measured, and it never throws: instrumentation must not be
 * the reason a page fails.
 */
export async function logPerfSnapshot(
  route?: string,
  collector: Collector = getCollector(),
): Promise<void> {
  if (!isPerfEnabled()) return

  const snapshot = perfSnapshot(collector)
  if (snapshot.entries.length === 0) return

  const payload = {
    route: route ?? (await resolveRoute()),
    at: new Date().toISOString(),
    queries: snapshot.concurrency.count,
    wallMs: Math.round(snapshot.concurrency.wallMs),
    busyMs: Math.round(snapshot.concurrency.busyMs),
    sumMs: Math.round(snapshot.concurrency.sumMs),
    maxConcurrency: snapshot.concurrency.maxConcurrency,
    serialRatio: Number(snapshot.concurrency.serialRatio.toFixed(3)),
    repeats: snapshot.repeats.map((row) => ({ label: row.label, calls: row.calls })),
    byLabel: snapshot.byLabel.map((row) => ({
      label: row.label,
      calls: row.calls,
      totalMs: Math.round(row.totalMs),
      maxMs: Math.round(row.maxMs),
      rows: row.rows,
      bytes: row.bytes,
    })),
  }

  console.log(`[rumbo-perf] ${JSON.stringify(payload)}`)
}

/**
 * The one line a layout needs. Registers the flush to run after the response,
 * so it sees every query the page made, not just the layout's own.
 *
 * **The collector is captured here, not inside the callback.** This function
 * runs during the render, where `cache()` memoises and `getCollector()` returns
 * the collector the page's fetches will fill. The callback runs after the
 * response, where that is no longer guaranteed: resolving it there would build
 * a fresh empty collector, `logPerfSnapshot` would find nothing to report and
 * return silently, and the instrumentation would look like it simply does not
 * work. Worse, with a concurrent request in flight it could pick up that
 * request's collector instead. Closing over the instance removes both.
 */
export function reportPerfAfterResponse(after: (task: () => Promise<void>) => void): void {
  if (!isPerfEnabled()) return

  const collector = getCollector()

  try {
    after(async () => {
      try {
        await logPerfSnapshot(undefined, collector)
      } catch {
        // Never surface an instrumentation failure to the request.
      }
    })
  } catch {
    // `after` is unavailable in this context; the request still renders.
  }
}
