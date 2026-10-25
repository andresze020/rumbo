'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import { useIsMobile } from '@/lib/use-is-mobile'
import { cn } from '@/lib/utils'

/*
 * The shell of the transaction entry form: the same full-screen sheet on a
 * phone, centred dialog on desktop, whether the form creates a transaction
 * (TransactionDialogProvider) or edits one (EditTransactionSheet). It owns
 * everything the premium entry sprint fixed about the *container* — the
 * floating X, the fit-to-one-screen density and the keyboard handling — so an
 * edit gets all of it instead of a second, older dialog (user request,
 * 2026-10-24).
 */

/** Fields that raise the soft keyboard (date and toggle inputs do not). */
const TEXT_ENTRY =
  'textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])' +
  ':not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="date"])' +
  ':not([type="time"]):not([type="range"]):not([type="color"]):not([type="file"])'

/**
 * The top share of the form's scroller that the keyboard never reaches. A field
 * already inside it is left where it is. Phone keyboards take 35–50% of the
 * screen, and Brave believes they take ~100px more than they do (below).
 */
const KEYBOARD_FREE_BAND = 0.25

/** Long enough to read as movement, short enough to finish before the keyboard. */
const PLACE_MS = 160

/**
 * How long the scroll room outlives the last focused field. Tapping a row's
 * toggle (Notes, say) moves focus to that button for a moment before the
 * field inside gets it; dropping the room in between clamped the scroll.
 */
const ROOM_GRACE_MS = 500

/** Spacing steps for the entry form on a phone, loosest first (globals.css). */
const FIT_LEVELS = ['', 'compact', 'tight'] as const

/**
 * Phone only: the entry form always fits one screen, like a native form. When
 * its content would make the sheet scroll (a foreign-currency account adds the
 * exchange-rate row, a small phone has less height), the spacing tightens a
 * step at a time until it fits (`data-entry-fit` on the scroller).
 *
 * Measured, not guessed per field: which rows show depends on the account,
 * the type and the user's field settings. Every step is tried inside one frame,
 * before paint, so no in-between density is ever seen. A form taller than the
 * tightest step simply scrolls.
 */
function useFitEntryForm(enabled: boolean, scrollerRef: { current: HTMLDivElement | null }) {
  useEffect(() => {
    if (!enabled) return
    let frame = 0
    let cleanup: (() => void) | null = null
    // The sheet's DOM can land a frame after `open` flips; wait for it.
    const attach = (attempt: number) => {
      frame = 0
      const scroller = scrollerRef.current
      if (scroller) cleanup = watch(scroller)
      else if (attempt < 30) frame = window.requestAnimationFrame(() => attach(attempt + 1))
    }

    const watch = (scroller: HTMLDivElement) => {
      const fit = () => {
        frame = 0
        const form = scroller.querySelector<HTMLElement>('[data-entry-form]')
        if (!form) return
        // The form, not the scroller: while a field is typed into, the scroller
        // also holds the keyboard spacer, which is not content.
        for (const level of FIT_LEVELS) {
          if (level) scroller.dataset.entryFit = level
          else delete scroller.dataset.entryFit
          if (form.scrollHeight <= scroller.clientHeight + 1) return
        }
      }
      const schedule = () => {
        if (!frame) frame = window.requestAnimationFrame(fit)
      }

      // Size changes of the sheet (toolbars, rotation), and any change inside
      // the form: a row appearing, a panel opening, the next draft remounting.
      const resize = new ResizeObserver(schedule)
      resize.observe(scroller)
      const mutations = new MutationObserver(schedule)
      mutations.observe(scroller, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
      schedule()

      return () => {
        resize.disconnect()
        mutations.disconnect()
        delete scroller.dataset.entryFit
      }
    }

    attach(0)
    return () => {
      window.cancelAnimationFrame(frame)
      cleanup?.()
    }
  }, [enabled, scrollerRef])
}

/** The part of the VirtualKeyboard API used here (Chromium only). */
type VirtualKeyboardLike = { overlaysContent: boolean; boundingRect: DOMRect }

/**
 * Phone only, while the entry sheet is open: when a field that raises the
 * keyboard gets focus, move its row to the top of the form *before* the
 * keyboard arrives. The keyboard then opens over
 * the bottom of the sheet, and nothing on screen has to move again.
 *
 * Measuring the keyboard failed on every round. The sheet used to be lifted
 * above it and re-scrolled once it was up, from the visual viewport's numbers.
 * Brave reports a visual viewport about 100px shorter than what it shows (its
 * bottom toolbar's height, which it hides for the keyboard). So the sheet rose
 * too high and shrank to a strip between the X and the keyboard, and every
 * field jumped twice on the way: once when the sheet resized, once when it was
 * scrolled back (device runs, 2026-10-22). Nothing here reads the keyboard's
 * size. The sheet stays full screen, and the only movement is this one scroll,
 * at focus time.
 *
 * With the keyboard already up (Description → Notes), the move is instant
 * instead. Right after the focus event the browser scrolls the field into
 * the part of the screen it believes is visible, and an animated move had not
 * started yet: it found Notes under the keyboard and panned the whole screen,
 * X row included (device run, 2026-10-23). Placed synchronously, the field is
 * already in view when the browser looks.
 *
 * Where the VirtualKeyboard API exists (Chrome and Brave on Android), the
 * keyboard is also told to overlay the page (`overlaysContent`) while the sheet
 * is open. Then the browser neither shrinks the viewport nor pans it to chase
 * the focused field: placing the field is entirely this hook's job, which is
 * what the API is for. Without it, focusing the exchange rate with the
 * keyboard up still panned the whole screen past the X (device run,
 * 2026-10-23). Other browsers keep their default behaviour.
 *
 * The row moves, not just the box: the row's title ("Notes", "Exchange
 * rate") stays on screen above the field being typed into. The anchor is
 * the closest `[data-entry-row]`, else a visible `<label for>` just above
 * the field, else the field itself.
 *
 * Only the scroller moves: `scrollIntoView` would also pan the visual
 * viewport, which took the X row off the screen. Near the end of the form the
 * scroller has no room left to bring a field up, so `roomRef` (an empty box
 * after the form) grows while a field is being typed into. It sits under the
 * keyboard and is never seen. A spacer, not padding: the form is a flex child
 * stretched to the scroller's height, and the scroller's bottom padding added
 * no scroll room at all.
 */
function usePlaceFieldsAboveKeyboard(
  enabled: boolean,
  scrollerRef: { current: HTMLDivElement | null },
  roomRef: { current: HTMLDivElement | null }
) {
  useEffect(() => {
    if (!enabled) return
    let frame = 0
    let extra = 0
    let unpadTimer = 0
    // Where the form was before this typing session moved it; restored when
    // the session ends, so closing the keyboard does not leave the form
    // scrolled up over an empty spacer (device run, 2026-10-24).
    let restoreTop: number | null = null
    // The scroll at the last touch, before the browser's own focus scrolling
    // (which runs ahead of `focusin`) moves anything.
    let touchTop: number | null = null
    const onPointerDown = () => {
      if (restoreTop === null) touchTop = scrollerRef.current?.scrollTop ?? null
    }

    const keyboard = (navigator as Navigator & { virtualKeyboard?: VirtualKeyboardLike })
      .virtualKeyboard
    const overlaid = keyboard?.overlaysContent ?? false
    if (keyboard) keyboard.overlaysContent = true
    const keyboardUp = () =>
      document.documentElement.hasAttribute('data-vv-keyboard') ||
      (keyboard?.boundingRect.height ?? 0) > 0

    /** The top of what should land at the top: the field's row or label. */
    const anchorTop = (field: HTMLElement, fieldTop: number) => {
      const row = field.closest<HTMLElement>('[data-entry-row]')
      if (row) return row.getBoundingClientRect().top
      const label = field.id
        ? document.querySelector<HTMLElement>(`label[for="${CSS.escape(field.id)}"]`)
        : null
      const box = label?.getBoundingClientRect()
      // Visible (not `sr-only`) and just above the field.
      if (box && box.height > 2 && box.top <= fieldTop && fieldTop - box.top < 160) return box.top
      return fieldTop
    }

    const ownField = (node: EventTarget | null): HTMLElement | null => {
      const scroller = scrollerRef.current
      if (!scroller || !(node instanceof HTMLElement)) return null
      if (!node.matches(TEXT_ENTRY) || !scroller.contains(node)) return null
      if ((node as HTMLInputElement).readOnly || (node as HTMLInputElement).disabled) return null
      // A picker sheet's search field is on its own full-screen layer.
      if (node.closest('[role="dialog"]') !== scroller.closest('[role="dialog"]')) return null
      return node
    }

    const scrollTo = (scroller: HTMLElement, to: number, instant: boolean, done?: () => void) => {
      window.cancelAnimationFrame(frame)
      const from = scroller.scrollTop
      if (Math.abs(to - from) < 2 || instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        scroller.scrollTop = to
        done?.()
        return
      }
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / PLACE_MS)
        scroller.scrollTop = from + (to - from) * (1 - (1 - t) ** 3)
        if (t < 1) frame = window.requestAnimationFrame(step)
        else done?.()
      }
      frame = window.requestAnimationFrame(step)
    }

    const place = (field: HTMLElement) => {
      const scroller = scrollerRef.current
      if (!scroller) return
      const box = scroller.getBoundingClientRect()
      const rect = field.getBoundingClientRect()
      const top = anchorTop(field, rect.top)
      // Below the floating X, which sits over the scroller's top edge.
      const close = scroller
        .closest('[data-slot="dialog-content"]')
        ?.querySelector('[data-entry-close]')
        ?.getBoundingClientRect()
      const clear = close ? Math.max(0, close.bottom - box.top) + 4 : 4
      if (top >= box.top + clear && rect.bottom <= box.top + box.height * KEYBOARD_FREE_BAND) return

      const target = Math.max(0, Math.round(scroller.scrollTop + top - box.top - clear))
      if (restoreTop === null) restoreTop = touchTop ?? scroller.scrollTop
      // Room is only ever added during a typing session, never taken away:
      // shrinking it under a scrolled form would clamp the scroll and jump.
      // Measured again after each top-up: a taller form shrinks as a flex
      // child and overflows, so the spacer does not add its full height.
      const room = roomRef.current
      for (let i = 0; room && i < 4; i++) {
        const missing = target - (scroller.scrollHeight - scroller.clientHeight)
        if (missing <= 0) break
        extra += missing
        room.style.height = `${extra}px`
      }
      // Keyboard state is only trusted as a yes/no here, never as a size.
      scrollTo(scroller, target, keyboardUp())
    }

    // Ends the typing session: back to where the form was, then the spacer
    // goes. In that order, so removing it never clamps the scroll mid-way.
    const unpad = (animate = true) => {
      const scroller = scrollerRef.current
      const back = restoreTop
      restoreTop = null
      touchTop = null
      const dropRoom = () => {
        if (!extra) return
        extra = 0
        if (roomRef.current) roomRef.current.style.height = ''
      }
      if (scroller && back !== null) scrollTo(scroller, back, !animate, dropRoom)
      else dropRoom()
    }

    const onFocusIn = (event: FocusEvent) => {
      const field = ownField(event.target)
      if (!field) return
      window.clearTimeout(unpadTimer)
      place(field)
    }
    // Typing is over only when focus stays somewhere that is not another field
    // (a picker, a button, nothing). Moving between fields keeps the room.
    const onFocusOut = () => {
      window.clearTimeout(unpadTimer)
      unpadTimer = window.setTimeout(() => {
        if (!ownField(document.activeElement)) unpad()
      }, ROOM_GRACE_MS)
    }
    // Tapping a field that already has focus reopens a keyboard that Back
    // dismissed, with no new focus event.
    // Back closes the keyboard but leaves the field focused, which would keep
    // the session (and the moved form) open. When the keyboard reports it has
    // gone, end the typing: the blur ends the session like any other.
    const onGeometry = () => {
      if ((keyboard?.boundingRect.height ?? 1) > 0) return
      const active = ownField(document.activeElement)
      if (active) active.blur()
    }
    const keyboardEvents = keyboard as unknown as EventTarget | undefined
    keyboardEvents?.addEventListener('geometrychange', onGeometry)

    const onClick = (event: MouseEvent) => {
      const field = ownField(event.target)
      if (field && field === document.activeElement) place(field)
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('click', onClick)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(unpadTimer)
      if (keyboard) keyboard.overlaysContent = overlaid
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('click', onClick)
      document.removeEventListener('pointerdown', onPointerDown, true)
      keyboardEvents?.removeEventListener('geometrychange', onGeometry)
      unpad(false)
    }
    // The ref is stable.
  }, [enabled, scrollerRef, roomRef])
}

type EntrySheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The floating X. */
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  /**
   * Show the title on a phone too, in the top row beside the X. Off for a new
   * entry, where the type selector sits there and says it anyway; on for an
   * edit, which has no type selector and would otherwise not say what it is.
   */
  titleOnPhone?: boolean
  /**
   * Base UI's `initialFocus` for the popup, or `'sheet'` to focus the sheet
   * itself: no field (so no keyboard) and no focus ring on the X. An edit
   * opens to read before it changes anything.
   */
  initialFocus?: React.ComponentProps<typeof DialogContent>['initialFocus'] | 'sheet'
  /** A live region's text, for announcements that outlive the form remounting. */
  status?: string
  /** The form's scroller, for callers that scroll it themselves. */
  scrollerRef?: { current: HTMLDivElement | null }
  children: ReactNode
}

export function EntrySheet({
  open,
  onOpenChange,
  onClose,
  title,
  description,
  titleOnPhone = false,
  initialFocus,
  status,
  scrollerRef: externalScrollerRef,
  children,
}: EntrySheetProps) {
  const ui = useUiTranslation()
  const isMobile = useIsMobile()
  const popupRef = useRef<HTMLDivElement>(null)
  const ownScrollerRef = useRef<HTMLDivElement>(null)
  const scrollerRef = externalScrollerRef ?? ownScrollerRef
  // Scroll room under the form while typing; see `usePlaceFieldsAboveKeyboard`.
  const keyboardRoomRef = useRef<HTMLDivElement>(null)
  usePlaceFieldsAboveKeyboard(isMobile && open, scrollerRef, keyboardRoomRef)
  useFitEntryForm(isMobile && open, scrollerRef)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      // On a phone the sheet is the whole screen, so nothing outside it is
      // meant to be tapped. When a strip of backdrop did show, one tap there
      // threw a half-typed entry away (device run, 2026-10-22). The X,
      // Escape and Back still close it.
      disablePointerDismissal={isMobile}
    >
      <DialogContent
        ref={popupRef}
        initialFocus={initialFocus === 'sheet' ? () => popupRef.current : initialFocus}
        // Own close button (below): the built-in one sat on top of the type
        // selector's "Transfer" on a phone.
        showCloseButton={false}
        className={
          // Centered dialog on desktop; a full screen on mobile. A phone
          // entering a transaction is doing one thing, so it gets the whole
          // screen: `h-dvh`, square corners, the actions pushed to the bottom
          // edge by the spacer inside the form.
          'max-h-[90dvh] overflow-y-auto sm:max-w-xl ' +
          // Not lifted above the keyboard: it stays full screen and the
          // keyboard covers its bottom. Fields are moved up before the
          // keyboard opens instead (`usePlaceFieldsAboveKeyboard`).
          //
          // `overflow-clip` on mobile: the sheet itself must not scroll — the
          // wrapper below does. The picker sheets are positioned against this
          // box (see `SelectorSheet`), and while it was the scroller they were
          // shifted up by however far the form had been scrolled. Clip, not
          // hidden: a `hidden` box is still a scroll container, and the
          // browser's own focus scrolling scrolled it, X row and all.
          'max-sm:overflow-clip ' +
          // Flex column on mobile so the form can claim the leftover height
          // and pin its actions to the bottom edge; the desktop grid is
          // untouched.
          'max-sm:flex max-sm:flex-col max-sm:gap-3 ' +
          // Room for the floating X beside the type selector. Under 380px wide
          // the selector's icons go, or "Transferencia" truncates; the active
          // option's colour still says which type it is.
          'max-sm:[&_[data-entry-type]]:mr-12 max-[380px]:[&_[data-entry-type]_svg]:hidden ' +
          'max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 ' +
          'max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none ' +
          'max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] ' +
          'max-sm:data-open:slide-in-from-bottom-10 max-sm:data-closed:slide-out-to-bottom-10'
        }
      >
        {/* The X floats over the top-right corner on every screen size. On a
            phone it used to take a row of its own above the type selector:
            ~56px of a full-screen form that then no longer fit (device run,
            2026-10-24). The selector keeps clear of it (`[data-entry-type]`
            margin above), and fields placed above the keyboard land below it
            (`usePlaceFieldsAboveKeyboard`). Translucent, so content scrolling
            under it stays legible. */}
        <button
          type="button"
          data-entry-close
          onClick={onClose}
          aria-label={ui('Close')}
          className="absolute top-5 right-4 z-20 flex size-9 items-center justify-center rounded-full bg-muted/80 text-foreground shadow-sm ring-1 ring-border/60 backdrop-blur-md transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:top-2 sm:right-2 sm:size-7 sm:bg-transparent sm:text-muted-foreground sm:shadow-none sm:ring-0 sm:backdrop-blur-none sm:hover:bg-muted"
        >
          <X className="size-5 sm:size-4" aria-hidden="true" />
        </button>
        {status !== undefined ? (
          <p role="status" aria-live="polite" className="sr-only">
            {status}
          </p>
        ) : null}
        {/* A new entry: screen-reader-only on a phone — the type selector and
            the AMOUNT label say what the sheet is, and `sr-only` keeps the
            dialog's accessible name. An edit: the title in the top row,
            clear of the X; its description stays for screen readers. */}
        <DialogHeader
          className={cn(
            titleOnPhone
              ? 'max-sm:mt-1 max-sm:min-h-10 max-sm:justify-center max-sm:pr-12 max-sm:text-left'
              : 'max-sm:sr-only'
          )}
        >
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription className={titleOnPhone ? 'max-sm:sr-only' : undefined}>
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {/* The scroller on mobile (see `overflow-clip` above). Edge to edge,
            so focus rings and the sticky action bar are not clipped. */}
        <div
          ref={scrollerRef}
          className="max-sm:-mx-4 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:px-4"
        >
          {children}
          <div ref={keyboardRoomRef} aria-hidden="true" className="shrink-0 sm:hidden" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
