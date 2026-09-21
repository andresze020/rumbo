import { describe, expect, it } from 'vitest'

import {
  computeValuation,
  getDisplayedLiabilityBalance,
  selectNetWorthAccounts,
  type ValuationAccountRow,
} from './valuation'

function account(
  account_class: 'asset' | 'liability',
  posted: number,
  projected = posted
): ValuationAccountRow {
  return {
    account_class,
    posted_balance_base_currency: posted,
    projected_balance_base_currency: projected,
  }
}

describe('getDisplayedLiabilityBalance', () => {
  it('shows a debt (negative balance) as a positive amount owed', () => {
    expect(getDisplayedLiabilityBalance(-250)).toBe(250)
  })

  it('shows a credit balance (positive balance) as zero owed, not as a negative liability', () => {
    // This is the RUM-002 regression case: accounts/page.tsx used to compute
    // Math.abs(value) here, which turned a $50 credit into "$50.00 owed" —
    // the exact inverse of reality. max(0, -value) must never do that.
    expect(getDisplayedLiabilityBalance(50)).toBe(0)
  })

  it('shows zero balance as zero owed', () => {
    expect(getDisplayedLiabilityBalance(0)).toBe(0)
  })

  it('accepts a string amount, as the RPC rows carry numeric fields as strings', () => {
    expect(getDisplayedLiabilityBalance('-120.50')).toBe(120.5)
  })
})

describe('computeValuation', () => {
  it('sums assets only when there are no liabilities', () => {
    const rows = [account('asset', 1000), account('asset', 500)]
    const v = computeValuation(rows)
    expect(v.totalAssets).toBe(1500)
    expect(v.totalLiabilities).toBe(0)
    expect(v.signedLiabilities).toBe(0)
    expect(v.netWorth).toBe(1500)
  })

  it('sums liabilities only when there are no assets', () => {
    const rows = [account('liability', -300), account('liability', -50)]
    const v = computeValuation(rows)
    expect(v.totalAssets).toBe(0)
    expect(v.totalLiabilities).toBe(350)
    expect(v.signedLiabilities).toBe(-350)
    expect(v.netWorth).toBe(-350)
  })

  it('mixes assets and liabilities correctly', () => {
    const rows = [account('asset', 2000), account('liability', -800)]
    const v = computeValuation(rows)
    expect(v.totalAssets).toBe(2000)
    expect(v.totalLiabilities).toBe(800)
    expect(v.netWorth).toBe(1200)
  })

  it('a credit card with debt: signed liability owed, positive displayed amount, subtracts from net worth', () => {
    const rows = [account('asset', 5000), account('liability', -1200)]
    const v = computeValuation(rows)
    expect(v.totalLiabilities).toBe(1200)
    expect(v.signedLiabilities).toBe(-1200)
    expect(v.netWorth).toBe(3800)
  })

  it('a credit card with a credit (favorable) balance: still adds to net worth, shows zero in totalLiabilities', () => {
    // The exact §3.3 discrepancy this ticket documents: a liability with a
    // positive stored balance contributes its credit to net worth, but the
    // displayed "Liabilities" figure — a magnitude, not an equation term —
    // shows 0, not the credit. Both are correct; they answer different
    // questions. This is the case that made Net worth != Assets - Liabilities.
    const rows = [account('asset', 5000), account('liability', 75)]
    const v = computeValuation(rows)
    expect(v.totalLiabilities).toBe(0)
    expect(v.signedLiabilities).toBe(75)
    expect(v.netWorth).toBe(5075)
    // The number a naive "Assets - Liabilities" would produce is wrong:
    expect(v.totalAssets - v.totalLiabilities).not.toBe(v.netWorth)
  })

  it('an account simply absent from the input never affects the total — population filtering is the caller\'s job', () => {
    const withExtra = computeValuation([account('asset', 100), account('asset', 999)])
    const without = computeValuation([account('asset', 100)])
    expect(without.totalAssets).toBe(100)
    expect(withExtra.totalAssets).toBe(1099)
  })

  it('computes projected totals independently of posted totals', () => {
    const rows = [
      account('asset', 1000, 1200),
      account('liability', -400, -600),
    ]
    const v = computeValuation(rows)
    expect(v.totalAssets).toBe(1000)
    expect(v.projectedAssets).toBe(1200)
    expect(v.totalLiabilities).toBe(400)
    expect(v.projectedLiabilities).toBe(600)
    expect(v.netWorth).toBe(600)
    expect(v.projectedNetWorth).toBe(600)
  })

  it('returns all-zero for an empty population', () => {
    const v = computeValuation([])
    expect(v).toEqual({
      totalAssets: 0,
      totalLiabilities: 0,
      signedLiabilities: 0,
      netWorth: 0,
      projectedAssets: 0,
      projectedLiabilities: 0,
      signedProjectedLiabilities: 0,
      projectedNetWorth: 0,
    })
  })
})

describe('selectNetWorthAccounts', () => {
  it('keeps only accounts opted into net worth', () => {
    const rows = [
      { id: 'a', include_in_net_worth: true },
      { id: 'b', include_in_net_worth: false },
      { id: 'c', include_in_net_worth: true },
    ]
    expect(selectNetWorthAccounts(rows).map((r) => r.id)).toEqual(['a', 'c'])
  })

  it('returns an empty array, not all rows, when nothing is included', () => {
    const rows = [{ id: 'a', include_in_net_worth: false }]
    expect(selectNetWorthAccounts(rows)).toEqual([])
  })
})
