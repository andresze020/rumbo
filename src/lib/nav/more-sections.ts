import type { TranslationKey } from '@/lib/i18n/translate'
import { navGroups, type NavItem } from './config'

/**
 * MQ-018 — the phone's More screen, grouped by what you came to do.
 *
 * `navGroups` stays the single source for every destination's label, icon and
 * phase, and keeps its own grouping for the desktop sidebar. More only decides
 * which items sit under which heading here, by href, so a rename or a new icon
 * in `navGroups` shows up in both places.
 *
 * The bottom nav's tabs are left out: More used to repeat three of them.
 */

/** Destinations the bottom nav already has a tab for (`mobile-bottom-nav.tsx`). */
export const BOTTOM_NAV_HREFS: ReadonlySet<string> = new Set([
  '/dashboard',
  '/dashboard/transactions',
  '/dashboard/accounts',
])

export const SETTINGS_GROUP_KEY: TranslationKey = 'nav.groupSettings'

const MORE_SECTIONS: { titleKey: TranslationKey; hrefs: string[] }[] = [
  {
    titleKey: 'nav.groupPlanning',
    hrefs: [
      '/dashboard/budgets',
      '/dashboard/goals',
      '/dashboard/debts',
      '/dashboard/debt-planner',
      '/dashboard/recurring',
      '/dashboard/installments',
    ],
  },
  {
    titleKey: 'nav.groupAnalysis',
    hrefs: [
      '/dashboard/net-worth',
      '/dashboard/month-review',
      '/dashboard/reports',
      '/dashboard/trends',
      '/dashboard/cash-flow',
      '/dashboard/calendar',
    ],
  },
  {
    titleKey: 'nav.groupOrganize',
    hrefs: [
      '/dashboard/categories',
      '/dashboard/payees',
      '/dashboard/tags',
      '/dashboard/notes',
      '/dashboard/transactions/import',
    ],
  },
  {
    titleKey: 'nav.groupAutomation',
    hrefs: [
      '/dashboard/rules',
      '/dashboard/transactions?review=unreviewed',
      '/dashboard/assistant',
    ],
  },
]

export type MoreSection = { titleKey: TranslationKey; items: NavItem[] }

/**
 * More's module sections, followed by the settings group as `navGroups` has
 * it. An href that no longer exists in `navGroups` is skipped rather than
 * rendered as a dead row; `more-sections.test.ts` catches the reverse — a
 * destination that is in neither More nor the bottom nav.
 */
export function moreSections(groups = navGroups): MoreSection[] {
  const byHref = new Map(groups.flatMap((g) => g.items).map((item) => [item.href, item]))
  const modules = MORE_SECTIONS.map(({ titleKey, hrefs }) => ({
    titleKey,
    items: hrefs.flatMap((href) => {
      const item = byHref.get(href)
      return item ? [item] : []
    }),
  })).filter((section) => section.items.length > 0)

  const settings = groups.find((g) => g.titleKey === SETTINGS_GROUP_KEY)
  return settings ? [...modules, { titleKey: settings.titleKey, items: settings.items }] : modules
}
