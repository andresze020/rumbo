'use client'

import { useEffect, useState } from 'react'

/**
 * True on a phone-width viewport (Tailwind's `sm` breakpoint minus one).
 *
 * Starts `false` and flips in an effect so the server and the first client
 * render agree — the desktop layout is the one that renders during hydration,
 * whatever the real viewport is.
 *
 * Use this only where the two layouts are genuinely different components (the
 * transaction form's row list vs. its grid, a bottom sheet vs. an inline
 * panel). When the difference is only styling, a `sm:` class is cheaper and has
 * no hydration flash.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const onChange = () => setIsMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isMobile
}
