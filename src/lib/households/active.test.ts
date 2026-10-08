import { describe, expect, it } from 'vitest'

import { resolveActiveHousehold } from './active'

/** MEM-7 — the active household falls back when the stored one is not a membership. */

const HOME = { id: 'household-home' }
const PARENTS = { id: 'household-parents' }

describe('resolveActiveHousehold', () => {
  it('keeps a stored household the user is an active member of', () => {
    expect(resolveActiveHousehold('household-parents', [HOME, PARENTS])).toEqual({
      currentId: 'household-parents',
      stale: false,
    })
  })

  it('moves a stale household to the first membership offered', () => {
    expect(resolveActiveHousehold('household-left-behind', [HOME, PARENTS])).toEqual({
      currentId: 'household-home',
      stale: true,
    })
  })

  it('moves a stale household to none when no membership is left (onboarding)', () => {
    expect(resolveActiveHousehold('household-left-behind', [])).toEqual({ currentId: null, stale: true })
  })

  it('leaves a user with no stored household alone (onboarding not finished)', () => {
    expect(resolveActiveHousehold(null, [HOME])).toEqual({ currentId: null, stale: false })
    expect(resolveActiveHousehold(null, [])).toEqual({ currentId: null, stale: false })
  })
})
