import { describe, expect, it } from 'vitest'

import { monthEndDate, snapshotDateForMonth } from './month'

describe('monthEndDate', () => {
  it('returns the last day of a 31-day month', () => {
    expect(monthEndDate('2026-01')).toBe('2026-01-31')
  })

  it('returns the last day of a 30-day month', () => {
    expect(monthEndDate('2026-09')).toBe('2026-09-30')
  })

  it('resolves February in a leap year to the 29th', () => {
    expect(monthEndDate('2028-02')).toBe('2028-02-29')
  })

  it('resolves February in a non-leap year to the 28th', () => {
    expect(monthEndDate('2026-02')).toBe('2026-02-28')
  })

  it('rolls December into the same year, not the next one', () => {
    expect(monthEndDate('2026-12')).toBe('2026-12-31')
  })

  it('is a fixed UTC calendar date with no DST shift', () => {
    // UTC has no daylight-saving transitions — this is a deliberate property
    // of the module's UTC-only design, asserted here rather than discovered.
    expect(monthEndDate('2026-03')).toBe('2026-03-31')
    expect(monthEndDate('2026-11')).toBe('2026-11-30')
  })
})

describe('snapshotDateForMonth', () => {
  it('snapshots the current month at today, not at the (unrealized) month end', () => {
    expect(snapshotDateForMonth('2026-09', '2026-09-21')).toBe('2026-09-21')
  })

  it('snapshots a past month at its own calendar end', () => {
    expect(snapshotDateForMonth('2026-08', '2026-09-21')).toBe('2026-08-31')
  })

  it('snapshots a future month at its own calendar end, not today', () => {
    expect(snapshotDateForMonth('2026-12', '2026-09-21')).toBe('2026-12-31')
  })

  it('treats the first and last day of the current month as still "today"', () => {
    expect(snapshotDateForMonth('2026-09', '2026-09-01')).toBe('2026-09-01')
    expect(snapshotDateForMonth('2026-09', '2026-09-30')).toBe('2026-09-30')
  })
})
