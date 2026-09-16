'use client'

import { useEffect, type ReactNode } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'
import { useBackDismiss } from '@/lib/use-back-dismiss'
import { cn } from '@/lib/utils'

type SelectorSheetProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  /**
   * Where "up one level" goes when the sheet is drilled into a subview (a
   * category's subcategories, the inline create-account form). Given one, the
   * header shows a back chevron and Back/Escape step up instead of closing.
   */
  onBack?: () => void
  /**
   * The picker's search field. Rendered in a fixed strip under the header
   * rather than at the top of the scrolling list, so it stays put — and
   * visible — while the list scrolls and the keyboard is up.
   */
  search?: ReactNode
  children: ReactNode
}

/**
 * Mobile-only picker surface, shared by the transaction form's Account /
 * Category / Payee selectors and by the tag multi-select.
 *
 * Why a plain fixed overlay instead of vaul/Base-UI here: the transaction form
 * already lives inside a Base UI Dialog (a bottom sheet on mobile), which traps
 * focus and marks its siblings inert. A second modal portaled to <body> would
 * be a sibling of that dialog and get inert-ed — non-interactive. Rendering this
 * sheet *within* the dialog's subtree (no portal) keeps it inside the existing
 * focus trap, so its buttons and inputs stay clickable while still visually
 * covering the screen via `position: fixed`.
 *
 * Deliberately does NOT autofocus anything. The old inline picker auto-focused
 * its search input on open, which raised the soft keyboard and buried the list —
 * the exact UX bug this component replaces. The keyboard only appears when the
 * user taps the search field on purpose.
 */
export function SelectorSheet({
  open,
  onClose,
  title,
  onBack,
  search,
  children,
}: SelectorSheetProps) {
  const ui = useUiTranslation()

  // Android Back closes the sheet (or steps up a level) rather than leaving the
  // screen — the same thing the header chevron does, which is what makes this
  // read as a native picker instead of a page.
  useBackDismiss(open, () => {
    if (!onBack) {
      onClose()
      return false
    }
    onBack()
    // Still open, one level up: stay armed for the next press.
    return true
  })

  // Escape resolves here first (capture phase + stopPropagation), so it doesn't
  // also bubble up and dismiss the parent transaction dialog.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        if (onBack) onBack()
        else onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onBack, onClose])

  if (!open) return null

  return (
    // A full screen, not a bottom sheet that hugs its content. Hugging was fine
    // for a handful of accounts, but a real category or payee list is long: the
    // sheet grew to its max, the keyboard took half of what was left, and the
    // search box you were typing into scrolled out of the top. Picking a field
    // is its own task, so it gets its own screen — header fixed, search fixed
    // under it (see `search`), and only the list scrolls.
    <div
      role="dialog"
      aria-modal="true"
      // `h-dvh` and an opaque background on the *outer* box, not just the panel.
      // `inset-0` is not the screen here: the transaction dialog carries
      // `translate-x-0`/`translate-y-0` on mobile, and any `translate` other
      // than `none` makes an element a containing block for its `fixed`
      // descendants — so this sheet is measured against the dialog, which the
      // keyboard shortens. That left a band below the list showing the form
      // behind it. Sizing to the viewport and painting the whole box closes it
      // whatever the dialog's height turns out to be.
      className="vv-pin-screen fixed inset-0 z-[60] flex h-dvh flex-col bg-background sm:hidden"
    >
      <div
        className={cn(
          'relative flex h-full min-h-0 flex-col bg-background',
          'animate-in slide-in-from-bottom-4 duration-200'
        )}
      >
        <header className="flex shrink-0 items-center gap-1 border-b px-2 pb-2 pt-[max(0.375rem,env(safe-area-inset-top))]">
          {/* A full-size tap target in the header, not a small text link buried
              in the scrolling body: stepping back out of a subcategory list is
              the most repeated move in this sheet. */}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={ui('Back')}
              className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
          ) : null}
          <h2 className="min-w-0 flex-1 truncate px-1 font-heading text-base font-medium text-foreground">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={ui('Close')}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        {/* Fixed under the header, outside the scroller. This is the whole
            reason the sheet went full-screen: with the search inside the list,
            typing scrolled it away and you could not see what you had typed. */}
        {search ? (
          <div className="shrink-0 border-b px-3 py-2">{search}</div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {children}
        </div>
      </div>
    </div>
  )
}
