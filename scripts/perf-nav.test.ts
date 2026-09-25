import { describe, expect, it } from 'vitest'

import { parseArgs, percentile } from './perf-nav.mjs'

describe('percentile (perf-nav, nearest rank)', () => {
  it('picks the nearest-rank sample, never interpolating a value nobody measured', () => {
    const samples = [900, 100, 300, 500, 700]
    expect(percentile(samples, 50)).toBe(500)
    expect(percentile(samples, 75)).toBe(700)
    expect(percentile(samples, 95)).toBe(900)
    expect(percentile([], 50)).toBeNull()
  })
})

describe('parseArgs (perf-nav)', () => {
  it('defaults to the robot pace every earlier run used', () => {
    expect(parseArgs([])).toMatchObject({ runs: 7, viewport: 'desktop', think: 0 })
  })

  it('reads an untimed think time in whole milliseconds', () => {
    expect(parseArgs(['--think=500', '--runs=3']).think).toBe(500)
    expect(() => parseArgs(['--think=-1'])).toThrow(/whole number/)
    expect(() => parseArgs(['--think=soon'])).toThrow(/whole number/)
  })
})
