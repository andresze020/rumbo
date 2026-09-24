import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// RUM-007 (§3.4 #15 of docs/performance-ux-backlog.md) found 11 dashboard
// routes with no `loading.tsx`: without one, App Router has no Suspense
// boundary to show while the route streams in, so navigation held on a
// mostly-blank page instead of a skeleton. This guards the fix — a route
// added back to `src/app/dashboard/` without its own `loading.tsx` should
// fail here, not get rediscovered on a video recording.
const dashboardDir = fileURLToPath(new URL('.', import.meta.url))

const routesThatMustHaveLoadingState = [
  'assistant',
  'cash-flow',
  'debt-planner',
  'coming-soon/[feature]',
  'help',
  'month-review',
  'more',
  'plan',
  'reports',
  'settings',
  'trends',
]

describe('dashboard route loading.tsx coverage', () => {
  it.each(routesThatMustHaveLoadingState)('%s has a loading.tsx', (route) => {
    expect(existsSync(`${dashboardDir}${route}/loading.tsx`)).toBe(true)
  })
})
