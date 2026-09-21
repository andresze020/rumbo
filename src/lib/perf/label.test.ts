import { describe, expect, it } from 'vitest'

import { labelFromUrl, rowsFromContentRange, totalFromContentRange } from './label'

const BASE = 'https://project.supabase.co'

describe('labelFromUrl', () => {
  it('names an RPC without touching its arguments', () => {
    // PostgREST sends RPC arguments in the POST body, which is never read.
    const label = labelFromUrl(`${BASE}/rest/v1/rpc/get_account_balances`)
    expect(label.kind).toBe('rpc')
    expect(label.name).toBe('get_account_balances')
    expect(label.label).toBe('rpc:get_account_balances')
  })

  it('names a table query', () => {
    const label = labelFromUrl(`${BASE}/rest/v1/transactions?select=id&limit=50`)
    expect(label.kind).toBe('table')
    expect(label.label).toBe('from:transactions')
  })

  it('counts auth round-trips as their own kind', () => {
    expect(labelFromUrl(`${BASE}/auth/v1/user`).label).toBe('auth:user')
  })
})

describe('labelFromUrl — leak protection', () => {
  it('keeps filter keys but never their values', () => {
    const label = labelFromUrl(
      `${BASE}/rest/v1/transactions?select=id&household_id=eq.8f14e45f&description=ilike.*divorce*`,
    )
    expect(label.paramKeys).toEqual(['description', 'household_id', 'select'])
    expect(label.shape).toEqual({ select: 'id' })

    const serialized = JSON.stringify(label)
    expect(serialized).not.toContain('divorce')
    expect(serialized).not.toContain('8f14e45f')
  })

  it('keeps shape parameters, which cannot carry user content', () => {
    const label = labelFromUrl(
      `${BASE}/rest/v1/transactions?select=id,amount&order=occurred_on.desc&limit=50&offset=100`,
    )
    expect(label.shape).toEqual({
      select: 'id,amount',
      order: 'occurred_on.desc',
      limit: '50',
      offset: '100',
    })
  })

  it('truncates a very long select instead of logging a whole join', () => {
    const columns = Array.from({ length: 80 }, (_, index) => `column_${index}`).join(',')
    const label = labelFromUrl(`${BASE}/rest/v1/transactions?select=${columns}`)
    expect(label.shape.select.length).toBeLessThanOrEqual(161)
    expect(label.shape.select.endsWith('…')).toBe(true)
  })

  it('does not log a storage path, which can carry a user filename', () => {
    const label = labelFromUrl(`${BASE}/storage/v1/object/receipts/my-tax-return-2026.pdf`)
    expect(label.label).toBe('storage:object')
    expect(JSON.stringify(label)).not.toContain('tax-return')
  })

  it('never throws on a malformed URL', () => {
    // Instrumentation must not be the reason a request fails.
    expect(labelFromUrl('not a url').label).toBe('other:unknown')
    expect(labelFromUrl('').kind).toBe('other')
  })
})

describe('content-range parsing', () => {
  it('reads rows served and total matching rows', () => {
    expect(rowsFromContentRange('0-49/1234')).toBe(50)
    expect(totalFromContentRange('0-49/1234')).toBe(1234)
  })

  it('reports an empty result as zero rows', () => {
    expect(rowsFromContentRange('*/0')).toBe(0)
  })

  it('returns null for a total PostgREST did not count', () => {
    // The common case: no count requested, so the total is `*`.
    expect(totalFromContentRange('0-49/*')).toBeNull()
    expect(rowsFromContentRange('0-49/*')).toBe(50)
  })

  it('returns null rather than guessing when the header is missing', () => {
    expect(rowsFromContentRange(null)).toBeNull()
    expect(totalFromContentRange(null)).toBeNull()
    expect(rowsFromContentRange('garbage')).toBeNull()
  })
})
