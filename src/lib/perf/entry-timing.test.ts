import { describe, expect, it } from 'vitest'
import {
  MAX_SAMPLES,
  appendEntrySample,
  formatEntryRowFigures,
  formatEntrySummary,
  MAX_SAVE_MS,
  parsePendingSave,
  parseEntrySamples,
  summarizeEntrySamples,
  type EntrySample,
} from './entry-timing'

const sample = (event: EntrySample['event'], variant: EntrySample['variant'], ms: number): EntrySample => ({
  event,
  variant,
  ms,
  at: 1,
})

describe('summarizeEntrySamples', () => {
  it('reports n, p50 and p75 per event and variant, in a fixed order', () => {
    const rows = summarizeEntrySamples([
      sample('save', 'next', 900),
      sample('open', 'warm', 100),
      sample('open', 'warm', 200),
      sample('open', 'warm', 300),
      sample('open', 'warm', 400),
      sample('open', 'cold', 1500),
    ])
    expect(rows).toEqual([
      { event: 'open', variant: 'cold', n: 1, p50: 1500, p75: 1500 },
      { event: 'open', variant: 'warm', n: 4, p50: 250, p75: 325 },
      { event: 'save', variant: 'next', n: 1, p50: 900, p75: 900 },
    ])
  })

  it('is empty with no samples', () => {
    expect(summarizeEntrySamples([])).toEqual([])
    expect(formatEntrySummary([])).toBe('')
  })
})

describe('parseEntrySamples', () => {
  it('keeps only well-formed samples and strips any extra field', () => {
    const raw = JSON.stringify([
      { event: 'open', variant: 'warm', ms: 120, at: 5, amount: 42, householdId: 'x' },
      { event: 'open', variant: 'next', ms: 120, at: 5 },
      { event: 'save', variant: 'close', ms: -1, at: 5 },
      { event: 'other', variant: 'warm', ms: 1, at: 5 },
      null,
    ])
    expect(parseEntrySamples(raw)).toEqual([{ event: 'open', variant: 'warm', ms: 120, at: 5 }])
  })

  it('never throws on junk', () => {
    expect(parseEntrySamples(null)).toEqual([])
    expect(parseEntrySamples('{')).toEqual([])
    expect(parseEntrySamples('{"a":1}')).toEqual([])
  })
})

describe('appendEntrySample', () => {
  it('keeps the most recent MAX_SAMPLES', () => {
    let samples: EntrySample[] = []
    for (let i = 0; i < MAX_SAMPLES + 5; i++) samples = appendEntrySample(samples, sample('open', 'warm', i))
    expect(samples).toHaveLength(MAX_SAMPLES)
    expect(samples[0].ms).toBe(5)
  })
})

describe('formatEntrySummary', () => {
  it('renders one tab-separated line per row', () => {
    expect(
      formatEntrySummary([{ event: 'open', variant: 'cold', n: 3, p50: 900, p75: 1100 }])
    ).toBe('open.cold\tn=3\tp50=900ms\tp75=1100ms')
  })
})

describe('formatEntryRowFigures', () => {
  it('is numbers only', () => {
    expect(
      formatEntryRowFigures({ event: 'save', variant: 'next', n: 2, p50: 800, p75: 950 })
    ).toBe('n=2 · p50 800 ms · p75 950 ms')
  })
})

describe('parsePendingSave', () => {
  const now = 1_000_000
  it('reads a recent marker', () => {
    expect(parsePendingSave(JSON.stringify({ variant: 'next', startedAt: now - 800 }), now)).toEqual({
      variant: 'next',
      startedAt: now - 800,
    })
  })

  it('drops stale, future, malformed or foreign markers', () => {
    expect(parsePendingSave(JSON.stringify({ variant: 'close', startedAt: now - MAX_SAVE_MS - 1 }), now)).toBeNull()
    expect(parsePendingSave(JSON.stringify({ variant: 'close', startedAt: now + 5 }), now)).toBeNull()
    expect(parsePendingSave(JSON.stringify({ variant: 'warm', startedAt: now }), now)).toBeNull()
    expect(parsePendingSave('{', now)).toBeNull()
    expect(parsePendingSave(null, now)).toBeNull()
  })
})
