'use client'

import { useEffect, useRef } from 'react'

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

function handlePopState() {
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
}

/**
 * Give `open` overlays a history entry so Back dismisses them.
 *
 * `onDismiss` must only change what is on screen — never navigate, or Back
 * would pop this entry and push a new one. Return `true` to say the overlay is
 * still open (Back stepped up a level rather than closing it), which keeps it
 * armed for the next press.
 */
export function useBackDismiss(open: boolean, onDismiss: () => boolean | void) {
  // Kept in a ref so a new inline callback on every render doesn't tear down
  // and re-push the history entry.
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  })

  useEffect(() => {
    if (!open || typeof window === 'undefined') return

    // The App Router hard-reloads on a popstate whose state it doesn't
    // recognise, so an entry has to carry the router's own state forward. If
    // there is nothing to carry (the router hasn't claimed the entry yet), skip
    // the whole mechanism rather than risk a full reload on Back.
    const routerState = window.history.state
    if (!routerState?.__NA) return

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

      // Closed from the UI instead: drop the history entry we added, but only
      // while it is still the current one. A navigation (a server action
      // redirect, "Apply filters") replaces it, and going back then would undo
      // that navigation instead.
      if (window.history.state?.__overlay === token) window.history.back()
    }
  }, [open])
}
