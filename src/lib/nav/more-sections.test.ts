import { describe, expect, it } from 'vitest'
import { Tag } from 'lucide-react'

import { navGroups } from './config'
import { BOTTOM_NAV_HREFS, moreSections } from './more-sections'

describe('moreSections', () => {
  const sections = moreSections()
  const hrefs = sections.flatMap((s) => s.items.map((i) => i.href))

  it('reaches every nav destination that has no bottom-nav tab', () => {
    const expected = navGroups
      .flatMap((g) => g.items.map((i) => i.href))
      .filter((href) => !BOTTOM_NAV_HREFS.has(href))
    expect([...hrefs].sort()).toEqual([...expected].sort())
  })

  it('does not repeat the bottom nav or list anything twice', () => {
    expect(hrefs.filter((href) => BOTTOM_NAV_HREFS.has(href))).toEqual([])
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('groups by task and ends with settings', () => {
    expect(sections.map((s) => s.titleKey)).toEqual([
      'nav.groupPlanning',
      'nav.groupAnalysis',
      'nav.groupOrganize',
      'nav.groupAutomation',
      'nav.groupSettings',
    ])
    expect(sections[1].items.map((i) => i.href)).toContain('/dashboard/net-worth')
    expect(sections[2].items.map((i) => i.href)).toContain('/dashboard/categories')
  })

  it('skips an href that is gone from the nav config instead of rendering it', () => {
    const trimmed = moreSections([
      {
        titleKey: 'nav.groupMoney',
        items: [{ href: '/dashboard/tags', labelKey: 'nav.tags', icon: Tag, phase: 'alpha' }],
      },
    ])
    expect(trimmed).toEqual([
      {
        titleKey: 'nav.groupOrganize',
        items: [{ href: '/dashboard/tags', labelKey: 'nav.tags', icon: Tag, phase: 'alpha' }],
      },
    ])
  })
})
