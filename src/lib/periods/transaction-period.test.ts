import { describe, expect, it } from 'vitest'

import {
  currentMonth,
  formatPeriodDate,
  parseTransactionPeriod,
  presetPeriod,
  todayIsoDate,
} from './transaction-period'

const TORONTO = 'America/Toronto'

// MQ-001: the recording was made at 23:31 on Wed 30 Sep in Toronto (EDT,
// UTC-4) — 03:31 on 1 Oct in UTC — and the whole app had moved to October.
describe('todayIsoDate', () => {
  it('stays on the local day at 23:59 even though UTC is already tomorrow', () => {
    expect(todayIsoDate(TORONTO, new Date('2026-10-01T03:59:00Z'))).toBe('2026-09-30')
  })

  it('turns over at local midnight, not UTC midnight', () => {
    expect(todayIsoDate(TORONTO, new Date('2026-10-01T04:00:00Z'))).toBe('2026-10-01')
  })

  it('keeps the old UTC answer for the UTC fallback', () => {
    expect(todayIsoDate('UTC', new Date('2026-10-01T03:59:00Z'))).toBe('2026-10-01')
  })

  it('moves a zone east of UTC ahead of it', () => {
    expect(todayIsoDate('Asia/Tokyo', new Date('2026-09-30T15:30:00Z'))).toBe('2026-10-01')
  })

  it('holds the last night of the year in the old year', () => {
    expect(todayIsoDate(TORONTO, new Date('2027-01-01T04:30:00Z'))).toBe('2026-12-31')
  })

  it('follows the fall-back DST change (EDT → EST, UTC-4 → UTC-5)', () => {
    // 04:30Z on 2 Nov is 23:30 EST on 1 Nov; a fixed UTC-4 would say 00:30 on 2 Nov.
    expect(todayIsoDate(TORONTO, new Date('2026-11-02T04:30:00Z'))).toBe('2026-11-01')
  })

  it('follows the spring-forward DST change (EST → EDT, UTC-5 → UTC-4)', () => {
    // 03:30Z on 9 Mar is 23:30 EDT on 8 Mar; a fixed UTC-5 would say 22:30, same
    // day — so check the instant that only EDT puts on the next day.
    expect(todayIsoDate(TORONTO, new Date('2026-03-09T03:30:00Z'))).toBe('2026-03-08')
    expect(todayIsoDate(TORONTO, new Date('2026-03-09T04:30:00Z'))).toBe('2026-03-09')
  })
})

describe('currentMonth', () => {
  it('is still the closing month at 23:30 on its last day', () => {
    expect(currentMonth(TORONTO, new Date('2026-10-01T03:30:00Z'))).toBe('2026-09')
  })

  it('is the new month once the local clock reaches it', () => {
    expect(currentMonth(TORONTO, new Date('2026-10-01T04:30:00Z'))).toBe('2026-10')
  })
})

describe('presetPeriod', () => {
  it('resolves This month against the given today', () => {
    const period = presetPeriod('this-month', '2026-09-30')
    expect(period.month).toBe('2026-09')
    expect(period.dateFrom).toBe('2026-09-01')
    expect(period.dateTo).toBe('2026-09-30')
  })

  it('resolves Last month against the given today', () => {
    const period = presetPeriod('last-month', '2026-09-30')
    expect(period.dateFrom).toBe('2026-08-01')
    expect(period.dateTo).toBe('2026-08-31')
  })
})

describe('parseTransactionPeriod', () => {
  it('defaults a bare URL to the month today falls in', () => {
    const period = parseTransactionPeriod({}, { today: '2026-09-30' })
    expect(period.kind).toBe('month')
    expect(period.month).toBe('2026-09')
  })

  it('resolves a preset param against today', () => {
    const period = parseTransactionPeriod({ period: 'this-month' }, { today: '2026-09-30' })
    expect(period.dateTo).toBe('2026-09-30')
  })
})

describe('formatPeriodDate', () => {
  it('omits the year when the date is in today’s year', () => {
    expect(formatPeriodDate('2026-12-31', 'en', '2026-12-31')).toBe('Dec 31')
  })

  it('shows the year when the date is in another one', () => {
    expect(formatPeriodDate('2026-12-31', 'en', '2027-01-01')).toBe('Dec 31, 2026')
  })
})
