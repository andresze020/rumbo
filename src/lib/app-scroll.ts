/**
 * The dashboard's scroll container.
 *
 * The shell is a non-scrolling box the height of the viewport: the top bar and
 * the bottom nav are ordinary flex children of it, and this element — the
 * middle row — is the only thing that scrolls. That is what keeps the chrome
 * still on every engine. It cannot drift with a collapsing browser toolbar or
 * a rubber-band overscroll, because it is not inside the box those move.
 *
 * The cost is that `window.scrollY` and a `scroll` listener on `window` are
 * both dead here — the document itself never scrolls any more. Anything that
 * needs to read or reset the scroll position goes through this module so the
 * next reader does not have to rediscover that.
 */

export const APP_SCROLL_ID = 'app-scroll'

/** The scroll container, or `null` before the dashboard layout has mounted. */
export function getAppScroller(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.getElementById(APP_SCROLL_ID)
}
