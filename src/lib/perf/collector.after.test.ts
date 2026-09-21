import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The regression test for the `after()` collector capture.
 *
 * This needs its own file because it mocks `react`'s `cache`, and `vi.mock` is
 * hoisted to the whole module graph. The mock is what makes the bug reachable:
 * in a real request `cache()` memoises during the render and stops doing so
 * once `after()` runs, and no plain unit test can reach that transition —
 * outside a render Vitest never memoises at all, so the collector happens to be
 * shared and the bug hides.
 *
 * The failure it pins: resolving the collector inside the `after()` callback
 * built a fresh, empty one, `logPerfSnapshot` found nothing to report and
 * returned silently, and the instrumentation emitted no line at all.
 */

/** Flipped by the test to mark the boundary between render and after(). */
let memoizing = true

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: (factory: (...args: never[]) => unknown) => {
      let cached: unknown
      let filled = false
      return (...args: never[]) => {
        if (!memoizing) return factory(...args)
        if (!filled) {
          cached = factory(...args)
          filled = true
        }
        return cached
      }
    },
  }
})

const { perfClientOptions, reportPerfAfterResponse } = await import('./collector')

beforeEach(() => {
  process.env.RUMBO_PERF = '1'
  memoizing = true
})

afterEach(() => {
  delete process.env.RUMBO_PERF
  vi.restoreAllMocks()
})

describe('the render → after() boundary', () => {
  it('still reports the request its queries belonged to', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }))

    // ── during the render: cache() memoises ──────────────────────────────
    let flush: (() => Promise<void>) | null = null
    reportPerfAfterResponse((task) => {
      flush = task
    })

    const perfFetch = perfClientOptions().global!.fetch
    await perfFetch('https://p.supabase.co/rest/v1/rpc/get_account_balances', { method: 'POST' })
    await perfFetch('https://p.supabase.co/rest/v1/transactions?select=id')

    // ── the response is finished: cache() no longer memoises ─────────────
    memoizing = false
    await flush!()

    expect(log).toHaveBeenCalledOnce()
    const payload = JSON.parse((log.mock.calls[0][0] as string).slice('[rumbo-perf] '.length))
    expect(payload.queries).toBe(2)
    expect(payload.byLabel.map((row: { label: string }) => row.label).sort()).toEqual([
      'from:transactions',
      'rpc:get_account_balances',
    ])
  })
})
