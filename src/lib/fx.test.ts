import { afterEach, describe, expect, it, vi } from 'vitest'

import { describeFxNote, fetchDirectRate, fetchFxRate, type FxResult } from './fx'

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
