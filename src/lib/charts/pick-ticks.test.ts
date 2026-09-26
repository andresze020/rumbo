import { describe, expect, it } from 'vitest'

import { pickTickIndices } from './pick-ticks'

describe('pickTickIndices', () => {
  it('returns every index when the domain fits under the cap', () => {
    expect(pickTickIndices(4, 6)).toEqual([0, 1, 2, 3])
  })

  it('returns nothing for an empty domain', () => {
    expect(pickTickIndices(0)).toEqual([])
  })

  it('caps a long domain at `max` indices', () => {
    const indices = pickTickIndices(24, 6)
    expect(indices.length).toBeLessThanOrEqual(6)
  })

  it('always includes both ends of the domain', () => {
    const indices = pickTickIndices(24, 6)
    expect(indices[0]).toBe(0)
    expect(indices[indices.length - 1]).toBe(23)
  })

  it('returns strictly increasing, de-duplicated indices', () => {
    const indices = pickTickIndices(13, 6)
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1])
    }
  })
})
