'use client'

import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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
  const [open, setOpen] = useState(true)

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      router.push(cancelHref)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={
          // Centered dialog on desktop; native-style bottom sheet on mobile.
          `max-h-[90dvh] overflow-y-auto ${wide ? 'sm:max-w-2xl' : 'sm:max-w-xl'} ` +
          'max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 ' +
          'max-sm:max-h-[92dvh] max-sm:rounded-t-2xl max-sm:rounded-b-none ' +
          'max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] ' +
          'max-sm:data-open:slide-in-from-bottom-10 max-sm:data-closed:slide-out-to-bottom-10'
        }
      >
        <div aria-hidden="true" className="mx-auto -mb-1 h-1.5 w-10 rounded-full bg-muted sm:hidden" />
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
