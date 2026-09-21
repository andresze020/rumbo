import { describe, expect, it } from 'vitest'

import {
  type QueryTiming,
  findRepeats,
  percentile,
  rollupByLabel,
  summarizeConcurrency,
} from './stats'

function timing(label: string, startedAt: number, durationMs: number, extra: Partial<QueryTiming> = {}): QueryTiming {
  return {
    label,
    startedAt,
    endedAt: startedAt + durationMs,
    durationMs,
    status: 200,
    bytes: null,
    rows: null,
    totalRows: null,
    ok: true,
    ...extra,
  }
}

describe('percentile', () => {
  it('interpolates between samples', () => {
    const values = [10, 20, 30, 40]
    expect(percentile(values, 0.5)).toBe(25)
    expect(percentile(values, 0)).toBe(10)
    expect(percentile(values, 1)).toBe(40)
  })

  it('does not care about input order', () => {
    expect(percentile([40, 10, 30, 20], 0.5)).toBe(25)
  })

  it('returns null for an empty sample instead of a misleading zero', () => {
    expect(percentile([], 0.5)).toBeNull()
  })

  it('returns the only sample when there is one', () => {
    expect(percentile([7], 0.95)).toBe(7)
  })
})

describe('summarizeConcurrency', () => {
  it('reports a fully sequential chain as serialRatio 1', () => {
    // The shape of dashboard/page.tsx:276-305 — each await starts when the
    // previous one ends.
    const entries = [timing('a', 0, 100), timing('b', 100, 100), timing('c', 200, 100)]
    const summary = summarizeConcurrency(entries)

    expect(summary.sumMs).toBe(300)
    expect(summary.busyMs).toBe(300)
    expect(summary.wallMs).toBe(300)
    expect(summary.maxConcurrency).toBe(1)
    expect(summary.serialRatio).toBe(1)
  })

  it('reports a Promise.all as overlapping work', () => {
    // The shape of net-worth/page.tsx:293-302 — seven calls at once.
    const entries = Array.from({ length: 7 }, (_, index) => timing(`call-${index}`, 0, 100))
    const summary = summarizeConcurrency(entries)

    expect(summary.sumMs).toBe(700)
    expect(summary.busyMs).toBe(100)
    expect(summary.wallMs).toBe(100)
    expect(summary.maxConcurrency).toBe(7)
    expect(summary.serialRatio).toBeCloseTo(1 / 7, 10)
  })

  it('handles a gap where nothing was in flight', () => {
    // Render work between two queries is not query time.
    const summary = summarizeConcurrency([timing('a', 0, 50), timing('b', 200, 50)])
    expect(summary.wallMs).toBe(250)
    expect(summary.busyMs).toBe(100)
    expect(summary.serialRatio).toBe(1)
  })

  it('treats a handoff at the same instant as sequential, not overlapping', () => {
    const summary = summarizeConcurrency([timing('a', 0, 100), timing('b', 100, 100)])
    expect(summary.maxConcurrency).toBe(1)
  })

  it('measures partial overlap', () => {
    const summary = summarizeConcurrency([timing('a', 0, 100), timing('b', 50, 100)])
    expect(summary.sumMs).toBe(200)
    expect(summary.busyMs).toBe(150)
    expect(summary.maxConcurrency).toBe(2)
    expect(summary.serialRatio).toBe(0.75)
  })

  it('returns zeroes for an empty request rather than dividing by zero', () => {
    expect(summarizeConcurrency([])).toEqual({
      count: 0,
      wallMs: 0,
      busyMs: 0,
      sumMs: 0,
      maxConcurrency: 0,
      serialRatio: 0,
    })
  })
})

describe('rollupByLabel', () => {
  it('collapses repeated calls and sorts by total time spent', () => {
    const entries = [
      timing('rpc:get_account_balances', 0, 100, { rows: 10, bytes: 500 }),
      timing('rpc:get_account_balances', 100, 300, { rows: 10, bytes: 500 }),
      timing('from:categories', 400, 50, { rows: 20, bytes: 900 }),
    ]
    const rollup = rollupByLabel(entries)

    expect(rollup.map((row) => row.label)).toEqual(['rpc:get_account_balances', 'from:categories'])
    expect(rollup[0].calls).toBe(2)
    expect(rollup[0].totalMs).toBe(400)
    expect(rollup[0].maxMs).toBe(300)
    expect(rollup[0].rows).toBe(20)
    expect(rollup[0].bytes).toBe(1000)
  })

  it('keeps a sum null when no response reported the figure', () => {
    // Null means "not measured", which must not silently become 0.
    const rollup = rollupByLabel([timing('from:accounts', 0, 10)])
    expect(rollup[0].bytes).toBeNull()
    expect(rollup[0].rows).toBeNull()
  })
})

describe('findRepeats', () => {
  it('surfaces only the calls that ran more than once in one request', () => {
    const entries = [
      timing('rpc:get_account_balances', 0, 100),
      timing('rpc:get_account_balances', 100, 100),
      timing('from:categories', 200, 10),
    ]
    expect(findRepeats(entries).map((row) => row.label)).toEqual(['rpc:get_account_balances'])
  })

  it('finds nothing when every call is distinct', () => {
    expect(findRepeats([timing('a', 0, 1), timing('b', 1, 1)])).toEqual([])
  })
})
