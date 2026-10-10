import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { isHouseholdSharingEnabled } from './sharing-flag'

describe('isHouseholdSharingEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is off by default', () => {
    vi.stubEnv('RUMBO_HOUSEHOLD_SHARING', '')
    expect(isHouseholdSharingEnabled()).toBe(false)
  })
  it('turns on with 1 or true', () => {
    vi.stubEnv('RUMBO_HOUSEHOLD_SHARING', '1')
    expect(isHouseholdSharingEnabled()).toBe(true)
    vi.stubEnv('RUMBO_HOUSEHOLD_SHARING', ' TRUE ')
    expect(isHouseholdSharingEnabled()).toBe(true)
  })
  it('stays off for anything else', () => {
    vi.stubEnv('RUMBO_HOUSEHOLD_SHARING', 'yes')
    expect(isHouseholdSharingEnabled()).toBe(false)
    vi.stubEnv('RUMBO_HOUSEHOLD_SHARING', '0')
    expect(isHouseholdSharingEnabled()).toBe(false)
  })
})
