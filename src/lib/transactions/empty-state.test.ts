import { describe, expect, it } from 'vitest'
import { transactionsEmptyState } from './empty-state'

const base = {
  householdHasTransactions: true,
  reviewUnreviewed: false,
  hasSearch: false,
  hasGeneralFilters: false,
}

describe('transactionsEmptyState', () => {
  it('says "yet" only for a household with no transactions at all', () => {
    expect(transactionsEmptyState({ ...base, householdHasTransactions: false })).toBe(
      'household-empty'
    )
  })

  it('stays "yet" for an empty household even with filters applied', () => {
    expect(
      transactionsEmptyState({
        ...base,
        householdHasTransactions: false,
        hasGeneralFilters: true,
        hasSearch: true,
      })
    ).toBe('household-empty')
  })

  it('reports an empty period, not "yet", for a household with history', () => {
    expect(transactionsEmptyState(base)).toBe('period')
  })

  it('points at the filters when a sheet filter narrows the view', () => {
    expect(transactionsEmptyState({ ...base, hasGeneralFilters: true })).toBe('filters')
  })

  it('reports a search miss before the filters', () => {
    expect(
      transactionsEmptyState({ ...base, hasSearch: true, hasGeneralFilters: true })
    ).toBe('search')
  })

  it('reports a clear review queue before anything else that narrows', () => {
    expect(
      transactionsEmptyState({
        ...base,
        reviewUnreviewed: true,
        hasSearch: true,
        hasGeneralFilters: true,
      })
    ).toBe('caught-up')
  })
})
