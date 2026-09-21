import { describe, expect, it } from 'vitest'

import { groupByAsOfDate } from './multi-date'

type Row = { as_of_date: string; account_id: string }

const row = (as_of_date: string, account_id: string): Row => ({ as_of_date, account_id })

describe('groupByAsOfDate', () => {
  it('buckets rows by their as_of_date, preserving row order within a bucket', () => {
    const rows = [
      row('2026-08-31', 'a'),
      row('2026-09-30', 'a'),
      row('2026-08-31', 'b'),
      row('2026-09-30', 'b'),
    ]
    const byDate = groupByAsOfDate(rows)

    expect([...byDate.keys()].sort()).toEqual(['2026-08-31', '2026-09-30'])
    expect(byDate.get('2026-08-31')).toEqual([row('2026-08-31', 'a'), row('2026-08-31', 'b')])
    expect(byDate.get('2026-09-30')).toEqual([row('2026-09-30', 'a'), row('2026-09-30', 'b')])
  })

  it('returns an empty map for an empty input, not a map with an empty-string key', () => {
    expect(groupByAsOfDate([]).size).toBe(0)
  })

  it('has no entry for a date nobody returned a row for', () => {
    // The RPC always emits a zero-balance row per account per requested date,
    // so an absent key means "no accounts in this household" — callers still
    // read it with `?? []`, but the map itself must not invent an empty bucket.
    const byDate = groupByAsOfDate([row('2026-09-30', 'a')])
    expect(byDate.has('2026-08-31')).toBe(false)
    expect(byDate.get('2026-08-31')).toBeUndefined()
  })

  it('keeps every date distinct even with many accounts', () => {
    const rows = Array.from({ length: 50 }, (_, i) => row('2026-09-30', `account-${i}`))
    const byDate = groupByAsOfDate(rows)
    expect(byDate.size).toBe(1)
    expect(byDate.get('2026-09-30')).toHaveLength(50)
  })
})
