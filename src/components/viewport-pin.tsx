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

    const apply = () => {
      frame = 0
      // `position: fixed` resolves against the layout viewport, which is the
      // documentElement's client box — *not* `window.inner*`, which on Chrome
      // Android tracks the visible area while the toolbar slides and would
      // therefore report no offset exactly when there is one.
      const layoutWidth = root.clientWidth
      const layoutHeight = root.clientHeight
      const scale = vv.scale || 1

      // Chrome reports tiny scale drift (1.0000001) at rest; don't pay for a
      // counter-scale over that.
      const zoomed = Math.abs(scale - 1) >= ZOOM_EPSILON

      const bottomGap = layoutHeight - (vv.offsetTop + vv.height)
      const keyboard = bottomGap > layoutHeight * KEYBOARD_MIN_RATIO
      const offset =
        !keyboard &&
        (bottomGap > OFFSET_EPSILON ||
          vv.offsetTop > OFFSET_EPSILON ||
          vv.offsetLeft > OFFSET_EPSILON)

      if (!zoomed && !offset) {
        root.removeAttribute('data-vv-zoomed')
        root.removeAttribute('data-vv-offset')
        return
      }

      root.style.setProperty('--vv-scale', String(scale))
      root.style.setProperty('--vv-inv-scale', String(1 / scale))
      root.style.setProperty('--vv-left', `${vv.offsetLeft}px`)
      root.style.setProperty('--vv-top', `${vv.offsetTop}px`)
      // The screen's own size, for overlays that are re-boxed onto it rather
      // than counter-scaled (`.vv-pin-screen*`): a `fixed inset-0` backdrop or
      // an `h-full` side sheet is otherwise as tall as the *layout* viewport.
      root.style.setProperty('--vv-width', `${vv.width}px`)
      root.style.setProperty('--vv-height', `${vv.height}px`)
      // How far the visual viewport's right/bottom edges sit from the layout
      // viewport's, which is what `right: 0` / `bottom: 0` are pinned to.
      root.style.setProperty(
        '--vv-right-delta',
        `${vv.offsetLeft + vv.width - layoutWidth}px`
      )
      root.style.setProperty('--vv-bottom-delta', `${-bottomGap}px`)

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
