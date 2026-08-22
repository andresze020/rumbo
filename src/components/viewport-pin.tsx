'use client'

import { useEffect } from 'react'

/**
 * Publishes the visual viewport's geometry as CSS variables on `<html>` while
 * the page is pinch-zoomed, and flags that state with `data-vv-zoomed`.
 *
 * Why: `position: fixed` anchors to the *layout* viewport. On a phone a stray
 * two-finger flick during a fast scroll zooms the page a few percent, and from
 * that moment the layout viewport is bigger than what's on screen — so the top
 * bar and the bottom nav sit partly outside it and read as "cut off". The
 * `.vv-pin-*` utilities in `globals.css` consume these variables to move the
 * chrome back onto the visual viewport and counter-scale it, so a zoom
 * magnifies the content only. The `.vv-pin-screen*` utilities use the same
 * variables for modal overlays, which are re-boxed onto the screen but *not*
 * counter-scaled — see the comment beside them.
 *
 * Nothing is published at scale 1 (the normal case, and the soft keyboard,
 * which shrinks the visual viewport without zooming): no attribute, no
 * transform, no extra containing block. Renders nothing.
 */
export function ViewportPin() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const root = document.documentElement
    let frame = 0

    const apply = () => {
      frame = 0
      const scale = vv.scale || 1
      // Chrome reports tiny scale drift (1.0000001) at rest; don't pay for a
      // transform — or fight the compositor on every scroll — over that.
      if (Math.abs(scale - 1) < 0.01) {
        root.removeAttribute('data-vv-zoomed')
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
        `${vv.offsetLeft + vv.width - window.innerWidth}px`
      )
      root.style.setProperty(
        '--vv-bottom-delta',
        `${vv.offsetTop + vv.height - window.innerHeight}px`
      )
      root.setAttribute('data-vv-zoomed', 'true')
    }

    // The visual viewport moves on the compositor, so these events arrive in
    // bursts while pinching or panning a zoomed page. One update per frame.
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(apply)
    }

    apply()
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    window.addEventListener('orientationchange', schedule)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      window.removeEventListener('orientationchange', schedule)
      root.removeAttribute('data-vv-zoomed')
    }
  }, [])

  return null
}
