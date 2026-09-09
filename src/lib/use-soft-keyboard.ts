'use client'

import { useEffect, useState } from 'react'

/**
 * How many pixels of the layout viewport the on-screen keyboard is covering,
 * on a phone-width viewport. `0` means no keyboard — which is always the case
 * on desktop, so callers can treat a non-zero value as "a phone is being typed
 * into right now".
 *
 * iOS does not shrink the layout viewport when the keyboard opens, so the only
 * reliable measure is the gap between it and the *visual* viewport. Small
 * deltas (a browser toolbar sliding away) are ignored, so this flips only for a
 * real keyboard.
 *
 * Shared because two components need the same answer and must agree on it: the
 * dialog lifts its sheet above the keyboard, and the form inside decides what
 * is worth rendering in the little sheet that is left.
 */
export function useSoftKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const isMobile = window.matchMedia('(max-width: 639px)').matches
      const overlap = window.innerHeight - vv.height - vv.offsetTop
      setInset(isMobile && overlap > 120 ? Math.round(overlap) : 0)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return inset
}
