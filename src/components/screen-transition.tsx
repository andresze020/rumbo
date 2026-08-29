'use client'

import { type ReactNode, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { getAppScroller } from '@/lib/app-scroll'

/**
 * Animates each dashboard screen in on arrival.
 *
 * The app is installed to a home screen and navigated with a thumb, but route
 * changes swapped one screen for the next with no motion at all — the single
 * biggest tell that this is a website. Re-keying on the pathname restarts the
 * animation on every route change, and only on route changes: applying a filter
 * or opening a dialog rewrites the query string, and re-animating the whole
 * screen for that would be worse than not animating at all.
 */
export function ScreenTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  // Arriving on a screen half-way down it is disorienting, and the router no
  // longer does this for us: its scroll restoration drives the document, and
  // the document does not scroll any more — the shell's middle row does. So
  // the new screen would inherit the last one's scroll position.
  useEffect(() => {
    getAppScroller()?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div key={pathname} className="animate-screen-in">
      {children}
    </div>
  )
}
