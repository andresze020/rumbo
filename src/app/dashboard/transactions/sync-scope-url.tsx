'use client'

import { useEffect } from 'react'

/**
 * The page rendered a scope the URL does not show yet (the remembered filters,
 * or the landing preference). Put it in the address bar without navigating:
 * the App Router integrates `history.replaceState`, so `useSearchParams` and
 * every later link see the explicit params, and Back does not return to the
 * bare URL.
 */
export function SyncScopeUrl({ href }: { href: string }) {
  useEffect(() => {
    const current = window.location.pathname + window.location.search
    if (current !== href) window.history.replaceState(window.history.state, '', href)
  }, [href])

  return null
}
