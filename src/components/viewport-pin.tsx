'use client'

import { useEffect } from 'react'

/** A pinch zoom of less than this reads as reporting drift, not intent. */
const ZOOM_EPSILON = 0.01

/** Sub-pixel viewport differences are rounding, not an offset worth a transform. */
const OFFSET_EPSILON = 1

/**
 * How big a bite out of the bottom of the visual viewport stops being a
 * browser toolbar and starts being the soft keyboard. Android keyboards take
 * 35-50% of the screen; a Chrome or Safari toolbar takes under 12%.
 */
const KEYBOARD_MIN_RATIO = 0.25

/**
 * Publishes the visual viewport's geometry as CSS variables on `<html>`, and
 * flags the two states that need the fixed chrome moved: `data-vv-zoomed`
 * (pinch-zoomed) and `data-vv-offset` (the visual viewport is smaller than, or
 * shifted inside, the layout viewport at scale 1).
 *
 * Why: `position: fixed` anchors to the *layout* viewport, and on a phone the
 * layout viewport is regularly bigger than what's on screen.
 *
 * - Pinch zoom: a stray two-finger flick during a fast scroll zooms the page a
 *   few percent, and from that moment the top bar and the bottom nav sit partly
 *   outside the screen and read as "cut off".
 * - Classic scrollbars: on some pages the root scroller reserves real space for
 *   scrollbars, so the layout viewport (384x679 on the phone this was measured
 *   on) is smaller than the box a fixed element resolves against (401x710).
 *   `bottom: 0` then lands ~31px below the screen and takes the bottom nav's
 *   labels with it.
 * - The browser toolbar: Chrome on Android sizes the layout viewport as if the
 *   toolbar were hidden. While it is *shown* — which is how every page starts,
 *   before the first scroll — the layout viewport's bottom edge sits a toolbar's
 *   height below the screen, so `bottom: 0` puts the bottom nav's lower half off
 *   screen. Scrolling down retracts the toolbar and the nav slides up into
 *   place: that visible drift is the bug this flag fixes, by keeping the nav on
 *   the screen edge the whole time.
 *
 * The `.vv-pin-*` utilities in `globals.css` consume these variables. Under
 * zoom they also counter-scale by `1/scale`, so the chrome keeps its on-screen
 * size and the zoom magnifies the content only; at scale 1 they translate and
 * nothing else. The `.vv-pin-screen*` utilities use the same variables for
 * modal overlays, which are re-boxed onto the screen but *not* counter-scaled —
 * see the comment beside them.
 *
 * Nothing is published while the visual viewport matches the layout viewport
 * (no attribute, no transform, no extra containing block), nor while the soft
 * keyboard is what shrank it — pinning the nav to the top of the keyboard would
 * park it over the field being typed into. Renders nothing.
 */
export function ViewportPin() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const root = document.documentElement
    let frame = 0

    // Where `position: fixed` actually lands. Deriving that from viewport
    // metrics is what got this wrong before: on a page whose root scroller
    // shows classic scrollbars, `documentElement.client*` is the layout
    // viewport *minus* the scrollbars while a fixed element still resolves
    // against the full initial containing block — measured on a phone at
    // 384x679 vs 401x710, so the bottom nav sat 31px below the visible area
    // and the maths said 2. An empty `fixed inset-0` probe reports the real
    // box, whatever the browser is doing with scrollbars, toolbars or zoom.
    const probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText =
      'position:fixed;inset:0;visibility:hidden;pointer-events:none;contain:strict'
    document.body.appendChild(probe)

    const apply = () => {
      frame = 0
      const icb = probe.getBoundingClientRect()
      const scale = vv.scale || 1

      // Chrome reports tiny scale drift (1.0000001) at rest; don't pay for a
      // counter-scale over that.
      const zoomed = Math.abs(scale - 1) >= ZOOM_EPSILON

      // Each delta moves an edge of the fixed box onto the same edge of the
      // visual viewport, in the layout coordinates `getBoundingClientRect`
      // already speaks.
      const left = vv.offsetLeft - icb.left
      const top = vv.offsetTop - icb.top
      const rightDelta = vv.offsetLeft + vv.width - icb.right
      const bottomDelta = vv.offsetTop + vv.height - icb.bottom

      // The soft keyboard shrinks the visual viewport the same way a browser
      // toolbar does, but it takes a far bigger bite. Pinning the bottom nav
      // to the top of the keyboard would park it over the field being typed
      // into.
      const keyboard = -bottomDelta > icb.height * KEYBOARD_MIN_RATIO
      const offset =
        !keyboard &&
        (Math.abs(bottomDelta) > OFFSET_EPSILON ||
          Math.abs(rightDelta) > OFFSET_EPSILON ||
          Math.abs(top) > OFFSET_EPSILON ||
          Math.abs(left) > OFFSET_EPSILON)

      if (!zoomed && !offset) {
        root.removeAttribute('data-vv-zoomed')
        root.removeAttribute('data-vv-offset')
        return
      }

      root.style.setProperty('--vv-scale', String(scale))
      root.style.setProperty('--vv-inv-scale', String(1 / scale))
      root.style.setProperty('--vv-left', `${left}px`)
      root.style.setProperty('--vv-top', `${top}px`)
      // The screen's own size, for overlays that are re-boxed onto it rather
      // than counter-scaled (`.vv-pin-screen*`): a `fixed inset-0` backdrop or
      // an `h-full` side sheet is otherwise as tall as the *layout* viewport.
      root.style.setProperty('--vv-width', `${vv.width}px`)
      root.style.setProperty('--vv-height', `${vv.height}px`)
      root.style.setProperty('--vv-right-delta', `${rightDelta}px`)
      root.style.setProperty('--vv-bottom-delta', `${bottomDelta}px`)

      // Zoom wins: its rules translate *and* counter-scale, so the two must
      // never both apply to the same element.
      if (zoomed) {
        root.setAttribute('data-vv-zoomed', 'true')
        root.removeAttribute('data-vv-offset')
      } else {
        root.setAttribute('data-vv-offset', 'true')
        root.removeAttribute('data-vv-zoomed')
      }
    }

    // The visual viewport moves on the compositor, so these events arrive in
    // bursts while pinching, panning a zoomed page, or retracting the toolbar.
    // One update per frame.
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(apply)
    }

    apply()
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      probe.remove()
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
      root.removeAttribute('data-vv-zoomed')
      root.removeAttribute('data-vv-offset')
    }
  }, [])

  return null
}
