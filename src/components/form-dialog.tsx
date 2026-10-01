'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'

export function FormDialog({
  title,
  description,
  cancelHref,
  children,
  wide = false,
}: {
  title: string
  description?: string
  cancelHref: string
  children: ReactNode
  wide?: boolean
}) {
  const router = useRouter()
  const ui = useUiTranslation()
  const [open, setOpen] = useState(true)
  const popupRef = useRef<HTMLDivElement>(null)

  /**
   * MQ-010: on a phone, a form with more than two fields opens with the sheet
   * focused, not its first field. Focusing a field raises the soft keyboard at
   * once; it took ~55% of the screen, and in Create debt only two fields were
   * left visible and the save button was not. The keyboard now appears when a
   * field is tapped. A one- or two-field form (a name, an amount) still goes
   * straight to its field. Desktop keeps the default: the first field.
   */
  function initialFocus() {
    const popup = popupRef.current
    if (!popup || !window.matchMedia('(max-width: 639.98px)').matches) return true
    const fields = [
      ...popup.querySelectorAll<HTMLElement>(
        'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select'
      ),
    ].filter((field) => field.getClientRects().length > 0)
    return fields.length > 2 ? popup : true
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      router.push(cancelHref)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={popupRef}
        initialFocus={initialFocus}
        className={
          // Centered dialog on desktop; native-style bottom sheet on mobile.
          //
          // `translate-none`, not `translate-x-0 translate-y-0`: a zero
          // translate is still a `translate`, and any value but `none` makes
          // the sheet the containing block of its `fixed` descendants. The
          // full-screen pickers inside it (SearchablePicker → SelectorSheet,
          // MQ-008) then sized themselves to this half-height sheet and ran off
          // the bottom of the screen instead of covering it.
          `max-h-[90dvh] overflow-y-auto ${wide ? 'sm:max-w-2xl' : 'sm:max-w-xl'} ` +
          // `form-sheet`: see globals.css — sticky actions and the keyboard (MQ-010).
          'form-sheet ' +
          'max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-full max-sm:translate-none ' +
          'max-sm:max-h-[92dvh] max-sm:rounded-t-2xl max-sm:rounded-b-none ' +
          'max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] ' +
          'max-sm:data-open:slide-in-from-bottom-10 max-sm:data-closed:slide-out-to-bottom-10'
        }
      >
        <div aria-hidden="true" className="mx-auto -mb-1 h-1.5 w-10 rounded-full bg-muted sm:hidden" />
        <DialogHeader>
          <DialogTitle>{ui(title)}</DialogTitle>
          {description ? (
            <DialogDescription>{ui(description)}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
