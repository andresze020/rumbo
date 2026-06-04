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
        className={`overflow-y-auto max-h-[90dvh] ${wide ? 'sm:max-w-2xl' : 'sm:max-w-xl'}`}
      >
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
