import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const cookieValue = vi.hoisted(() => ({ current: undefined as string | undefined }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'rumbo-tz' && cookieValue.current !== undefined
        ? { name, value: cookieValue.current }
        : undefined,
  }),
}))

import { getRequestTimeZone, getRequestToday } from './server'

afterEach(() => {
  cookieValue.current = undefined
  vi.useRealTimers()
})

describe('getRequestTimeZone', () => {
  it('reads the browser zone from the rumbo-tz cookie', async () => {
    cookieValue.current = 'America/Toronto'
    expect(await getRequestTimeZone()).toBe('America/Toronto')
  })

  it('falls back to UTC with no cookie', async () => {
    expect(await getRequestTimeZone()).toBe('UTC')
  })

  it('falls back to UTC for a value Intl rejects, never throwing', async () => {
    cookieValue.current = 'Not/AZone'
    expect(await getRequestTimeZone()).toBe('UTC')
  })
})

describe('getRequestToday', () => {
  it('is the cookie zone’s day — 23:31 on 30 Sep in Toronto is not October', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T03:31:00Z'))
    cookieValue.current = 'America/Toronto'
    expect(await getRequestToday()).toBe('2026-09-30')
  })

  it('keeps the old UTC answer without a cookie', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T03:31:00Z'))
    expect(await getRequestToday()).toBe('2026-10-01')
  })
})
