'use client'

import { type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

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

  return (
    <div key={pathname} className="animate-screen-in">
      {children}
    </div>
  )
}
