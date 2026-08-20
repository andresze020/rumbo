'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * Android's hardware Back (and the browser's back gesture) should close the
 * overlay you are looking at, not the whole screen behind it. On the web that
 * only happens if the overlay owns a history entry, so each open overlay pushes
 * one and consumes it again on close.
 *
 * Overlays nest (a picker sheet inside the transaction dialog), and a single
 * Back press consumes exactly one history entry — so the listener is shared and
 * only the top of this stack is dismissed per press.
 */
type OverlayEntry = { token: string; dismiss: () => boolean }

const overlayStack: OverlayEntry[] = []
let listening = false

/**
 * Pops this hook triggered itself, by calling `history.back()` to reclaim the
 * entry of an overlay that was closed from the UI.
 *
 * They are indistinguishable from a real Back press once they reach the
 * listener, and mistaking one for the other dismisses whatever is underneath:
 * closing a picker sheet from inside the transaction dialog would tear the
 * dialog down with it.
 */
let selfInitiatedPops = 0

function handlePopState() {
  if (selfInitiatedPops > 0) {
    selfInitiatedPops -= 1
    return
  }

  const entry = overlayStack.pop()
  if (!entry) return

  // A drill-down handles Back by stepping up a level instead of closing, and
  // the level it lands on needs a history entry of its own — otherwise the next
  // Back would leave the screen. Re-push on top of the entry we just returned
  // to, which is the router's again, so its state is safe to extend.
  if (entry.dismiss()) {
    overlayStack.push(entry)
    window.history.pushState(
      { ...(window.history.state ?? {}), __overlay: entry.token },
      ''
    )
    return
  }

  if (overlayStack.length === 0) stopListening()
}

function startListening() {
  if (listening) return
  window.addEventListener('popstate', handlePopState)
  listening = true
}

function stopListening() {
  if (!listening) return
  window.removeEventListener('popstate', handlePopState)
  listening = false
  // Nothing is armed any more, so a self-pop still in flight has no listener
  // left to reach. Clearing the count keeps it from swallowing the next real
  // Back press instead.
  selfInitiatedPops = 0
}

/**
 * Give `open` overlays a history entry so Back dismisses them.
 *
 * `onDismiss` must only change what is on screen — never navigate, or Back
 * would pop this entry and push a new one. Return `true` to say the overlay is
 * still open (Back stepped up a level rather than closing it), which keeps it
 * armed for the next press.
 *
 * Returns `release()`, for the one case the rule above cannot cover: an overlay
 * that closes *because* the app is navigating, like "Apply filters" on the
 * transactions sheet. Call it immediately before navigating. It answers whether
 * this overlay still owns the top history entry — navigate with `replace` when
 * it does, so the entry becomes the new view instead of leaving a dead one
 * behind — and stops the teardown from reclaiming that entry.
 */
export function useBackDismiss(open: boolean, onDismiss: () => boolean | void) {
  // Kept in a ref so a new inline callback on every render doesn't tear down
  // and re-push the history entry.
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  })

  // Set by `release`, read by the teardown below. The teardown's own check on
  // `history.state` cannot catch a navigation: it runs on React's flush, which
  // is before the router has touched history.
  const releasedRef = useRef(false)

  useEffect(() => {
    if (!open || typeof window === 'undefined') return

    // The App Router hard-reloads on a popstate whose state it doesn't
    // recognise, so an entry has to carry the router's own state forward. If
    // there is nothing to carry (the router hasn't claimed the entry yet), skip
    // the whole mechanism rather than risk a full reload on Back.
    const routerState = window.history.state
    if (!routerState?.__NA) return

    releasedRef.current = false
    const token = `overlay-${Math.random().toString(36).slice(2)}`
    const entry: OverlayEntry = {
      token,
      dismiss: () => dismissRef.current() === true,
    }
    overlayStack.push(entry)
    startListening()
    window.history.pushState({ ...routerState, __overlay: token }, '')

    return () => {
      const index = overlayStack.indexOf(entry)
      // Missing from the stack means Back already consumed both the entry and
      // its history record; there is nothing left to clean up.
      if (index === -1) return

      overlayStack.splice(index, 1)
      if (overlayStack.length === 0) stopListening()

      // Handed to a navigation, which supersedes the entry. Reclaiming it here
      // would fire history.back() over that navigation and undo it.
      if (releasedRef.current) return

      // Closed from the UI instead: drop the history entry we added, but only
      // while it is still the current one. A navigation (a server action
      // redirect, "Apply filters") replaces it, and going back then would undo
      // that navigation instead.
      if (window.history.state?.__overlay !== token) return

      // Only count the pop when a listener is left to receive it — with the
      // stack empty it was just detached, and the count would go stale.
      if (listening) selfInitiatedPops += 1
      window.history.back()
    }
  }, [open])

  return useCallback(() => {
    releasedRef.current = true
    if (typeof window === 'undefined') return false
    return typeof window.history.state?.__overlay === 'string'
  }, [])
}
