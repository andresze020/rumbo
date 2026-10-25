import { describe, expect, it } from 'vitest'
import { nextDraftNeedsFreshLists, type DraftLists } from './next-draft'

const lists: DraftLists = {
  accounts: [{ id: 'a1' }],
  categories: [{ id: 'c1' }],
  payees: [{ name: 'High Point' }],
  tags: [{ id: 't1' }, { id: 't2' }],
}
const seed = { accountId: 'a1', categoryId: 'c1', payeeName: 'High Point', tagIds: ['t1'] }

describe('nextDraftNeedsFreshLists', () => {
  it('skips the fetch when everything the draft keeps is already known', () => {
    expect(nextDraftNeedsFreshLists(lists, seed)).toBe(false)
    expect(nextDraftNeedsFreshLists(lists, { ...seed, payeeName: null, tagIds: [] })).toBe(false)
  })

  it('matches payees the way people type them', () => {
    expect(nextDraftNeedsFreshLists(lists, { ...seed, payeeName: '  high point ' })).toBe(false)
  })

  it('fetches when the saved entry brought something new', () => {
    expect(nextDraftNeedsFreshLists(lists, { ...seed, accountId: 'new' })).toBe(true)
    expect(nextDraftNeedsFreshLists(lists, { ...seed, categoryId: 'new' })).toBe(true)
    expect(nextDraftNeedsFreshLists(lists, { ...seed, payeeName: 'Corner Store' })).toBe(true)
    expect(nextDraftNeedsFreshLists(lists, { ...seed, tagIds: ['t1', 'new'] })).toBe(true)
  })

  it('fetches when there is nothing in memory', () => {
    expect(nextDraftNeedsFreshLists(null, seed)).toBe(true)
  })
})
