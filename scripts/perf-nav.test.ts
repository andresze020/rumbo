import { describe, expect, it } from 'vitest'

import { percentile } from './perf-nav.mjs'

describe('percentile (perf-nav, nearest rank)', () => {
  it('picks the nearest-rank sample, never interpolating a value nobody measured', () => {
    const samples = [900, 100, 300, 500, 700]
    expect(percentile(samples, 50)).toBe(500)
    expect(percentile(samples, 75)).toBe(700)
    expect(percentile(samples, 95)).toBe(900)
    expect(percentile([], 50)).toBeNull()
  })
})
