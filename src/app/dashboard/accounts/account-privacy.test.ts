import { describe, expect, it } from 'vitest'
import { accountPrivacyRefusal, parseAccountPrivacyImpact } from './account-privacy'

describe('parseAccountPrivacyImpact', () => {
  it('reads the three counts the RPC returns', () => {
    expect(
      parseAccountPrivacyImpact({ transactions: 12, payees: 3, linked_items: 2, applied: false })
    ).toEqual({ transactions: 12, payees: 3, linkedItems: 2 })
  })
  it('reads a missing or malformed count as zero', () => {
    expect(parseAccountPrivacyImpact({ transactions: 'x' })).toEqual({
      transactions: 0,
      payees: 0,
      linkedItems: 0,
    })
    expect(parseAccountPrivacyImpact(null)).toEqual({ transactions: 0, payees: 0, linkedItems: 0 })
  })
})

describe('accountPrivacyRefusal', () => {
  it("passes on the RPC's own sentence for a known rule", () => {
    expect(
      accountPrivacyRefusal(
        'An account can only be made private while you are the only member of the household',
        'fallback'
      )
    ).toBe('An account can only be made private while you are the only member of the household')
  })
  it('hides anything not written for a person', () => {
    expect(accountPrivacyRefusal('permission denied for table accounts', 'fallback')).toBe('fallback')
    expect(accountPrivacyRefusal(undefined, 'fallback')).toBe('fallback')
  })
})
