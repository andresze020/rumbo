import { describe, expect, it } from 'vitest'
import {
  HALF_LIFE_DAYS,
  MAX_TRACKED,
  parseUsage,
  rankByUsage,
  recordUsage,
  usageScore,
} from './usage-ranking'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 22, 12)
const items = (...ids: string[]) => ids.map((id) => ({ id }))

describe('parseUsage', () => {
  it('reads the legacy bare-count format with an unknown date', () => {
    expect(parseUsage('{"a":3,"b":0,"c":-1}')).toEqual({ a: { count: 3, lastUsedAt: 0 } })
  })

  it('reads the current format and drops malformed entries', () => {
    expect(
      parseUsage(
        JSON.stringify({
          a: { count: 2, lastUsedAt: NOW },
          b: { count: 'x' },
          c: { count: 1, lastUsedAt: 'yesterday' },
          d: null,
        })
      )
    ).toEqual({ a: { count: 2, lastUsedAt: NOW }, c: { count: 1, lastUsedAt: 0 } })
  })

  it('never throws on junk', () => {
    expect(parseUsage(null)).toEqual({})
    expect(parseUsage('not json')).toEqual({})
    expect(parseUsage('[1,2]')).toEqual({})
    expect(parseUsage('42')).toEqual({})
  })
})

describe('recordUsage', () => {
  it('counts each id once per call and stamps it', () => {
    const next = recordUsage({ a: { count: 1, lastUsedAt: 0 } }, ['a', 'b', 'b'], NOW)
    expect(next).toEqual({
      a: { count: 2, lastUsedAt: NOW },
      b: { count: 1, lastUsedAt: NOW },
    })
  })

  it('dates legacy entries so they start to age, at the weight they already had', () => {
    const next = recordUsage(parseUsage('{"old":10}'), ['new'], NOW)
    expect(next.old).toEqual({ count: 10, lastUsedAt: NOW - HALF_LIFE_DAYS * DAY })
    expect(usageScore(next.old, NOW)).toBeCloseTo(usageScore({ count: 10, lastUsedAt: 0 }, NOW))
    expect(usageScore(next.old, NOW + 60 * DAY)).toBeLessThan(usageScore(next.old, NOW))
  })

  it('drops the least recently used beyond the cap', () => {
    let usage = {}
    for (let i = 0; i < MAX_TRACKED; i++) usage = recordUsage(usage, [`id${i}`], NOW - (MAX_TRACKED - i) * DAY)
    usage = recordUsage(usage, ['fresh'], NOW)
    expect(Object.keys(usage)).toHaveLength(MAX_TRACKED)
    expect(usage).toHaveProperty('fresh')
    expect(usage).not.toHaveProperty('id0')
  })
})

describe('usageScore', () => {
  it('halves every half-life', () => {
    expect(usageScore({ count: 4, lastUsedAt: NOW }, NOW)).toBe(4)
    expect(usageScore({ count: 4, lastUsedAt: NOW - HALF_LIFE_DAYS * DAY }, NOW)).toBeCloseTo(2)
  })

  it('treats a future timestamp (clock change) as now, not as a bonus', () => {
    expect(usageScore({ count: 1, lastUsedAt: NOW + DAY }, NOW)).toBe(1)
  })
})

describe('rankByUsage', () => {
  it('puts this week’s habit above last year’s', () => {
    const usage = {
      old: { count: 40, lastUsedAt: NOW - 365 * DAY },
      daily: { count: 5, lastUsedAt: NOW - DAY },
    }
    expect(rankByUsage(items('old', 'daily'), usage, NOW, 4).map((i) => i.id)).toEqual([
      'daily',
      'old',
    ])
  })

  it('leaves out unused items and respects the limit', () => {
    const usage = parseUsage('{"a":1,"b":2,"c":3}')
    expect(rankByUsage(items('a', 'b', 'c', 'never'), usage, NOW, 2).map((i) => i.id)).toEqual([
      'c',
      'b',
    ])
  })

  it('keeps the caller’s order on ties', () => {
    const usage = { x: { count: 1, lastUsedAt: NOW }, y: { count: 1, lastUsedAt: NOW } }
    expect(rankByUsage(items('y', 'x'), usage, NOW, 5).map((i) => i.id)).toEqual(['y', 'x'])
  })
})
