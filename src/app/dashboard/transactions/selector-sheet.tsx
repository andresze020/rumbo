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
  children: ReactNode
}

/**
 * Full-screen, mobile-only picker surface for the transaction form's
 * Account / Category / Payee selectors.
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
    // A bottom sheet that hugs its content instead of a full-screen surface:
    // short lists (a handful of accounts) leave no dead space, and the sheet
    // only grows to `max-h` when there are enough items to need scrolling. When
    // the user taps the search field the keyboard raises the sheet and the list
    // scrolls within its own max-height — the picker never gets buried.
    <div
      role="dialog"
      aria-modal="true"
      className="vv-pin-screen fixed inset-0 z-[60] flex flex-col justify-end sm:hidden"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 animate-in fade-in-0 duration-200"
        onClick={onClose}
      />

      <div
        className={cn(
          'relative flex max-h-[85dvh] flex-col rounded-t-2xl border-t bg-background',
          'animate-in slide-in-from-bottom-4 duration-200'
        )}
      >
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-muted-foreground/30"
        />

        <header className="flex items-center gap-1 border-b px-2 pb-2 pt-1.5">
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {children}
        </div>
      </div>
    </div>
  )
}
