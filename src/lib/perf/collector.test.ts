import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isPerfEnabled, perfClientOptions, perfSnapshot } from './collector'

const ORIGINAL = process.env.RUMBO_PERF

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.RUMBO_PERF
  else process.env.RUMBO_PERF = ORIGINAL
  vi.restoreAllMocks()
})

describe('the switch', () => {
  it('is off unless RUMBO_PERF is exactly "1"', () => {
    delete process.env.RUMBO_PERF
    expect(isPerfEnabled()).toBe(false)

    process.env.RUMBO_PERF = 'true'
    expect(isPerfEnabled()).toBe(false)

    process.env.RUMBO_PERF = '0'
    expect(isPerfEnabled()).toBe(false)

    process.env.RUMBO_PERF = '1'
    expect(isPerfEnabled()).toBe(true)
  })

  it('hands createClient nothing at all when off', () => {
    // The guarantee that matters: a normal run builds the same client it
    // always did, with no wrapper in the path.
    delete process.env.RUMBO_PERF
    expect(perfClientOptions()).toEqual({})
  })

  it('hands createClient a fetch when on', () => {
    process.env.RUMBO_PERF = '1'
    expect(typeof perfClientOptions().global?.fetch).toBe('function')
  })
})

describe('the instrumented fetch', () => {
  beforeEach(() => {
    process.env.RUMBO_PERF = '1'
  })

  function stubFetch(response: Response) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
  }

  it('records a query without altering the response', async () => {
    const body = JSON.stringify([{ id: 1 }])
    const stub = stubFetch(
      new Response(body, {
        status: 200,
        headers: { 'content-length': String(body.length), 'content-range': '0-0/1' },
      }),
    )

    const perfFetch = perfClientOptions().global!.fetch
    const response = await perfFetch('https://p.supabase.co/rest/v1/rpc/get_account_balances', {
      method: 'POST',
    })

    expect(stub).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
    // The body must still be readable: the hook never consumes the stream.
    await expect(response.json()).resolves.toEqual([{ id: 1 }])

    const entry = perfSnapshot().entries.at(-1)!
    expect(entry.label).toBe('rpc:get_account_balances')
    expect(entry.status).toBe(200)
    expect(entry.ok).toBe(true)
    expect(entry.rows).toBe(1)
    expect(entry.bytes).toBe(body.length)
    expect(entry.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('records a failure and rethrows it untouched', async () => {
    const boom = new Error('socket hang up')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(boom)

    const perfFetch = perfClientOptions().global!.fetch
    await expect(
      perfFetch('https://p.supabase.co/rest/v1/transactions?select=id'),
    ).rejects.toThrow('socket hang up')

    // A timeout must show up in the baseline, not vanish from it.
    const entry = perfSnapshot().entries.at(-1)!
    expect(entry.label).toBe('from:transactions')
    expect(entry.status).toBe(0)
    expect(entry.ok).toBe(false)
  })

  it('accepts the three shapes fetch accepts for a URL', async () => {
    stubFetch(new Response('[]', { status: 200 }))
    const perfFetch = perfClientOptions().global!.fetch

    await perfFetch('https://p.supabase.co/rest/v1/accounts')
    await perfFetch(new URL('https://p.supabase.co/rest/v1/categories'))
    await perfFetch(new Request('https://p.supabase.co/rest/v1/payees'))

    const labels = perfSnapshot().entries.slice(-3).map((entry) => entry.label)
    expect(labels).toEqual(['from:accounts', 'from:categories', 'from:payees'])
  })

  it('keeps no filter values in what it stores', async () => {
    stubFetch(new Response('[]', { status: 200 }))
    const perfFetch = perfClientOptions().global!.fetch
    await perfFetch(
      'https://p.supabase.co/rest/v1/transactions?select=id&description=ilike.*alimony*',
    )

    expect(JSON.stringify(perfSnapshot())).not.toContain('alimony')
  })
})
