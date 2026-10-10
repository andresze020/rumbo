import { describe, expect, it } from 'vitest'
import {
  defaultPrivacyScope,
  isPrivacyScope,
  resolvePrivacyScope,
  scopeByOwner,
  scopeByTransaction,
} from './scope'

// A stand-in for the PostgREST filter builder: records each filter call.
function recorder() {
  const calls: string[] = []
  const q = {
    calls,
    is(column: string, value: null) {
      calls.push(`is ${column} ${value}`)
      return q
    },
    eq(column: string, value: string) {
      calls.push(`eq ${column} ${value}`)
      return q
    },
    neq(column: string, value: string) {
      calls.push(`neq ${column} ${value}`)
      return q
    },
  }
  return q
}

describe('defaultPrivacyScope', () => {
  it('reads everything for a user who owns a private account', () => {
    expect(defaultPrivacyScope(true)).toBe('all')
  })
  it('reads the household for everyone else (the same rows for them)', () => {
    expect(defaultPrivacyScope(false)).toBe('household')
  })
})

describe('resolvePrivacyScope', () => {
  it('defaults an owner of a private account to everything (SCP-5)', () => {
    expect(resolvePrivacyScope(true, null)).toBe('all')
  })
  it("keeps an owner's remembered choice", () => {
    expect(resolvePrivacyScope(true, 'mine')).toBe('mine')
    expect(resolvePrivacyScope(true, 'household')).toBe('household')
  })
  it('ignores a remembered choice once the user owns no private account (SCP-6)', () => {
    expect(resolvePrivacyScope(false, 'mine')).toBe('household')
    expect(resolvePrivacyScope(false, null)).toBe('household')
  })
})

describe('isPrivacyScope', () => {
  it('accepts the three scopes only', () => {
    expect(isPrivacyScope('household')).toBe(true)
    expect(isPrivacyScope('mine')).toBe(true)
    expect(isPrivacyScope('all')).toBe(true)
    expect(isPrivacyScope('everyone')).toBe(false)
    expect(isPrivacyScope(undefined)).toBe(false)
  })
})

describe('scopeByOwner', () => {
  it('household keeps shared rows only', () => {
    expect(scopeByOwner(recorder(), 'household', 'u1').calls).toEqual(['is private_owner_id null'])
  })
  it("mine keeps the caller's private rows only", () => {
    expect(scopeByOwner(recorder(), 'mine', 'u1').calls).toEqual(['eq private_owner_id u1'])
  })
  it('all adds no filter (RLS already decides)', () => {
    expect(scopeByOwner(recorder(), 'all', 'u1').calls).toEqual([])
  })
  it('can target an embedded column', () => {
    expect(scopeByOwner(recorder(), 'household', 'u1', 'accounts.private_owner_id').calls).toEqual([
      'is accounts.private_owner_id null',
    ])
  })
})

describe('scopeByTransaction', () => {
  it('household keeps everything not fully private (mixed transfers included)', () => {
    expect(scopeByTransaction(recorder(), 'household', 'u1').calls).toEqual(['neq visibility private'])
  })
  it('mine keeps what the caller owns any part of', () => {
    expect(scopeByTransaction(recorder(), 'mine', 'u1').calls).toEqual(['eq private_owner_id u1'])
  })
  it('all adds no filter', () => {
    expect(scopeByTransaction(recorder(), 'all', 'u1').calls).toEqual([])
  })
  it('can target an embedded transaction', () => {
    expect(scopeByTransaction(recorder(), 'household', 'u1', 'transactions.').calls).toEqual([
      'neq transactions.visibility private',
    ])
  })
})
