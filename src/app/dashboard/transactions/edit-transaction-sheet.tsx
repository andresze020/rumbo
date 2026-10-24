'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { EntrySheet } from '@/components/entry-sheet'
import { useUiTranslation } from '@/lib/i18n/use-ui-translation'

/**
 * Editing a transaction opens the same sheet as entering one (`EntrySheet`):
 * full screen on a phone, the floating X, one screen without scrolling, and
 * the keyboard handling. It used to be the generic `FormDialog`, a bottom
 * sheet that had none of that (user request, 2026-10-24). Closing goes back to
 * the list, like `FormDialog` did.
 */
export function EditTransactionSheet({
  title,
  description,
  cancelHref,
  children,
}: {
  title: string
  description?: string
  cancelHref: string
  children: ReactNode
}) {
  const ui = useUiTranslation()
  const router = useRouter()
  const [open, setOpen] = useState(true)

  function close() {
    setOpen(false)
    router.push(cancelHref)
  }

  return (
    <EntrySheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      onClose={close}
      title={ui(title)}
      description={description ? ui(description) : undefined}
      titleOnPhone
      initialFocus="sheet"
    >
      {children}
    </EntrySheet>
  )
}
