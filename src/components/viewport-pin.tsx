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
    // metrics got this wrong once already: on a page whose root scroller
    // reserves scrollbar space, `documentElement.client*` is the layout
    // viewport *minus* that gutter while the chrome still resolves against the
    // full box — measured on a phone at 384x679 against 401x710, so the nav sat
    // 31px below the screen and the maths said 2.
    //
    // Measuring it needs care too: a `fixed inset-0` probe with `contain:
    // strict` reported 384x679 on that same phone while the nav's own bottom
    // edge was at 710 — size containment resolves the auto height as if the box
    // were empty, so `bottom: 0` stopped constraining it. These probes carry no
    // containment and are positioned exactly like the chrome they stand in for:
    // one hugging the top edge, one the bottom, both full width. Their rects are
    // then the real answer for `top: 0`, `bottom: 0`, `left: 0` and `right: 0`.
    const probeStyle =
      'position:fixed;left:0;right:0;height:1px;visibility:hidden;pointer-events:none'
    const topProbe = document.createElement('div')
    topProbe.setAttribute('aria-hidden', 'true')
    topProbe.style.cssText = `${probeStyle};top:0`
    const bottomProbe = document.createElement('div')
    bottomProbe.setAttribute('aria-hidden', 'true')
    bottomProbe.style.cssText = `${probeStyle};bottom:0`
    document.body.append(topProbe, bottomProbe)

    const apply = () => {
      frame = 0
      const top0 = topProbe.getBoundingClientRect()
      const bottom0 = bottomProbe.getBoundingClientRect()
      const scale = vv.scale || 1

      // Chrome reports tiny scale drift (1.0000001) at rest; don't pay for a
      // counter-scale over that.
      const zoomed = Math.abs(scale - 1) >= ZOOM_EPSILON

      // Each delta moves an edge of the fixed box onto the same edge of the
      // visual viewport, in the layout coordinates `getBoundingClientRect`
      // already speaks.
      const left = vv.offsetLeft - top0.left
      const top = vv.offsetTop - top0.top
      const rightDelta = vv.offsetLeft + vv.width - bottom0.right
      const bottomDelta = vv.offsetTop + vv.height - bottom0.bottom

      // The soft keyboard shrinks the visual viewport the same way a browser
      // toolbar does, but it takes a far bigger bite. Pinning the bottom nav
      // to the top of the keyboard would park it over the field being typed
      // into.
      const keyboard = -bottomDelta > (bottom0.bottom - top0.top) * KEYBOARD_MIN_RATIO
      const offset =
        !keyboard &&
        (Math.abs(bottomDelta) > OFFSET_EPSILON ||
          Math.abs(rightDelta) > OFFSET_EPSILON ||
          Math.abs(top) > OFFSET_EPSILON ||
          Math.abs(left) > OFFSET_EPSILON)

      // Published on every pass, flag or no flag. Returning early used to leave
      // the last non-zero deltas standing, so anything still reading them was
      // acting on geometry that no longer existed.
      root.style.setProperty('--vv-doc-width', `${root.clientWidth}px`)

      if (!zoomed && !offset) {
        root.style.setProperty('--vv-left', '0px')
        root.style.setProperty('--vv-top', '0px')
        root.style.setProperty('--vv-right-delta', '0px')
        root.style.setProperty('--vv-bottom-delta', '0px')
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

    // The geometry that matters here is not only the viewport's. On the
    // dashboard the scrollbar gutter appears *after* the first paint, once the
    // screen's content has rendered and the page is long enough for the root
    // scroller to reserve space — and a plain page scroll fires no visual
    // viewport event, so a mount-time measurement stayed stale for the life of
    // the screen. That is what left the nav 31px low with the flag unset:
    // measured once, before the box it measures had changed. Watching the root
    // and body boxes catches it whenever it happens.
    const observer = new ResizeObserver(schedule)
    observer.observe(root)
    observer.observe(document.body)

    apply()
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      observer.disconnect()
      topProbe.remove()
      bottomProbe.remove()
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
