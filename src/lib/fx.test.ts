import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  describeFxNote,
  fetchDirectRate,
  fetchFxRate,
  fxRefreshDue,
  fxToday,
  type FxResult,
} from './fx'

const TODAY = '2026-09-21'

function jsonResponse(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 404 })
}

/** Maps a fetched URL to the `@<tag>` segment fetchFxRate requests. */
function tagFromUrl(url: string) {
  const match = url.match(/@([^/]+)\/v1\/currencies\//)
  return match?.[1] ?? ''
}

function stubFetchByTag(byTag: Record<string, { rate: number; date: string } | 'fail'>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    const tag = tagFromUrl(url)
    const entry = byTag[tag]
    if (!entry || entry === 'fail') return jsonResponse({}, false)
    return jsonResponse({ date: entry.date, usd: { cad: entry.rate } })
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('fetchFxRate', () => {
  it('returns source: requested on an exact historical hit', async () => {
    stubFetchByTag({ '2026-09-10': { rate: 1.35, date: '2026-09-10' } })
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))

    const result = await fetchFxRate('usd', 'cad', '2026-09-10')

    expect(result).toEqual({
      rate: 1.35,
      date: '2026-09-10',
      requestedDate: '2026-09-10',
      source: 'requested',
    })
  })

  it('returns source: future for a date after today, without treating it as a data gap', async () => {
    stubFetchByTag({ latest: { rate: 1.36, date: TODAY } })
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))

    const result = await fetchFxRate('usd', 'cad', '2026-12-25')

    expect(result).toEqual({
      rate: 1.36,
      date: TODAY,
      requestedDate: '2026-12-25',
      source: 'future',
    })
  })

  it('returns source: fallback and logs when a past date has no rate on file', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetchByTag({
      '2026-09-10': 'fail',
      latest: { rate: 1.37, date: TODAY },
    })
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))

    const result = await fetchFxRate('usd', 'cad', '2026-09-10')

    expect(result).toEqual({
      rate: 1.37,
      date: TODAY,
      requestedDate: '2026-09-10',
      source: 'fallback',
    })
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns a null-rate error when neither the requested date nor latest have a rate', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetchByTag({ '2026-09-10': 'fail', latest: 'fail' })
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))

    const result = await fetchFxRate('usd', 'cad', '2026-09-10')

    expect(result.rate).toBeNull()
    expect(result).toHaveProperty('error')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns a null-rate error and logs when the fetch itself throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))

    const result = await fetchFxRate('usd', 'cad', '2026-09-10')

    expect(result.rate).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('fetchDirectRate', () => {
  it('short-circuits to 1 for the same currency without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await fetchDirectRate('usd', 'USD', '2026-09-10')

    expect(result).toEqual({ rate: 1, date: '2026-09-10' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reads the direct pair when its file has the rate', async () => {
    stubFetchByTag({ '2026-09-10': { rate: 1.35, date: '2026-09-10' } })

    const result = await fetchDirectRate('usd', 'cad', '2026-09-10')

    expect(result).toEqual({ rate: 1.35, date: '2026-09-10' })
  })

  it('inverts the reverse pair when the direct file has no rate for it', async () => {
    // fetchDirectRate('cad', 'usd') calls fetchFxRate('cad','usd',...) first (fails both
    // dates), then fetchFxRate('usd','cad',...) as the reverse and inverts its rate.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/currencies/cad.json')) return jsonResponse({}, false)
      if (url.includes('/currencies/usd.json')) {
        return jsonResponse({ date: '2026-09-10', usd: { cad: 1.25 } })
      }
      return jsonResponse({}, false)
    })

    const result = await fetchDirectRate('cad', 'usd', '2026-09-10')

    expect(result).toEqual({ rate: 1 / 1.25, date: '2026-09-10' })
  })
})

describe('describeFxNote', () => {
  const base = { rate: 1.35 } as const

  function note(
    source: Extract<FxResult, { rate: number }>['source'],
    date: string,
    requestedDate: string
  ) {
    return describeFxNote({ ...base, source, date, requestedDate } as Extract<
      FxResult,
      { rate: number }
    >)
  }

  it('states the exact date for a requested-date hit', () => {
    expect(note('requested', '2026-09-10', '2026-09-10')).toBe('Rate for 2026-09-10.')
  })

  it('explains a future date as expected, not a gap', () => {
    const text = note('future', TODAY, '2026-12-25')
    expect(text).toContain('future')
    expect(text).toContain(TODAY)
  })

  it('names the requested date and flags it for verification on a real fallback', () => {
    const text = note('fallback', TODAY, '2026-09-10')
    expect(text).toContain('2026-09-10')
    expect(text).toContain(TODAY)
    expect(text.toLowerCase()).toContain('verify')
  })
})

// MQ-001: "today" became the user's day everywhere except FX, which must stay
// on the provider's/valuation's UTC day. These pin the two edges Codex found.
describe('fxToday', () => {
  it('is the UTC day east of UTC just after local midnight, the day balances are valued at', () => {
    // Tokyo, 2 Jan 00:30 = 1 Jan 15:30 UTC. A manual rate defaulting to 2 Jan
    // would sit outside `current_date` valuation until UTC midnight.
    expect(fxToday(new Date('2026-01-02T00:30:00+09:00'))).toBe('2026-01-01')
  })

  it('is the UTC day west of UTC late in the evening', () => {
    // Toronto, 30 Sep 23:31 EDT = 1 Oct 03:31 UTC — the provider's new file.
    expect(fxToday(new Date('2026-09-30T23:31:00-04:00'))).toBe('2026-10-01')
  })
})

describe('fxRefreshDue', () => {
  it('runs again when the UTC day turns, even though the local day turned earlier', () => {
    // Tokyo: the first navigation after local midnight still checks the
    // provider's 1 Jan file…
    const first = new Date('2026-01-02T00:30:00+09:00')
    expect(fxRefreshDue(null, first)).toBe(true)
    const stored = fxToday(first)
    // …so later that morning, still 1 Jan in UTC, there is nothing new…
    expect(fxRefreshDue(stored, new Date('2026-01-02T08:59:00+09:00'))).toBe(false)
    // …and at 09:00 local the provider's 2 Jan exists: refresh. Keyed on the
    // local day ("2 Jan" stored at 00:30) this returned false until 3 Jan.
    expect(fxRefreshDue(stored, new Date('2026-01-02T09:00:00+09:00'))).toBe(true)
  })

  it('does not run twice within the same UTC day', () => {
    const now = new Date('2026-10-01T12:00:00Z')
    expect(fxRefreshDue(fxToday(now), new Date('2026-10-01T23:59:00Z'))).toBe(false)
  })
})
